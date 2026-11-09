import { describe, expect, it, vi } from "vitest"

vi.mock("../db", () => ({ prisma: {} }))
const { runOutcome } = await import("./judge-run")

describe("runOutcome", () => {
  it("calls a run that scored nothing while postings waited a failure", () => {
    expect(runOutcome({ pendingAtStart: 730, scored: 0, held: 730, failed: 0 })).toBe("FAILED")
  })

  it("calls a run with held or failed postings partial", () => {
    expect(runOutcome({ pendingAtStart: 10, scored: 8, held: 2, failed: 0 })).toBe("PARTIAL")
    expect(runOutcome({ pendingAtStart: 10, scored: 9, held: 0, failed: 1 })).toBe("PARTIAL")
  })

  it("calls a clean run, or one with nothing to do, ok", () => {
    expect(runOutcome({ pendingAtStart: 10, scored: 10, held: 0, failed: 0 })).toBe("OK")
    expect(runOutcome({ pendingAtStart: 0, scored: 0, held: 0, failed: 0 })).toBe("OK")
  })
})
