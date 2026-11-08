import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

const update = vi.fn()
const updateMany = vi.fn()
vi.mock("../db", () => ({
  prisma: { job: { update: (...a: unknown[]) => update(...a), updateMany: (...a: unknown[]) => updateMany(...a) } },
}))

const { composedWriteWhere, republishVerdict, sendBackToPending, writeComposedVerdict, writeImpersonationVerdict } =
  await import("./write-verdict")

const verdict = {
  fraudScore: 40,
  riskBand: "medium",
  reasoning: "Composed.",
  signals: [],
  judgments: Prisma.JsonNull,
  scoringVersion: 2,
  scoredAt: new Date(),
}

describe("write-verdict", () => {
  beforeEach(() => {
    update.mockReset()
    updateMany.mockReset()
  })

  it("never lets a composed verdict replace an impersonation, and keeps never-judged rows eligible", () => {
    const where = composedWriteWhere("1", "judgment")
    expect(where).toEqual({ workbcId: "1", OR: [{ verdictKind: null }, { verdictKind: { not: "IMPERSONATION" } }] })
  })

  it("refuses a recompute on a pending row, which a rerun is waiting to re-judge", () => {
    expect(composedWriteWhere("1", "recompute")).toMatchObject({ status: "PUBLISHED" })
    expect(composedWriteWhere("1", "judgment")).not.toHaveProperty("status")
  })

  it("publishes a composed verdict with its kind in the same write", async () => {
    updateMany.mockResolvedValue({ count: 1 })
    expect(await writeComposedVerdict("1", verdict, "judgment")).toBe(true)
    const { data } = updateMany.mock.calls[0][0]
    expect(data).toMatchObject({ ...verdict, status: "PUBLISHED", verdictKind: "COMPOSED" })
  })

  it("reports a refused write", async () => {
    updateMany.mockResolvedValue({ count: 0 })
    expect(await writeComposedVerdict("1", verdict, "recompute")).toBe(false)
  })

  it("writes an impersonation as published, unversioned and of kind IMPERSONATION", async () => {
    await writeImpersonationVerdict("9", {
      employerId: "e",
      applicationFlags: [],
      fraudScore: 90,
      riskBand: "high",
      reasoning: "Brand impersonation: x",
      signals: [],
    })
    const { where, data } = update.mock.calls[0][0]
    expect(where).toEqual({ workbcId: "9" })
    expect(data).toMatchObject({ fraudScore: 90, scoringVersion: null, status: "PUBLISHED", verdictKind: "IMPERSONATION" })
    expect(data.scoredAt).toBeInstanceOf(Date)
  })

  it("moves status with scoredAt when republishing and when sending back", async () => {
    await republishVerdict("3")
    await sendBackToPending("4")
    expect(update.mock.calls[0][0].data).toMatchObject({ status: "PUBLISHED" })
    expect(update.mock.calls[0][0].data.scoredAt).toBeInstanceOf(Date)
    expect(update.mock.calls[1][0]).toEqual({ where: { workbcId: "4" }, data: { scoredAt: null, status: "PENDING" } })
  })
})
