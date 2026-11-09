import { beforeEach, describe, expect, it, vi } from "vitest"

const db = { employer: { updateMany: vi.fn(), findUnique: vi.fn() } }
vi.mock("../db", () => ({ prisma: db }))
const { storeEmployerWeb } = await import("./employer-verdict")

describe("storeEmployerWeb", () => {
  beforeEach(() => {
    db.employer.updateMany.mockReset()
    db.employer.findUnique.mockReset()
  })

  it("stores only if the employer is unchanged since it was read", async () => {
    const seenAt = new Date("2026-11-01T00:00:00Z")
    db.employer.updateMany.mockResolvedValue({ count: 1 })
    const out = await storeEmployerWeb({ id: "e", checks: { other: 1 }, checkedAt: seenAt }, { summary: "new" })
    expect(out).toEqual({ stored: true, checks: { other: 1, web: { summary: "new" } } })
    expect(db.employer.updateMany.mock.calls[0][0].where).toEqual({ id: "e", checkedAt: seenAt })
  })

  it("keeps the verdict another writer stored and returns it", async () => {
    db.employer.updateMany.mockResolvedValue({ count: 0 })
    db.employer.findUnique.mockResolvedValue({ checks: { web: { summary: "theirs" } } })
    const out = await storeEmployerWeb({ id: "e", checks: {}, checkedAt: null }, { summary: "mine" })
    expect(out).toEqual({ stored: false, checks: { web: { summary: "theirs" } } })
  })
})
