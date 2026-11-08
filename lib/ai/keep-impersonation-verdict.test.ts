import { beforeEach, describe, expect, it, vi } from "vitest"

const update = vi.fn()
vi.mock("../db", () => ({ prisma: { job: { update: (...a: unknown[]) => update(...a) } } }))

const { keepImpersonationVerdict } = await import("./resolve-impersonation")

const impersonation = "Brand impersonation: this posting presents as \"Acme\" but its application link routes to Relx."

describe("keepImpersonationVerdict", () => {
  beforeEach(() => update.mockReset())

  it("lets an ordinary posting through to the composer", async () => {
    expect(await keepImpersonationVerdict({ workbcId: "1", reasoning: "Composed.", scoredAt: null })).toBe(false)
    expect(await keepImpersonationVerdict({ workbcId: "1", reasoning: null, scoredAt: null })).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it("keeps a published impersonation verdict without writing", async () => {
    expect(await keepImpersonationVerdict({ workbcId: "1", reasoning: impersonation, scoredAt: new Date() })).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it("republishes an impersonation verdict that a rerun sent back to pending", async () => {
    expect(await keepImpersonationVerdict({ workbcId: "42", reasoning: impersonation, scoredAt: null })).toBe(true)
    expect(update).toHaveBeenCalledOnce()
    const arg = update.mock.calls[0][0] as { where: { workbcId: string }; data: Record<string, unknown> }
    expect(arg.where).toEqual({ workbcId: "42" })
    expect(arg.data.status).toBe("PUBLISHED")
    expect(arg.data.scoredAt).toBeInstanceOf(Date)
    expect(Object.keys(arg.data).sort()).toEqual(["scoredAt", "status"])
  })

  it("recognises an impersonation by verdictKind once the backfill has run", async () => {
    const job = { workbcId: "7", reasoning: "Reworded.", scoredAt: new Date(), verdictKind: "IMPERSONATION" }
    expect(await keepImpersonationVerdict(job)).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it("writes nothing on a dry run", async () => {
    expect(await keepImpersonationVerdict({ workbcId: "42", reasoning: impersonation, scoredAt: null }, true)).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })
})
