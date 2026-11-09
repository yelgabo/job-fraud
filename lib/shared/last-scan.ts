import type { Prisma } from "@prisma/client"

/**
 * When the site last scanned WorkBC, for the home page header. A finished ScrapeRun (OK or
 * PARTIAL) is the direct record and wins whenever one exists. Before the first one, the date is
 * read off the rows: scrapedAt is set only when a posting is first inserted, so on its own it
 * moves only when a new posting arrives, and fetchedAt is stamped on every detail fetch but only
 * since 2026-11-08, so the later of the two maxima stands in.
 */
export function lastScanAt(scan: {
  latestRunFinishedAt: Date | null
  maxScrapedAt: Date | null
  maxFetchedAt: Date | null
}): Date | null {
  if (scan.latestRunFinishedAt) return scan.latestRunFinishedAt
  const { maxScrapedAt, maxFetchedAt } = scan
  if (!maxScrapedAt) return maxFetchedAt
  if (!maxFetchedAt) return maxScrapedAt
  return maxFetchedAt > maxScrapedAt ? maxFetchedAt : maxScrapedAt
}

/** The ScrapeRun query lastScanAt's latestRunFinishedAt comes from. A FAILED run scanned nothing. */
export const LATEST_FINISHED_SCRAPE = {
  where: { outcome: { in: ["OK", "PARTIAL"] }, finishedAt: { not: null } },
  orderBy: { finishedAt: "desc" },
  select: { finishedAt: true },
} satisfies Prisma.ScrapeRunFindFirstArgs
