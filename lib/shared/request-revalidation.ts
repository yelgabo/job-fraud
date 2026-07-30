const DEFAULT_ENDPOINT = "https://job-fraud-production.up.railway.app/api/revalidate"

/**
 * Ask the deployed site to refresh its public caches now (POST /api/revalidate) instead of
 * waiting out the 600 s revalidation window. Called by the write-side CLI scripts at the end of
 * a successful run.
 *
 * Best-effort by design: the timed revalidation is the backstop, so a data run must never fail
 * on this. Every failure path logs one warning line and returns. The token is never printed.
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
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      // The endpoint warms the common filter combos inline before responding (sequential page
      // renders against a freshly cleared cache), so allow well beyond a bare revalidate.
      signal: AbortSignal.timeout(120_000),
    })
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { warmed?: number; warmFailed?: number } | null
      const warmNote =
        typeof body?.warmed === "number" ? `, warmed ${body.warmed} pages${body.warmFailed ? ` (${body.warmFailed} failed)` : ""}` : ""
      console.log(`[revalidate] site caches refreshed${warmNote}`)
    }
    else console.warn(`[revalidate] warning: ${url} responded ${res.status}; the site refreshes on its 600s timer instead`)
  } catch (err) {
    console.warn(
      `[revalidate] warning: could not reach ${url} (${(err as Error).message}); the site refreshes on its 600s timer instead`,
    )
  }
}
