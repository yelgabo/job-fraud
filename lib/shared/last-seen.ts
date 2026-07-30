// Posting-lifecycle state derived from `Job.lastSeenAt` (when a scrape last saw the workbcId in
// WorkBC's search results). Captain decision 2026-07-30 on retention: an expired posting stays
// fully listed, only visually muted - no dropping, no archive filter.
//
// Three rules keep the published "no longer listed" claim honest:
//
// 1. Null `lastSeenAt` means "not yet tracked", never "expired". Rows scraped before sighting
//    tracking shipped have no sighting history, so nothing can be claimed about them either way.
// 2. Expiry is measured against the corpus-wide latest sighting (`max(lastSeenAt)`), not the
//    wall clock. "No longer listed" is only supportable when newer scrape data exists that did
//    not include the posting; if scraping stops, nothing drifts into "expired" while we simply
//    were not looking.
// 3. Only an exhaustive enumeration may write `lastSeenAt` at all (captain decision 2026-07-30).
//    A partial run (a `--recent` window, a collection truncated by the stub cap, or a scope
//    narrower than the full corpus) proves nothing about postings it never asked WorkBC for.
//    If it stamped, it would advance the `max(lastSeenAt)` reference while freezing every
//    posting outside its window, eventually presenting still-listed postings as expired. So a
//    partial run writes `lastSeenAt` nowhere: `stampSightings` refuses it, and the scrape omits
//    the field from its upserts (`scripts/scrape.ts`).

/**
 * Days a posting may go unseen (relative to the newest sighting anywhere in the corpus) before
 * it is presented as no longer listed. The scheduled scrape sweeps weekly (`scrape.yml`, Monday
 * cron), so 14 days means a posting must be absent from two consecutive weekly sweeps: one
 * delayed, partial or failed run can never expire anything on its own.
 */
export const EXPIRY_DAYS = 14

const DAY_MS = 86_400_000

/**
 * Whether a posting should be presented as no longer listed on WorkBC. `latestSeenAt` is the
 * corpus-wide `max(lastSeenAt)` reference point; when either date is missing there is no basis
 * for the claim, so the answer is false.
 */
export function isExpired(lastSeenAt: Date | null, latestSeenAt: Date | null): boolean {
  if (!lastSeenAt || !latestSeenAt) return false
  return latestSeenAt.getTime() - lastSeenAt.getTime() > EXPIRY_DAYS * DAY_MS
}

/**
 * What a scrape run actually enumerated, reported by `scripts/scrape.ts`. The corpus has two
 * scopes - the configured search terms across all of BC, plus the city-wide Victoria sweep -
 * and a run covers the corpus only when it enumerates both, uncapped and unwindowed.
 */
export type ScrapeEnumeration = {
  /** True when `--recent` restricted the search server-side to recently-posted jobs. */
  recentFilter: boolean
  /** True when stub collection stopped at the `--limit`/default target cap. */
  truncated: boolean
  /** True when the configured term set ran with no city filter (all of BC). */
  bcWideTermScope: boolean
  /** True when the run swept every posting in Victoria (blank keyword + city filter). */
  victoriaCityScope: boolean
}

/**
 * Whether a run's enumeration provably included every currently-listed posting in the corpus
 * scope. Only such a run may write `lastSeenAt` (rule 3 above). No current scheduled or default
 * run qualifies: the weekly cron passes use `--recent` or a city scope, and a bare
 * `npm run scrape` caps at 50 stubs. Expiry therefore stays dormant until a deliberate
 * exhaustive sweep runs, which is the intended behavior.
 */
export function isExhaustiveEnumeration(e: ScrapeEnumeration): boolean {
  return !e.recentFilter && !e.truncated && e.bcWideTermScope && e.victoriaCityScope
}

/** The subset of the Prisma client `stampSightings` needs, so tests can pass a plain mock. */
type SightingDb = {
  job: {
    updateMany(args: {
      where: { workbcId: { in: string[] } }
      data: { lastSeenAt: Date }
    }): Promise<{ count: number }>
  }
}

/**
 * Bulk-stamp `lastSeenAt` on every already-known posting among `workbcIds`, but only when the
 * run's enumeration was exhaustive: a partial run gets `null` back and no write happens (rule 3
 * above). Ids not in the database simply do not match; the scrape's upsert gives new rows the
 * same stamp. Returns the number of rows stamped.
 */
export async function stampSightings(
  db: SightingDb,
  enumeration: ScrapeEnumeration,
  workbcIds: string[],
  seenAt: Date,
): Promise<number | null> {
  if (!isExhaustiveEnumeration(enumeration)) return null
  if (workbcIds.length === 0) return 0
  const { count } = await db.job.updateMany({
    where: { workbcId: { in: workbcIds } },
    data: { lastSeenAt: seenAt },
  })
  return count
}
