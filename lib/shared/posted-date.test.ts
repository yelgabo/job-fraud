import { describe, expect, it } from "vitest"
import {
  effectivePostedDate,
  formatPostedDate,
  parsePostedDate,
  postedDateLabel,
} from "./posted-date"

const iso = (d: Date | null) => (d ? d.toISOString() : null)

describe("parsePostedDate: the API producer (workbc-api.ts)", () => {
  it("parses the ISO YYYY-MM-DD prefix it writes", () => {
    expect(iso(parsePostedDate("2026-07-19"))).toBe("2026-07-19T00:00:00.000Z")
  })

  it("tolerates a full ISO timestamp in case the slice is ever removed", () => {
    expect(iso(parsePostedDate("2026-07-19T18:04:22.000Z"))).toBe("2026-07-19T00:00:00.000Z")
  })

  it("anchors at UTC midnight so no timezone shifts the calendar day", () => {
    const d = parsePostedDate("2026-01-01")!
    expect([d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()]).toEqual([
      2026, 0, 1, 0,
    ])
  })
})

describe("parsePostedDate: the HTML fallback producer (scrape-workbc.ts)", () => {
  it("parses a full month name", () => {
    expect(iso(parsePostedDate("July 24, 2026"))).toBe("2026-07-24T00:00:00.000Z")
  })

  it("parses an abbreviated month, with or without a period or comma", () => {
    expect(iso(parsePostedDate("Jul 24 2026"))).toBe("2026-07-24T00:00:00.000Z")
    expect(iso(parsePostedDate("Sept. 3, 2026"))).toBe("2026-09-03T00:00:00.000Z")
    expect(iso(parsePostedDate("feb 9, 2026"))).toBe("2026-02-09T00:00:00.000Z")
  })

  it("parses an ordinal suffix", () => {
    expect(iso(parsePostedDate("August 1st, 2026"))).toBe("2026-08-01T00:00:00.000Z")
    expect(iso(parsePostedDate("22nd March 2026"))).toBe("2026-03-22T00:00:00.000Z")
  })

  it("parses day-first month-name text", () => {
    expect(iso(parsePostedDate("24 July 2026"))).toBe("2026-07-24T00:00:00.000Z")
  })

  it("tolerates surrounding whitespace", () => {
    expect(iso(parsePostedDate("  July 24, 2026  "))).toBe("2026-07-24T00:00:00.000Z")
  })
})

describe("parsePostedDate: conservative rejection (null means fall back to scrapedAt)", () => {
  it("rejects null, undefined and blank", () => {
    expect(parsePostedDate(null)).toBeNull()
    expect(parsePostedDate(undefined)).toBeNull()
    expect(parsePostedDate("")).toBeNull()
    expect(parsePostedDate("   ")).toBeNull()
  })

  it("rejects all-numeric slash and dot forms because day/month order is ambiguous", () => {
    expect(parsePostedDate("07/24/2026")).toBeNull()
    expect(parsePostedDate("24/07/2026")).toBeNull()
    expect(parsePostedDate("07.24.2026")).toBeNull()
    expect(parsePostedDate("2026/07/24")).toBeNull()
  })

  it("rejects relative text (there is no reference date to resolve it against)", () => {
    expect(parsePostedDate("2 days ago")).toBeNull()
    expect(parsePostedDate("Today")).toBeNull()
    expect(parsePostedDate("Yesterday")).toBeNull()
    expect(parsePostedDate("30+ days ago")).toBeNull()
  })

  it("rejects a date with no year", () => {
    expect(parsePostedDate("July 24")).toBeNull()
    expect(parsePostedDate("07-24")).toBeNull()
  })

  it("rejects impossible calendar dates", () => {
    expect(parsePostedDate("2026-02-30")).toBeNull()
    expect(parsePostedDate("2026-13-01")).toBeNull()
    expect(parsePostedDate("2026-00-10")).toBeNull()
    expect(parsePostedDate("February 30, 2026")).toBeNull()
    expect(parsePostedDate("Jul 32 2026")).toBeNull()
  })

  it("rejects years outside the plausible posting range", () => {
    expect(parsePostedDate("1899-07-24")).toBeNull()
    expect(parsePostedDate("0001-01-01")).toBeNull()
    expect(parsePostedDate("July 24, 1066")).toBeNull()
  })

  it("rejects an unknown month word", () => {
    expect(parsePostedDate("Smarch 4, 2026")).toBeNull()
  })

  it("rejects junk, including junk that merely contains a date", () => {
    expect(parsePostedDate("n/a")).toBeNull()
    expect(parsePostedDate("-")).toBeNull()
    expect(parsePostedDate("see description")).toBeNull()
    expect(parsePostedDate("Expires 2026-08-30")).toBeNull()
    expect(parsePostedDate("2026-07-19-ish")).toBeNull()
    expect(parsePostedDate("July 24, 2026 and re-posted later")).toBeNull()
  })
})

describe("effectivePostedDate", () => {
  const scrapedAt = new Date("2026-07-28T23:40:00.000Z")

  it("uses the real posted date when there is one", () => {
    const got = effectivePostedDate({ postedDate: new Date("2026-07-19T00:00:00.000Z"), scrapedAt })
    expect(got.estimated).toBe(false)
    expect(got.day).toBe("2026-07-19")
  })

  it("falls back to the scrape date and marks it estimated", () => {
    const got = effectivePostedDate({ postedDate: null, scrapedAt })
    expect(got.estimated).toBe(true)
    expect(got.day).toBe("2026-07-28")
  })
})

describe("formatPostedDate / postedDateLabel: an estimate is never mistakable for a real date", () => {
  const scrapedAt = new Date("2026-07-19T12:00:00.000Z")

  it("shows a real posted date plainly", () => {
    const real = effectivePostedDate({ postedDate: new Date("2026-07-19T00:00:00.000Z"), scrapedAt })
    expect(formatPostedDate(real)).toBe("2026-07-19")
    expect(postedDateLabel(real)).toBe("posted 2026-07-19")
  })

  it("marks a fallback with a leading tilde and says where it came from", () => {
    const est = effectivePostedDate({ postedDate: null, scrapedAt })
    expect(formatPostedDate(est)).toBe("~2026-07-19 (est. from scrape)")
    expect(postedDateLabel(est)).toBe("posted ~2026-07-19 (est. from scrape)")
  })
})
