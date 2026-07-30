// Posting-lifecycle state derived from `Job.lastSeenAt` (when a scrape last saw the workbcId in
// WorkBC's search results). Captain decision 2026-07-30 on retention: an expired posting stays
// fully listed, only visually muted - no dropping, no archive filter.
//
// Two rules keep the published "no longer listed" claim honest:
//
// 1. Null `lastSeenAt` means "not yet tracked", never "expired". Rows scraped before sighting
//    tracking shipped have no sighting history, so nothing can be claimed about them either way.
// 2. Expiry is measured against the corpus-wide latest sighting (`max(lastSeenAt)`), not the
//    wall clock. "No longer listed" is only supportable when newer scrape data exists that did
//    not include the posting; if scraping stops, nothing drifts into "expired" while we simply
//    were not looking.

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
 * Bulk-stamp `lastSeenAt` on every already-known posting among `workbcIds`. Ids not in the
 * database simply do not match; the scrape's upsert gives new rows the same stamp. Returns the
 * number of rows stamped.
 */
export async function stampSightings(db: SightingDb, workbcIds: string[], seenAt: Date): Promise<number> {
  if (workbcIds.length === 0) return 0
  const { count } = await db.job.updateMany({
    where: { workbcId: { in: workbcIds } },
    data: { lastSeenAt: seenAt },
  })
  return count
}
