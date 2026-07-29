import { describe, expect, it } from "vitest"
import {
  BANDS,
  POSTED_WINDOWS,
  buildPostingsQuery,
  parseBand,
  parsePostedWindow,
  postedWindowWhere,
  windowCutoff,
  type BandKey,
  type PostedWindowKey,
} from "./postings-filter"

// A posting, reduced to the columns the postings-page filters touch.
type Row = {
  id: string
  riskBand: string | null
  category: string | null
  scoredAt: Date | null
  postedDate: Date | null
  scrapedAt: Date
}

const NOW = new Date("2026-07-29T09:00:00.000Z")
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

/**
 * Minimal interpreter for exactly the where shapes buildPostingsQuery emits. It lets these tests
 * check the real property the page depends on, that every tab count equals the number of rows
 * that tab would list, without touching a database.
 */
function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      const branches = cond as Array<Record<string, unknown>>
      if (!branches.some((b) => matches(row, b))) return false
      continue
    }
    const value = (row as unknown as Record<string, unknown>)[key]
    if (cond === null) {
      if (value !== null) return false
    } else if (typeof cond === "object" && cond !== null && "not" in cond) {
      if ((cond as { not: unknown }).not === null && value === null) return false
    } else if (typeof cond === "object" && cond !== null && "gte" in cond) {
      const bound = (cond as { gte: Date }).gte
      if (!(value instanceof Date) || value.getTime() < bound.getTime()) return false
    } else if (value !== cond) {
      return false
    }
  }
  return true
}

const count = (rows: Row[], where: Record<string, unknown>) =>
  rows.filter((r) => matches(r, where)).length

// Deliberately spread across bands, categories, posted-date windows, unparseable posted dates
// (postedDate null -> scrapedAt fallback) and one still-pending row.
const CORPUS: Row[] = [
  { id: "a", riskBand: "high", category: "Software & Data", scoredAt: day("2026-07-28"), postedDate: day("2026-07-28"), scrapedAt: day("2026-07-29") },
  { id: "b", riskBand: "high", category: "Food Service", scoredAt: day("2026-07-28"), postedDate: day("2026-07-10"), scrapedAt: day("2026-07-11") },
  { id: "c", riskBand: "medium", category: "Software & Data", scoredAt: day("2026-07-28"), postedDate: day("2026-06-20"), scrapedAt: day("2026-06-21") },
  { id: "d", riskBand: "medium", category: "Software & Data", scoredAt: day("2026-07-28"), postedDate: day("2026-02-02"), scrapedAt: day("2026-02-03") },
  { id: "e", riskBand: "low", category: "Food Service", scoredAt: day("2026-07-28"), postedDate: day("2026-07-25"), scrapedAt: day("2026-07-26") },
  { id: "f", riskBand: "low", category: "Healthcare", scoredAt: day("2026-07-28"), postedDate: null, scrapedAt: day("2026-07-27") },
  { id: "g", riskBand: "unknown", category: "Healthcare", scoredAt: day("2026-07-28"), postedDate: null, scrapedAt: day("2026-03-01") },
  { id: "h", riskBand: "low", category: "Software & Data", scoredAt: day("2026-07-28"), postedDate: day("2026-05-15"), scrapedAt: day("2026-05-16") },
  // pending: never listed, never counted, in any dimension
  { id: "p", riskBand: null, category: "Software & Data", scoredAt: null, postedDate: day("2026-07-28"), scrapedAt: day("2026-07-29") },
]

const CATS = ["all", "Software & Data", "Food Service", "Healthcare"] as const
const BAND_KEYS = BANDS.filter((b) => b !== "all")

describe("parseBand / parsePostedWindow", () => {
  it("defaults unknown or missing params to the widest option", () => {
    expect(parseBand(undefined)).toBe("all")
    expect(parseBand("bogus")).toBe("all")
    expect(parseBand("high")).toBe("high")
    expect(parsePostedWindow(undefined)).toBe("any")
    expect(parsePostedWindow("365")).toBe("any")
    expect(parsePostedWindow("30")).toBe("30")
  })
})

