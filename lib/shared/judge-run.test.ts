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

describe("run record writes", async () => {
  const { finishJudgeRun, failJudgeRun } = await import("./judge-run")
  const { prisma } = (await import("../db")) as unknown as { prisma: Record<string, unknown> }

  it("finishes only a RUNNING row, so a crash after an abort keeps the abort", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    prisma.judgeRun = { updateMany, findUnique: vi.fn().mockResolvedValue({ startedAt: new Date(), outcome: "ABORTED" }) }
    await finishJudgeRun("r", { pendingAtStart: 1, scored: 1, held: 0, failed: 0 })
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: "r", outcome: "RUNNING" })
    await failJudgeRun("r", new Error("boom"))
    expect(updateMany).toHaveBeenCalledOnce()
  })

  it("records a crash as FAILED with the scored count read back from judgedAt", async () => {
    const startedAt = new Date("2026-11-09T12:17:00Z")
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const count = vi.fn().mockResolvedValue(42)
    prisma.judgeRun = { updateMany, findUnique: vi.fn().mockResolvedValue({ startedAt, outcome: "RUNNING" }) }
    prisma.job = { count }
    await failJudgeRun("r", new Error("connection reset"))
    expect(count.mock.calls[0][0]).toEqual({ where: { judgedAt: { gte: startedAt } } })
    const { data } = updateMany.mock.calls[0][0]
    expect(data).toMatchObject({ outcome: "FAILED", scored: 42 })
    expect(data.note).toContain("connection reset")
  })
})
