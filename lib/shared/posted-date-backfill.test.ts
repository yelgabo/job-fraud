import { describe, expect, it } from "vitest"
import {
  groupWrites,
  parseBackfillArgs,
  planBackfill,
  type BackfillRow,
} from "./posted-date-backfill"

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe("parseBackfillArgs", () => {
  it("dry-runs by default so a bare invocation cannot write to production", () => {
    expect(parseBackfillArgs([]).apply).toBe(false)
    expect(parseBackfillArgs(["--limit", "10"]).apply).toBe(false)
    expect(parseBackfillArgs(["--dry-run"]).apply).toBe(false)
  })

  it("writes only when --apply is passed explicitly", () => {
    expect(parseBackfillArgs(["--apply"]).apply).toBe(true)
  })

  it("reads --limit and --samples, ignoring missing or nonsense values", () => {
    expect(parseBackfillArgs(["--limit", "250"]).limit).toBe(250)
    expect(parseBackfillArgs([]).limit).toBeNull()
    expect(parseBackfillArgs(["--limit"]).limit).toBeNull()
    expect(parseBackfillArgs(["--limit", "nope"]).limit).toBeNull()
    expect(parseBackfillArgs(["--limit", "0"]).limit).toBeNull()
    expect(parseBackfillArgs([]).samples).toBe(20)
    expect(parseBackfillArgs(["--samples", "3"]).samples).toBe(3)
  })
})

describe("planBackfill", () => {
  it("parses both producer formats", () => {
    const rows: BackfillRow[] = [
      { workbcId: "api", postedAt: "2026-07-19", postedDate: null },
      { workbcId: "html", postedAt: "July 24, 2026", postedDate: null },
    ]
    const plan = planBackfill(rows)
    expect(plan.parsed).toBe(2)
    expect(plan.unparseable).toEqual([])
    expect(plan.writes).toEqual([
      { workbcId: "api", postedDate: day("2026-07-19") },
      { workbcId: "html", postedDate: day("2026-07-24") },
    ])
  })

  it("counts a null raw postedAt separately and plans no date for it", () => {
    const plan = planBackfill([{ workbcId: "n", postedAt: null, postedDate: null }])
    expect(plan.nullRaw).toBe(1)
    expect(plan.parsed).toBe(0)
    expect(plan.unparseable).toEqual([])
    // already null in the column, so there is nothing to write
    expect(plan.writes).toEqual([])
    expect(plan.unchanged).toBe(1)
  })

  it("reports junk as unparseable and leaves it null rather than guessing", () => {
    const rows: BackfillRow[] = [
      { workbcId: "j1", postedAt: "n/a", postedDate: null },
      { workbcId: "j2", postedAt: "2 days ago", postedDate: null },
      { workbcId: "j3", postedAt: "07/24/2026", postedDate: null },
      { workbcId: "j4", postedAt: "2026-02-30", postedDate: null },
    ]
    const plan = planBackfill(rows)
    expect(plan.parsed).toBe(0)
    expect(plan.unparseable.map((u) => u.workbcId)).toEqual(["j1", "j2", "j3", "j4"])
    expect(plan.writes).toEqual([])
    expect(plan.unchanged).toBe(4)
  })

  it("clears a stale postedDate when the raw value stopped parsing", () => {
    const plan = planBackfill([{ workbcId: "s", postedAt: "n/a", postedDate: day("2026-07-19") }])
    expect(plan.writes).toEqual([{ workbcId: "s", postedDate: null }])
    expect(plan.unchanged).toBe(0)
  })

  it("is idempotent: a second run over already-correct rows plans no writes", () => {
    const rows: BackfillRow[] = [
      { workbcId: "a", postedAt: "2026-07-19", postedDate: day("2026-07-19") },
      { workbcId: "b", postedAt: "bogus", postedDate: null },
      { workbcId: "c", postedAt: null, postedDate: null },
    ]
    const plan = planBackfill(rows)
    expect(plan.writes).toEqual([])
    expect(plan.unchanged).toBe(3)
    expect(plan.total).toBe(3)
  })

  it("rewrites a row whose stored date disagrees with the raw value", () => {
    const plan = planBackfill([
      { workbcId: "w", postedAt: "2026-07-19", postedDate: day("2026-01-01") },
    ])
    expect(plan.writes).toEqual([{ workbcId: "w", postedDate: day("2026-07-19") }])
  })

  it("tallies a mixed batch", () => {
    const rows: BackfillRow[] = [
      { workbcId: "1", postedAt: "2026-07-19", postedDate: null },
      { workbcId: "2", postedAt: "July 24, 2026", postedDate: null },
      { workbcId: "3", postedAt: null, postedDate: null },
      { workbcId: "4", postedAt: "whenever", postedDate: null },
      { workbcId: "5", postedAt: "2026-07-19", postedDate: day("2026-07-19") },
    ]
    const plan = planBackfill(rows)
    expect(plan).toMatchObject({ total: 5, nullRaw: 1, parsed: 3, unchanged: 3 })
    expect(plan.unparseable).toEqual([{ workbcId: "4", postedAt: "whenever" }])
    expect(plan.writes.map((w) => w.workbcId)).toEqual(["1", "2"])
  })
})

describe("groupWrites", () => {
  it("collapses rows sharing a target date into one group", () => {
    const groups = groupWrites([
      { workbcId: "a", postedDate: day("2026-07-19") },
      { workbcId: "b", postedDate: day("2026-07-19") },
      { workbcId: "c", postedDate: day("2026-07-20") },
      { workbcId: "d", postedDate: null },
      { workbcId: "e", postedDate: null },
    ])
    expect(groups).toEqual([
      { postedDate: day("2026-07-19"), workbcIds: ["a", "b"] },
      { postedDate: day("2026-07-20"), workbcIds: ["c"] },
      { postedDate: null, workbcIds: ["d", "e"] },
    ])
  })

  it("preserves every row exactly once", () => {
    const writes = Array.from({ length: 50 }, (_, i) => ({
      workbcId: `id-${i}`,
      postedDate: i % 3 === 0 ? null : day(`2026-07-${String((i % 27) + 1).padStart(2, "0")}`),
    }))
    const groups = groupWrites(writes)
    const flat = groups.flatMap((g) => g.workbcIds)
    expect(flat.length).toBe(writes.length)
    expect(new Set(flat).size).toBe(writes.length)
  })
})
