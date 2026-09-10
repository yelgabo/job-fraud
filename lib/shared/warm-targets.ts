/**
 * The public pages POST /api/revalidate re-warms after clearing the data cache, so the first
 * visitor to a common filter combination does not pay the cold queries.
 *
 * Selection: page 1 of each risk band tab, page 1 of each posted-window tab, and the unfiltered
 * first pages of `/` and `/companies`. Deliberately NOT the band x category x posted cross
 * product, later pages, or `/analysis` - warming every combination would recreate the very load
 * burst the cache exists to absorb. Anything not listed here simply loads cold for its first
 * visitor and cached for the rest, exactly as before.
 *
 * Kept as one flat literal so the whole warmed surface is reviewable at a glance, and bounded by
 * MAX_WARM_PATHS (asserted in warm-targets.test.ts) so additions stay deliberate.
 */
export const WARM_PATHS: readonly string[] = [
  "/", // unfiltered home = band "all" + posted "any", page 1
  "/?band=high",
  "/?band=medium",
  "/?band=low",
  "/?posted=7",
  "/?posted=30",
  "/?posted=90",
  "/companies",
]

/** Hard cap on how many URLs one warm cycle may touch. */
export const MAX_WARM_PATHS = 15
