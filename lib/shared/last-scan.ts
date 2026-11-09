/**
 * When the site last scanned WorkBC, for the home page header. scrapedAt is set only when a
 * posting is first inserted, so on its own it moves only when a new posting arrives. fetchedAt
 * is stamped on every detail fetch, but only since it was added (2026-11-08), so rows fetched
 * before then have none. The later of the two maxima is right both before and after the next scrape.
 */
export function lastScanAt(maxScrapedAt: Date | null, maxFetchedAt: Date | null): Date | null {
  if (!maxScrapedAt) return maxFetchedAt
  if (!maxFetchedAt) return maxScrapedAt
  return maxFetchedAt > maxScrapedAt ? maxFetchedAt : maxScrapedAt
}
