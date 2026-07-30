import { describe, expect, it, vi } from "vitest"
import { EXPIRY_DAYS, isExhaustiveEnumeration, isExpired, stampSightings, type ScrapeEnumeration } from "./last-seen"

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

// An enumeration that covers the whole corpus: no --recent window, no cap truncation, the
// BC-wide term set plus the Victoria city sweep.
const EXHAUSTIVE: ScrapeEnumeration = {
  recentFilter: false,
  truncated: false,
  bcWideTermScope: true,
  victoriaCityScope: true,
}

describe("isExhaustiveEnumeration", () => {
  it("accepts only a full-corpus, uncapped, unwindowed enumeration", () => {
    expect(isExhaustiveEnumeration(EXHAUSTIVE)).toBe(true)
  })

  it("rejects a --recent run", () => {
    expect(isExhaustiveEnumeration({ ...EXHAUSTIVE, recentFilter: true })).toBe(false)
  })

  it("rejects a run truncated by the stub cap or --limit", () => {
    expect(isExhaustiveEnumeration({ ...EXHAUSTIVE, truncated: true })).toBe(false)
  })

  it("rejects a run missing either corpus scope", () => {
    expect(isExhaustiveEnumeration({ ...EXHAUSTIVE, bcWideTermScope: false })).toBe(false)
    expect(isExhaustiveEnumeration({ ...EXHAUSTIVE, victoriaCityScope: false })).toBe(false)
  })
})

describe("stampSightings", () => {
  it("bulk-updates lastSeenAt on the given ids and reports the count", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 })
    const seenAt = new Date("2026-07-30T00:00:00Z")
    const stamped = await stampSightings({ job: { updateMany } }, EXHAUSTIVE, ["1", "2", "3"], seenAt)
    expect(stamped).toBe(2)
    expect(updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { workbcId: { in: ["1", "2", "3"] } },
      data: { lastSeenAt: seenAt },
    })
  })

  it("skips the database entirely for an empty id list", async () => {
    const updateMany = vi.fn()
    const stamped = await stampSightings({ job: { updateMany } }, EXHAUSTIVE, [], new Date())
    expect(stamped).toBe(0)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("a --recent run never writes lastSeenAt, so it can never expire anything", async () => {
    const updateMany = vi.fn()
    const stamped = await stampSightings({ job: { updateMany } }, { ...EXHAUSTIVE, recentFilter: true }, ["1", "2"], new Date())
    expect(stamped).toBeNull()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("a limit-truncated run never writes lastSeenAt, so it can never expire anything", async () => {
    const updateMany = vi.fn()
    const stamped = await stampSightings({ job: { updateMany } }, { ...EXHAUSTIVE, truncated: true }, ["1", "2"], new Date())
    expect(stamped).toBeNull()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("a run scoped narrower than the full corpus never writes lastSeenAt", async () => {
    const updateMany = vi.fn()
    for (const partial of [{ ...EXHAUSTIVE, bcWideTermScope: false }, { ...EXHAUSTIVE, victoriaCityScope: false }]) {
      expect(await stampSightings({ job: { updateMany } }, partial, ["1"], new Date())).toBeNull()
    }
    expect(updateMany).not.toHaveBeenCalled()
  })
})
