const DEFAULT_ENDPOINT = "https://job-fraud-production.up.railway.app/api/revalidate"

/**
 * Ask the deployed site to refresh its public caches now instead of waiting out the 600 s
 * revalidation window. Called by the write-side CLI scripts at the end of a successful run.
 *
 * Two sequential requests, because Next.js only executes revalidateTag/revalidatePath after the
 * handling request resolves, so warming must arrive as a fresh request once the purge response
 * is back (details in app/api/revalidate/route.ts):
 *
 *   1. POST /api/revalidate             purge (short 10 s timeout, it does no rendering)
 *   2. POST /api/revalidate?phase=warm  warm WARM_PATHS (long 120 s timeout, sequential renders)
 *
 * Best-effort by design: the timed revalidation is the backstop, so a data run must never fail
 * on this. If the purge fails, the warm phase is skipped (warming an unpurged cache is
 * pointless). Every failure path logs one warning line and returns. The token is never printed.
 *
 * Env: REVALIDATE_TOKEN (skipped with a note when unset - the endpoint would deny anyway) and
 * REVALIDATE_URL to point somewhere other than production (e.g. a local dev server).
 */
export async function requestRevalidation(): Promise<void> {
  const token = process.env.REVALIDATE_TOKEN
  if (!token) {
    console.log("[revalidate] REVALIDATE_TOKEN not set; the site refreshes on its 600s timer instead")
    return
  }
  const url = process.env.REVALIDATE_URL || DEFAULT_ENDPOINT
  const headers = { authorization: `Bearer ${token}` }

  try {
    const res = await fetch(url, { method: "POST", headers, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      console.warn(`[revalidate] warning: ${url} responded ${res.status}; the site refreshes on its 600s timer instead`)
      return
    }
    console.log("[revalidate] site caches refreshed")
  } catch (err) {
    console.warn(
      `[revalidate] warning: could not reach ${url} (${(err as Error).message}); the site refreshes on its 600s timer instead`,
    )
    return
  }

  const warmUrl = new URL(url)
  warmUrl.searchParams.set("phase", "warm")
  try {
    const res = await fetch(warmUrl, { method: "POST", headers, signal: AbortSignal.timeout(120_000) })
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { warmed?: number; warmFailed?: number } | null
      const counts =
        typeof body?.warmed === "number" ? `${body.warmed} pages${body.warmFailed ? ` (${body.warmFailed} failed)` : ""}` : "done"
      console.log(`[revalidate] warmed ${counts}`)
    }
    else console.warn(`[revalidate] warning: warm phase responded ${res.status}; pages warm on first visit instead`)
  } catch (err) {
    console.warn(`[revalidate] warning: warm phase failed (${(err as Error).message}); pages warm on first visit instead`)
  }
}
