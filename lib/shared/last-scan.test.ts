import { describe, expect, it } from "vitest"
import { lastScanAt } from "./last-scan"

const older = new Date("2026-11-01T00:00:00Z")
const newer = new Date("2026-11-08T00:00:00Z")

describe("lastScanAt", () => {
  it("uses scrapedAt while no row has a fetchedAt yet", () => {
    expect(lastScanAt(newer, null)).toBe(newer)
  })

  it("uses fetchedAt once a scrape has refetched postings without inserting any", () => {
    expect(lastScanAt(older, newer)).toBe(newer)
  })

  it("uses scrapedAt when an insert is the latest activity", () => {
    expect(lastScanAt(newer, older)).toBe(newer)
  })

  it("is null for an empty table", () => {
    expect(lastScanAt(null, null)).toBeNull()
  })
})
