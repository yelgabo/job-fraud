import { describe, expect, it, vi } from "vitest"

vi.mock("../db", () => ({ prisma: {} }))
const { scrapeOutcome } = await import("./scrape-run")

const counts = { listed: 500, toFetch: 40, written: 40, sentBack: 3, failed: 0 }

describe("scrapeOutcome", () => {
  it("calls a run where every detail fetch failed a failure, not a quiet week", () => {
    expect(scrapeOutcome({ ...counts, written: 0, failed: 40 }, false)).toBe("FAILED")
  })

  it("calls an empty search or a crash a failure", () => {
    expect(scrapeOutcome({ ...counts, listed: 0, toFetch: 0, written: 0 }, false)).toBe("FAILED")
    expect(scrapeOutcome(counts, true)).toBe("FAILED")
  })

  it("calls a run with some failed fetches partial", () => {
    expect(scrapeOutcome({ ...counts, written: 38, failed: 2 }, false)).toBe("PARTIAL")
  })

  it("calls a clean run, or one with nothing new to fetch, ok", () => {
    expect(scrapeOutcome(counts, false)).toBe("OK")
    expect(scrapeOutcome({ ...counts, toFetch: 0, written: 0 }, false)).toBe("OK")
  })
})
