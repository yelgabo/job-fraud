// The pure half of the `postedDate` backfill (scripts/backfill-posted-date.ts): argument parsing
// and "what would this run change?". Kept out of the script so it can be unit-tested without a
// database client, and so a dry run and a real run provably plan the same writes.

import { parsePostedDate } from "./posted-date"

export type BackfillArgs = {
  /** False (dry run) unless --apply is passed. Dry run is the default on purpose. */
  apply: boolean
  limit: number | null
  /** How many unparseable raw values to print. */
  samples: number
}

const DEFAULT_SAMPLES = 20

function numFlag(argv: string[], flag: string): number | null {
  const i = argv.indexOf(flag)
  if (i < 0) return null
  const n = Number(argv[i + 1])
  return Number.isFinite(n) && n > 0 ? n : null
}

export function parseBackfillArgs(argv: string[]): BackfillArgs {
  return {
    apply: argv.includes("--apply"),
    limit: numFlag(argv, "--limit"),
    samples: numFlag(argv, "--samples") ?? DEFAULT_SAMPLES,
  }
}

export type BackfillRow = { workbcId: string; postedAt: string | null; postedDate: Date | null }

export type BackfillPlan = {
  total: number
  /** Rows whose raw `postedAt` is null. */
  nullRaw: number
  /** Rows whose raw `postedAt` yielded an unambiguous calendar date. */
  parsed: number
  /** Rows with a non-null `postedAt` that does not parse; these keep `postedDate = null`. */
  unparseable: Array<{ workbcId: string; postedAt: string }>
  /** Rows whose stored `postedDate` already equals the parse result. */
  unchanged: number
  writes: Array<{ workbcId: string; postedDate: Date | null }>
}

/** Decide, without writing anything, what a backfill run would do to these rows. */
export function planBackfill(rows: BackfillRow[]): BackfillPlan {
  const plan: BackfillPlan = {
    total: rows.length,
    nullRaw: 0,
    parsed: 0,
    unparseable: [],
    unchanged: 0,
    writes: [],
  }

  for (const row of rows) {
    if (row.postedAt === null) plan.nullRaw++
    const next = parsePostedDate(row.postedAt)
    if (next) plan.parsed++
    else if (row.postedAt !== null) {
      plan.unparseable.push({ workbcId: row.workbcId, postedAt: row.postedAt })
    }

    const stored = row.postedDate
    const same =
      next === null ? stored === null : stored !== null && stored.getTime() === next.getTime()
    if (same) plan.unchanged++
    else plan.writes.push({ workbcId: row.workbcId, postedDate: next })
  }

  return plan
}

/**
 * Collapse per-row writes into one group per distinct target date so the apply step can use a
 * handful of `updateMany` calls instead of one `update` per posting.
 */
export function groupWrites(
  writes: Array<{ workbcId: string; postedDate: Date | null }>,
): Array<{ postedDate: Date | null; workbcIds: string[] }> {
  const groups = new Map<string, { postedDate: Date | null; workbcIds: string[] }>()
  for (const w of writes) {
    const key = w.postedDate === null ? "null" : w.postedDate.toISOString()
    const g = groups.get(key) ?? { postedDate: w.postedDate, workbcIds: [] }
    g.workbcIds.push(w.workbcId)
    groups.set(key, g)
  }
  return [...groups.values()]
}
