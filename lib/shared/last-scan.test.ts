import { describe, expect, it } from "vitest"
import { LATEST_FINISHED_SCRAPE, lastScanAt } from "./last-scan"

const older = new Date("2026-11-01T00:00:00Z")
const newer = new Date("2026-11-08T00:00:00Z")
const run = new Date("2026-11-05T00:00:00Z")

describe("lastScanAt", () => {
  it("prefers the latest finished scrape run over the row dates", () => {
    expect(lastScanAt({ latestRunFinishedAt: run, maxScrapedAt: newer, maxFetchedAt: newer })).toBe(run)
    expect(lastScanAt({ latestRunFinishedAt: run, maxScrapedAt: null, maxFetchedAt: null })).toBe(run)
  })

  it("uses scrapedAt while no run is recorded and no row has a fetchedAt", () => {
    expect(lastScanAt({ latestRunFinishedAt: null, maxScrapedAt: newer, maxFetchedAt: null })).toBe(newer)
  })

  it("uses fetchedAt once a scrape has refetched postings without inserting any", () => {
    expect(lastScanAt({ latestRunFinishedAt: null, maxScrapedAt: older, maxFetchedAt: newer })).toBe(newer)
  })

  it("uses scrapedAt when an insert is the latest activity", () => {
    expect(lastScanAt({ latestRunFinishedAt: null, maxScrapedAt: newer, maxFetchedAt: older })).toBe(newer)
  })

  it("is null with no runs and an empty table", () => {
    expect(lastScanAt({ latestRunFinishedAt: null, maxScrapedAt: null, maxFetchedAt: null })).toBeNull()
  })
})

describe("LATEST_FINISHED_SCRAPE", () => {
  it("skips failed and unfinished runs and takes the latest finish", () => {
    expect(LATEST_FINISHED_SCRAPE.where.outcome.in).toEqual(["OK", "PARTIAL"])
    expect(LATEST_FINISHED_SCRAPE.where.finishedAt).toEqual({ not: null })
    expect(LATEST_FINISHED_SCRAPE.orderBy).toEqual({ finishedAt: "desc" })
  })
})
