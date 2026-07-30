// Where-clause composition for the postings list (app/page.tsx). Three independent filter
// dimensions read off the URL: `?band=`, `?cat=` and `?posted=`.
//
// The whole reason this lives in one tested module: each dimension's tab counts must be computed
// against the OTHER TWO active dimensions, never against itself, or the numbers on the tabs
// disagree with the rows listed underneath them. That is a silent wrong-number bug, not a crash,
// so the composition is built here once and asserted in postings-filter.test.ts.

import type { Prisma } from "@prisma/client"

export const BANDS = ["all", "high", "medium", "low", "unknown"] as const
export type BandKey = (typeof BANDS)[number]

/**
 * Preset posted-date windows for the `?posted=` tabs. `days` is a count of calendar days in UTC
 * ending with today, so "Last 7 days" is today plus the six days before it.
 */
export const POSTED_WINDOWS = [
  { key: "any", label: "Any date", days: null },
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
] as const
export type PostedWindowKey = (typeof POSTED_WINDOWS)[number]["key"]

const POSTED_KEYS: readonly string[] = POSTED_WINDOWS.map((w) => w.key)

/** Rows per page on the postings list. */
export const PAGE_SIZE = 50

export function parseBand(raw: string | null | undefined): BandKey {
  return (BANDS as readonly string[]).includes(raw ?? "") ? (raw as BandKey) : "all"
}

/** `?page=` parsed to a 1-based page number; anything that is not a positive integer means 1. */
export function parsePage(raw: string | null | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/**
 * The postings list's sort order. `workbcId` is the unique tiebreaker: without it, rows sharing a
 * score and title have no defined order, so they could appear on two pages (or neither) as the
 * database shuffles ties between the per-page queries. Tests interpret this constant, so its
 * shape is pinned there.
 */
export const POSTINGS_ORDER_BY = [
  { fraudScore: "desc" },
  { title: "asc" },
  { workbcId: "asc" },
] satisfies Prisma.JobOrderByWithRelationInput[]

/** skip/take for a 1-based page. Pages tile the ordered rows: no overlap, no gaps. */
export function pageArgs(page: number, pageSize: number = PAGE_SIZE): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize }
}

export function parsePostedWindow(raw: string | null | undefined): PostedWindowKey {
  return POSTED_KEYS.includes(raw ?? "") ? (raw as PostedWindowKey) : "any"
}

/** Start of the UTC day containing `now`. */
function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** Inclusive lower bound of an N-calendar-day window ending on the day containing `now`. */
export function windowCutoff(days: number, now: Date): Date {
  return new Date(startOfUtcDay(now).getTime() - (days - 1) * 86_400_000)
}

/**
 * The posted-date window clause. Rows with a parsed `postedDate` are compared against it directly
 * (indexed); rows without one fall back to `scrapedAt` so nothing silently vanishes from a window
 * just because its raw `postedAt` was unparseable. The UI marks those rows as estimates
 * (lib/shared/posted-date.ts).
 */
export function postedWindowWhere(key: PostedWindowKey, now: Date): Prisma.JobWhereInput {
  const win = POSTED_WINDOWS.find((w) => w.key === key)
  if (!win || win.days === null) return {}
  const cutoff = windowCutoff(win.days, now)
  return {
    OR: [{ postedDate: { gte: cutoff } }, { postedDate: null, scrapedAt: { gte: cutoff } }],
  }
}

/** Only judged postings are ever listed; `scoredAt === null` means still pending. */
export const JUDGED_ONLY: Prisma.JobWhereInput = { scoredAt: { not: null } }

export type PostingsQuery = {
  band: BandKey
  cat: string
  posted: PostedWindowKey
  /** The rows actually listed: every active dimension applied. */
  rowsWhere: Prisma.JobWhereInput
  /** For the band groupBy: every dimension EXCEPT band. */
  bandCountWhere: Prisma.JobWhereInput
  /** For the category groupBy: every dimension EXCEPT category. */
  catCountWhere: Prisma.JobWhereInput
  /** Per posted-window counts: every dimension EXCEPT the posted window being counted. */
  postedCountWhere: Record<PostedWindowKey, Prisma.JobWhereInput>
}

/**
 * Compose every where-clause the postings page needs from the three URL params. `cat` is passed
 * through already validated against CATEGORIES by the caller ("all" for no category filter).
 */
export function buildPostingsQuery(input: {
  band: BandKey
  cat: string
  posted: PostedWindowKey
  now: Date
}): PostingsQuery {
  const { band, cat, posted, now } = input

  const bandWhere: Prisma.JobWhereInput = band === "all" ? {} : { riskBand: band }
  const catWhere: Prisma.JobWhereInput = cat === "all" ? {} : { category: cat }
  const postedWhere = postedWindowWhere(posted, now)

  const postedCountWhere = Object.fromEntries(
    POSTED_WINDOWS.map((w) => [
      w.key,
      { ...JUDGED_ONLY, ...bandWhere, ...catWhere, ...postedWindowWhere(w.key, now) },
    ]),
  ) as Record<PostedWindowKey, Prisma.JobWhereInput>

  return {
    band,
    cat,
    posted,
    rowsWhere: { ...JUDGED_ONLY, ...bandWhere, ...catWhere, ...postedWhere },
    bandCountWhere: { ...JUDGED_ONLY, ...catWhere, ...postedWhere },
    catCountWhere: { ...JUDGED_ONLY, ...bandWhere, ...postedWhere },
    postedCountWhere,
  }
}
