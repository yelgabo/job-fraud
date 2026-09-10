// Ordering for the /companies list. The page aggregates judged postings per employer in the
// database (groupBy), orders the small aggregate list here, and only then fetches full employer
// rows for the one page being shown, so the heavy per-employer data stays bounded by the page
// size no matter how large the corpus grows.

/** One employer's judged-postings aggregate: its worst posting score and how many it has. */
export type EmployerAgg = {
  employerId: string
  /** Highest fraudScore across the employer's judged postings; -1 when none carry a score. */
  worst: number
  count: number
}

/**
 * Most suspicious first (highest single posting score), then by posting count. `employerId` is
 * the unique tiebreaker: without it employers sharing worst+count have no defined order and
 * could straddle a page boundary inconsistently between renders. Returns a sorted copy.
 */
export function orderEmployerAggs(aggs: readonly EmployerAgg[]): EmployerAgg[] {
  return [...aggs].sort(
    (a, b) => b.worst - a.worst || b.count - a.count || a.employerId.localeCompare(b.employerId),
  )
}
