import { revalidatePath, revalidateTag } from "next/cache"
// Relative imports (not "@/...") so the colocated route.test.ts resolves them under vitest's
// default config, which does not read tsconfig path aliases.
import { webEnv } from "../../../lib/env"
import { DATA_CACHE_TAG } from "../../../lib/shared/cache-tags"
import { WARM_PATHS, replicaId, warmOrigin } from "../../../lib/shared/warm-targets"
import { tokenMatches } from "../../../lib/shared/token-match"

/**
 * Bearer-token gate shared by every phase, following the AUDIT_TOKEN pattern: when the env var
 * is unset, every request is denied (deny by default).
 */
function authorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? ""
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : ""
  return Boolean(webEnv.REVALIDATE_TOKEN && given && tokenMatches(given, webEnv.REVALIDATE_TOKEN))
}

/**
 * Re-warm the common filter combinations after the caches were cleared, so the first visitor to
 * each does not pay the cold queries. Sequential on purpose: one in-flight page render at a time
 * means a warm cycle can never stampede the database - it looks like a single fast visitor
 * clicking through WARM_PATHS. Best-effort throughout: a failed or slow path is logged and
 * skipped, and the endpoint still returns 200.
 */
async function warmCaches(origin: string) {
  const timings: { path: string; ms: number; ok: boolean }[] = []
  for (const path of WARM_PATHS) {
    const started = Date.now()
    let ok = false
    try {
      const res = await fetch(new URL(path, origin), {
        // no-store on the outer fetch: the point is to run the page render (re-priming its
        // unstable_cache entries), not to cache this response.
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      })
      ok = res.ok
      if (!ok) console.warn(`[warm] ${path} responded ${res.status}`)
    } catch (err) {
      console.warn(`[warm] ${path} failed: ${(err as Error).message}`)
    }
    timings.push({ path, ms: Date.now() - started, ok })
  }
  return timings
}

function warmSummary(timings: Awaited<ReturnType<typeof warmCaches>>) {
  return {
    warmed: timings.filter((t) => t.ok).length,
    warmFailed: timings.filter((t) => !t.ok).length,
    timings,
  }
}

/**
 * The list/aggregate pages ('/', '/companies', '/analysis') cache at the data layer under one
 * shared tag; the per-URL ISR pages are marked stale across all their instances by passing the
 * route pattern with the explicit 'page' type (required for dynamic routes - see
 * node_modules/next/dist/server/web/spec-extension/revalidate.js).
 */
function queuePurge() {
  revalidateTag(DATA_CACHE_TAG)
  revalidatePath("/j/[id]", "page")
  revalidatePath("/e/[id]", "page")
}

/**
 * POST /api/revalidate - refresh every public cached surface of the replica that serves the
 * request, instead of waiting out the 600 s revalidation window. Called by the write-side CLI
 * scripts through lib/shared/request-revalidation.ts, which repeats the call until it has seen
 * every replica; the timer remains the backstop.
 *
 * Next.js defers revalidateTag/revalidatePath issued inside a route handler: they only queue the
 * tags, and the purge runs when the handler resolves (executeRevalidates in
 * node_modules/next/dist/server/route-modules/app-route/module.js). A warm inside the purging
 * request would render against the old cache. So this handler purges through a loopback request
 * to its own process (`?phase=purge`) and then warms through loopback too. In Next 15.5 the
 * queued tag expiry is written synchronously as that inner handler resolves, before its response
 * is sent, so the warm renders that follow see the cleared cache. Loopback reaches this same process, so purge and warm
 * always hit the same replica's cache; going through the public domain would let the load
 * balancer split them across replicas. This handler must not queue a purge itself, or the purge
 * would land after the warm and wipe it.
 *
 *   POST /api/revalidate              purge + warm this replica, responds { revalidated, replica, warmed, ... }
 *   POST /api/revalidate?phase=purge  purge only (the loopback step above)
 *   POST /api/revalidate?phase=warm   warm only, kept for callers built before the combined call
 */
export async function POST(req: Request) {
  const replica = replicaId()
  if (!authorized(req)) {
    return Response.json({ revalidated: false }, { status: 401 })
  }

  const phase = new URL(req.url).searchParams.get("phase")
  if (phase === "purge") {
    queuePurge()
    return Response.json({ revalidated: true, replica })
  }
  if (phase === "warm") {
    return Response.json({ replica, ...warmSummary(await warmCaches(warmOrigin())) })
  }

  const origin = warmOrigin()
  try {
    const purge = await fetch(new URL("/api/revalidate?phase=purge", origin), {
      method: "POST",
      headers: { authorization: req.headers.get("authorization") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!purge.ok) {
      console.warn(`[revalidate] loopback purge responded ${purge.status}`)
      return Response.json({ revalidated: false, replica }, { status: 502 })
    }
  } catch (err) {
    console.warn(`[revalidate] loopback purge failed: ${(err as Error).message}`)
    return Response.json({ revalidated: false, replica }, { status: 502 })
  }

  return Response.json({ revalidated: true, replica, ...warmSummary(await warmCaches(origin)) })
}
