import { describe, expect, it, vi } from "vitest"
import { EXPIRY_DAYS, isExpired, stampSightings } from "./last-seen"

const DAY_MS = 86_400_000
const LATEST = new Date("2026-07-30T12:00:00Z")

function daysBefore(n: number): Date {
  return new Date(LATEST.getTime() - n * DAY_MS)
}

describe("isExpired", () => {
  it("never expires a null lastSeenAt, however old the latest sighting is", () => {
    expect(isExpired(null, LATEST)).toBe(false)
  })

  it("never expires anything when no sighting exists anywhere (null latestSeenAt)", () => {
    expect(isExpired(daysBefore(365), null)).toBe(false)
    expect(isExpired(null, null)).toBe(false)
  })

  it("does not expire a posting seen in the latest scrape", () => {
    expect(isExpired(LATEST, LATEST)).toBe(false)
  })

  it("does not expire a posting unseen for exactly EXPIRY_DAYS", () => {
    expect(isExpired(daysBefore(EXPIRY_DAYS), LATEST)).toBe(false)
  })

  it("expires a posting unseen for more than EXPIRY_DAYS", () => {
    expect(isExpired(daysBefore(EXPIRY_DAYS + 1), LATEST)).toBe(true)
  })

  it("measures against the latest sighting, not the wall clock: a halted scraper expires nothing", () => {
    // Everything was last stamped long ago, but nothing is newer than EXPIRY_DAYS relative to
    // the newest sighting, so nothing may be claimed to have left WorkBC.
    const staleLatest = daysBefore(90)
    expect(isExpired(daysBefore(91), staleLatest)).toBe(false)
    expect(isExpired(daysBefore(90 + EXPIRY_DAYS + 1), staleLatest)).toBe(true)
  })
})

describe("stampSightings", () => {
  it("bulk-updates lastSeenAt on the given ids and reports the count", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 })
    const seenAt = new Date("2026-07-30T00:00:00Z")
    const stamped = await stampSightings({ job: { updateMany } }, ["1", "2", "3"], seenAt)
    expect(stamped).toBe(2)
    expect(updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { workbcId: { in: ["1", "2", "3"] } },
      data: { lastSeenAt: seenAt },
    })
  })

  it("skips the database entirely for an empty id list", async () => {
    const updateMany = vi.fn()
    const stamped = await stampSightings({ job: { updateMany } }, [], new Date())
    expect(stamped).toBe(0)
    expect(updateMany).not.toHaveBeenCalled()
  })
})
