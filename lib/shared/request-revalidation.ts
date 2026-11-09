const DEFAULT_ENDPOINT = "https://job-fraud-production.up.railway.app/api/revalidate"

// The web service runs 2 replicas since 2026-10-27 (docs/launch-runbook.md). Railway does not
// tell a client how many there are, so REVALIDATE_REPLICAS overrides this after a rescale.
const DEFAULT_REPLICAS = 2

// Each call that lands on an already-refreshed replica costs one purge and a warm cycle on it.
// On 2026-11-09 the first four of five calls reached the same replica. fetch reuses its socket,
// and a balancer that routes per connection keeps a reused socket on one replica, so every call
// now opens its own connection. At random, ten calls miss one of two replicas 1 time in 512.
export const MAX_ATTEMPTS = 10

type RevalidateBody = { revalidated?: boolean; replica?: string; warmed?: number; warmFailed?: number }

function expectedReplicas(): number {
  const n = Number(process.env.REVALIDATE_REPLICAS)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_REPLICAS
}

/**
 * Ask the deployed site to refresh its public caches now instead of waiting out the 600 s
 * revalidation window. Called by the write-side CLI scripts at the end of a successful run, and
 * by the audit page after a rerun.
 *
 * One POST /api/revalidate purges and re-warms the replica that serves it and names that replica
 * (app/api/revalidate/route.ts). Every replica keeps its own cache and the load balancer picks
 * one per request, so this repeats the call until it has seen the expected number of distinct
 * replicas or made MAX_ATTEMPTS calls.
 *
 * Best-effort by design: the timed revalidation is the backstop, so a data run must never fail
 * on this. Every failure path logs one warning line and returns; nothing here throws. The token
 * is never printed.
 *
 * Env: REVALIDATE_TOKEN (skipped with a note when unset - the endpoint would deny anyway),
 * REVALIDATE_URL to point somewhere other than production (e.g. a local dev server), and
 * REVALIDATE_REPLICAS when the replica count is not 2.
 */
export async function requestRevalidation(): Promise<void> {
  try {
    await refreshReplicas()
  } catch (err) {
    console.warn(`[revalidate] warning: ${(err as Error).message}; the site refreshes on its 600s timer instead`)
  }
}

async function refreshReplicas(): Promise<void> {
  const token = process.env.REVALIDATE_TOKEN
  if (!token) {
    console.log("[revalidate] REVALIDATE_TOKEN not set; the site refreshes on its 600s timer instead")
    return
  }
  const url = process.env.REVALIDATE_URL || DEFAULT_ENDPOINT
  const want = expectedReplicas()
  const seen = new Set<string>()
  let attempts = 0

  while (seen.size < want && attempts < MAX_ATTEMPTS) {
    attempts++
    let res: Response
    try {
      // Purge plus eight sequential page renders, each capped at 15 s on the server.
      res = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, connection: "close" },
        signal: AbortSignal.timeout(150_000),
      })
    } catch (err) {
      console.warn(`[revalidate] warning: could not reach ${url} (${(err as Error).message})`)
      break
    }
    if (res.status === 401 || res.status === 403) {
      console.warn(`[revalidate] warning: ${url} responded ${res.status}; check REVALIDATE_TOKEN`)
      break
    }
    const body = (await res.json().catch(() => null)) as RevalidateBody | null
    const replica = body?.replica
    if (!res.ok) {
      console.warn(`[revalidate] warning: ${url} responded ${res.status} from replica ${replica ?? "unknown"}`)
      continue
    }
    if (!replica) {
      console.warn("[revalidate] warning: the site did not name its replica (a deploy older than this script?)")
      break
    }
    const fresh = !seen.has(replica)
    seen.add(replica)
    const failed = body?.warmFailed ? `, ${body.warmFailed} failed` : ""
    console.log(
      `[revalidate] call ${attempts}: replica ${replica}${fresh ? "" : " again"} purged, warmed ${body?.warmed ?? "?"} pages${failed}`,
    )
  }

  const list = [...seen].join(", ") || "none"
  if (seen.size >= want) {
    console.log(`[revalidate] site caches refreshed on ${seen.size} replicas (${list}) in ${attempts} calls`)
  } else {
    console.warn(
      `[revalidate] warning: refreshed ${seen.size} of ${want} replicas (${list}) in ${attempts} calls; the rest refresh on their 600s timer`,
    )
  }
}
