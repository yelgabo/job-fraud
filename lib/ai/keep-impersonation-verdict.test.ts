import { beforeEach, describe, expect, it, vi } from "vitest"

const update = vi.fn()
vi.mock("../db", () => ({ prisma: { job: { update: (...a: unknown[]) => update(...a) } } }))

const { keepImpersonationVerdict } = await import("./resolve-impersonation")

describe("keepImpersonationVerdict", () => {
  beforeEach(() => update.mockReset())

  it("lets every other kind through to the composer", async () => {
    for (const verdictKind of [null, "MODEL", "COMPOSED"] as const) {
      expect(await keepImpersonationVerdict({ workbcId: "1", verdictKind, status: "PENDING" })).toBe(false)
    }
    expect(update).not.toHaveBeenCalled()
  })

  it("keeps a published impersonation verdict without writing", async () => {
    expect(await keepImpersonationVerdict({ workbcId: "1", verdictKind: "IMPERSONATION", status: "PUBLISHED" })).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it("republishes an impersonation verdict that a rerun sent back to pending", async () => {
    expect(await keepImpersonationVerdict({ workbcId: "42", verdictKind: "IMPERSONATION", status: "PENDING" })).toBe(true)
    expect(update).toHaveBeenCalledOnce()
    const arg = update.mock.calls[0][0] as { where: { workbcId: string }; data: Record<string, unknown> }
    expect(arg.where).toEqual({ workbcId: "42" })
    expect(arg.data.status).toBe("PUBLISHED")
    expect(arg.data.scoredAt).toBeInstanceOf(Date)
    expect(Object.keys(arg.data).sort()).toEqual(["scoredAt", "status"])
  })

  it("writes nothing on a dry run", async () => {
    expect(await keepImpersonationVerdict({ workbcId: "42", verdictKind: "IMPERSONATION", status: "PENDING" }, true)).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })
})