describe("windowCutoff", () => {
  it("counts N calendar days in UTC, ending with today", () => {
    expect(windowCutoff(7, NOW).toISOString()).toBe("2026-07-23T00:00:00.000Z")
    expect(windowCutoff(30, NOW).toISOString()).toBe("2026-06-30T00:00:00.000Z")
    expect(windowCutoff(90, NOW).toISOString()).toBe("2026-05-01T00:00:00.000Z")
  })

  it("ignores the time of day so the boundary does not drift through the day", () => {
    const lateInDay = new Date("2026-07-29T23:59:59.000Z")
    expect(windowCutoff(7, lateInDay).toISOString()).toBe(windowCutoff(7, NOW).toISOString())
  })
})

describe("postedWindowWhere", () => {
  it('is an empty clause for "any" so it composes away', () => {
    expect(postedWindowWhere("any", NOW)).toEqual({})
  })

  it("matches on the real posted date when there is one", () => {
    const w = postedWindowWhere("7", NOW) as Record<string, unknown>
    expect(matches(CORPUS.find((r) => r.id === "a")!, w)).toBe(true)
    expect(matches(CORPUS.find((r) => r.id === "b")!, w)).toBe(false)
  })

  it("falls back to scrapedAt only when postedDate is null", () => {
    const w = postedWindowWhere("7", NOW) as Record<string, unknown>
    // f: no usable posted date, scraped two days ago -> kept in the window
    expect(matches(CORPUS.find((r) => r.id === "f")!, w)).toBe(true)
    // g: no usable posted date, scraped in March -> outside the window
    expect(matches(CORPUS.find((r) => r.id === "g")!, w)).toBe(false)
  })

  it("does not let a recent scrape drag an old posted date into a window", () => {
    const w = postedWindowWhere("30", NOW) as Record<string, unknown>
    const old = { id: "x", riskBand: "low", category: "Healthcare", scoredAt: NOW, postedDate: day("2026-02-02"), scrapedAt: day("2026-07-29") }
    expect(matches(old, w)).toBe(false)
  })
})

describe("buildPostingsQuery: each dimension's counts exclude only itself", () => {
  it("leaves band out of the band-count clause but keeps category and date", () => {
    const q = buildPostingsQuery({ band: "high", cat: "Software & Data", posted: "7", now: NOW })
    expect(q.bandCountWhere).not.toHaveProperty("riskBand")
    expect(q.bandCountWhere).toHaveProperty("category", "Software & Data")
    expect(q.bandCountWhere).toHaveProperty("OR")
  })

  it("leaves category out of the category-count clause but keeps band and date", () => {
    const q = buildPostingsQuery({ band: "high", cat: "Software & Data", posted: "7", now: NOW })
    expect(q.catCountWhere).not.toHaveProperty("category")
    expect(q.catCountWhere).toHaveProperty("riskBand", "high")
    expect(q.catCountWhere).toHaveProperty("OR")
  })

  it("keeps band and category in every posted-window count", () => {
    const q = buildPostingsQuery({ band: "high", cat: "Software & Data", posted: "7", now: NOW })
    for (const w of POSTED_WINDOWS) {
      expect(q.postedCountWhere[w.key]).toHaveProperty("riskBand", "high")
      expect(q.postedCountWhere[w.key]).toHaveProperty("category", "Software & Data")
    }
    // and each window counts its OWN window, not the active one
    expect(q.postedCountWhere.any).not.toHaveProperty("OR")
    expect(q.postedCountWhere["30"]).toHaveProperty("OR")
  })

  it("only ever lists judged postings", () => {
    const q = buildPostingsQuery({ band: "all", cat: "all", posted: "any", now: NOW })
    for (const where of [q.rowsWhere, q.bandCountWhere, q.catCountWhere, ...Object.values(q.postedCountWhere)]) {
      expect(where).toHaveProperty("scoredAt")
    }
    expect(count(CORPUS, q.rowsWhere as Record<string, unknown>)).toBe(CORPUS.length - 1)
  })
})

