import { describe, expect, it } from "vitest"
import { contentChanged, dueForRefetch, salaryChanged, keepJudgeFlags } from "./posting-content"

const base = {
  title: "Cook",
  descriptionMd: "Make food.",
  externalApplyUrl: null,
  salary: "$20/hr",
  location: "Victoria",
  employerId: "e1",
}

describe("contentChanged", () => {
  it("is false for an identical refetch", () => {
    expect(contentChanged(base, { ...base })).toBe(false)
  })

  it("is true when the text, apply link, pay, place or employer changed", () => {
    expect(contentChanged(base, { ...base, descriptionMd: "Make food. Mail your résumé to 1 Main St." })).toBe(true)
    expect(contentChanged(base, { ...base, externalApplyUrl: "https://x.example/apply" })).toBe(true)
    expect(contentChanged(base, { ...base, salary: null })).toBe(true)
    expect(contentChanged(base, { ...base, employerId: "e2" })).toBe(true)
  })
})

describe("salaryChanged", () => {
  it("ignores WorkBC's dollar of rounding on a re-derived range", () => {
    expect(contentChanged(base, { ...base, salary: "$20/hr" })).toBe(false)
    expect(salaryChanged("$86,154 - $123,802 annually", "$86,153 - $123,801 annually")).toBe(false)
  })

  it("counts a real change in pay or in how it is stated", () => {
    expect(salaryChanged("$25.00 hourly", "$22.00 hourly")).toBe(true)
    expect(salaryChanged("$58.00 hourly", "$63.00 hourly")).toBe(true)
    expect(salaryChanged("$25.00 hourly", "$25.00 annually")).toBe(true)
    expect(salaryChanged("$25.00 hourly", null)).toBe(true)
  })
})

describe("dueForRefetch", () => {
  const now = new Date("2026-11-09T00:00:00Z")
  it("uses the last fetch, or the first scrape for rows never refetched", () => {
    expect(dueForRefetch({ fetchedAt: new Date("2026-11-01T00:00:00Z"), scrapedAt: new Date("2026-01-01") }, 28, now)).toBe(false)
    expect(dueForRefetch({ fetchedAt: null, scrapedAt: new Date("2026-10-01T00:00:00Z") }, 28, now)).toBe(true)
    expect(dueForRefetch({ fetchedAt: null, scrapedAt: new Date("2026-11-05T00:00:00Z") }, 28, now)).toBe(false)
  })
})

describe("keepJudgeFlags", () => {
  const review = { flag: "apply_host_mismatch_review", evidence: "uncertain" }
  const ats = { flag: "ats_known_provider", evidence: "x.myworkdayjobs.com" }
  const url = "https://x.myworkdayjobs.com/a"

  it("keeps the judge's review flag across a refetch of the same apply link", () => {
    expect(keepJudgeFlags({ externalApplyUrl: url, flags: [ats, review] }, { externalApplyUrl: url, flags: [ats] })).toEqual([ats, review])
  })

  it("drops it when the apply link changed, so the new link is checked afresh", () => {
    expect(keepJudgeFlags({ externalApplyUrl: url, flags: [review] }, { externalApplyUrl: null, flags: [] })).toEqual([])
  })

  it("drops a scrape-derived flag the new text no longer supports", () => {
    expect(keepJudgeFlags({ externalApplyUrl: url, flags: [ats] }, { externalApplyUrl: url, flags: [] })).toEqual([])
  })
})
