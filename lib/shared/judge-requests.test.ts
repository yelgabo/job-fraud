import { beforeEach, describe, expect, it, vi } from "vitest"

const db = {
  judgeRequest: { findMany: vi.fn(), updateMany: vi.fn() },
  job: { findMany: vi.fn() },
}
vi.mock("../db", () => ({ prisma: db }))
const { closeOrphanRequests, resolveRerunRequests } = await import("./judge-requests")

const at = (iso: string) => new Date(iso)

describe("judge requests", () => {
  beforeEach(() => {
    db.judgeRequest.findMany.mockReset()
    db.judgeRequest.updateMany.mockReset()
    db.job.findMany.mockReset()
  })

  it("resolves a rerun only once its posting is published after the request", async () => {
    db.judgeRequest.findMany.mockResolvedValue([
      { id: "r1", workbcId: "1", createdAt: at("2026-11-08T10:00Z") },
      { id: "r2", workbcId: "2", createdAt: at("2026-11-08T10:00Z") },
      { id: "r3", workbcId: "3", createdAt: at("2026-11-08T10:00Z") },
    ])
    db.job.findMany.mockResolvedValue([
      { workbcId: "1", scoredAt: at("2026-11-08T11:00Z") },
      { workbcId: "2", scoredAt: at("2026-11-08T09:00Z") },
    ])
    expect(await resolveRerunRequests()).toBe(1)
    expect(db.job.findMany.mock.calls[0][0].where.status).toBe("PUBLISHED")
    expect(db.judgeRequest.updateMany.mock.calls[0][0].where).toEqual({ id: { in: ["r1"] } })
  })

  it("closes open requests whose posting is gone and leaves the rest", async () => {
    db.judgeRequest.findMany.mockResolvedValue([
      { id: "a", workbcId: "1" },
      { id: "b", workbcId: "gone" },
    ])
    db.job.findMany.mockResolvedValue([{ workbcId: "1" }])
    expect(await closeOrphanRequests()).toBe(1)
    expect(db.judgeRequest.updateMany.mock.calls[0][0].where).toEqual({ id: { in: ["b"] } })
  })

  it("writes nothing when nothing is open", async () => {
    db.judgeRequest.findMany.mockResolvedValue([])
    expect(await resolveRerunRequests()).toBe(0)
    expect(await closeOrphanRequests()).toBe(0)
    expect(db.judgeRequest.updateMany).not.toHaveBeenCalled()
  })
})