describe("buildPostingsQuery: tab counts agree with the rows listed, for every filter combination", () => {
  const combos: Array<{ band: BandKey; cat: string; posted: PostedWindowKey }> = []
  for (const band of BANDS) for (const cat of CATS) for (const w of POSTED_WINDOWS) {
    combos.push({ band, cat, posted: w.key })
  }

  it("every band tab's count equals the rows that tab would list", () => {
    for (const c of combos) {
      const q = buildPostingsQuery({ ...c, now: NOW })
      for (const b of BAND_KEYS) {
        const tab = count(CORPUS, { ...(q.bandCountWhere as Record<string, unknown>), riskBand: b })
        const listed = count(
          CORPUS,
          buildPostingsQuery({ ...c, band: b, now: NOW }).rowsWhere as Record<string, unknown>,
        )
        expect(tab, `band=${b} from ${JSON.stringify(c)}`).toBe(listed)
      }
    }
  })

  it("every category tab's count equals the rows that tab would list", () => {
    for (const c of combos) {
      const q = buildPostingsQuery({ ...c, now: NOW })
      for (const cat of CATS.filter((x) => x !== "all")) {
        const tab = count(CORPUS, { ...(q.catCountWhere as Record<string, unknown>), category: cat })
        const listed = count(
          CORPUS,
          buildPostingsQuery({ ...c, cat, now: NOW }).rowsWhere as Record<string, unknown>,
        )
        expect(tab, `cat=${cat} from ${JSON.stringify(c)}`).toBe(listed)
      }
    }
  })

  it("every posted-window tab's count equals the rows that tab would list", () => {
    for (const c of combos) {
      const q = buildPostingsQuery({ ...c, now: NOW })
      for (const w of POSTED_WINDOWS) {
        const tab = count(CORPUS, q.postedCountWhere[w.key] as Record<string, unknown>)
        const listed = count(
          CORPUS,
          buildPostingsQuery({ ...c, posted: w.key, now: NOW }).rowsWhere as Record<string, unknown>,
        )
        expect(tab, `posted=${w.key} from ${JSON.stringify(c)}`).toBe(listed)
      }
    }
  })

  it("the band tabs sum to the all-bands total, and so do the category tabs", () => {
    for (const c of combos) {
      const q = buildPostingsQuery({ ...c, now: NOW })
      const bandTotal = count(CORPUS, q.bandCountWhere as Record<string, unknown>)
      const bandSum = BAND_KEYS.reduce(
        (n, b) => n + count(CORPUS, { ...(q.bandCountWhere as Record<string, unknown>), riskBand: b }),
        0,
      )
      expect(bandSum, `bands from ${JSON.stringify(c)}`).toBe(bandTotal)

      const catTotal = count(CORPUS, q.catCountWhere as Record<string, unknown>)
      const catSum = CATS.filter((x) => x !== "all").reduce(
        (n, cat) => n + count(CORPUS, { ...(q.catCountWhere as Record<string, unknown>), category: cat }),
        0,
      )
      expect(catSum, `cats from ${JSON.stringify(c)}`).toBe(catTotal)
    }
  })

  it("the date filter really does shrink the band and category counts (the third-dimension trap)", () => {
    const any = buildPostingsQuery({ band: "all", cat: "all", posted: "any", now: NOW })
    const week = buildPostingsQuery({ band: "all", cat: "all", posted: "7", now: NOW })
    expect(count(CORPUS, week.bandCountWhere as Record<string, unknown>)).toBeLessThan(
      count(CORPUS, any.bandCountWhere as Record<string, unknown>),
    )
    expect(count(CORPUS, week.catCountWhere as Record<string, unknown>)).toBeLessThan(
      count(CORPUS, any.catCountWhere as Record<string, unknown>),
    )
  })
})
