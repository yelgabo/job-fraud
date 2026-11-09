import { beforeEach, describe, expect, it, vi } from "vitest"

const tx = {
  judgeRequest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  reviewNote: { create: vi.fn() },
  job: { update: vi.fn() },
}
const transaction = vi.fn(async (fn: (t: typeof tx) => unknown, _opts?: unknown) => fn(tx))
const revalidatePath = vi.fn()
const revalidateTag = vi.fn()
const after = vi.fn()
const requestRevalidation = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: (fn: (t: typeof tx) => unknown, opts?: unknown) => transaction(fn, opts) },
}))
vi.mock("@/lib/env", () => ({ webEnv: { AUDIT_TOKEN: "audit-token" } }))
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p), revalidateTag: (t: string) => revalidateTag(t) }))
vi.mock("next/server", () => ({ after: (fn: unknown) => after(fn) }))
vi.mock("@/lib/shared/request-revalidation", () => ({ requestRevalidation }))

const { flagForJudge } = await import("./actions")
const { DATA_CACHE_TAG } = await import("@/lib/shared/cache-tags")

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe("flagForJudge", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tx.judgeRequest.findFirst.mockResolvedValue(null)
    tx.job.update.mockResolvedValue({ employerId: "emp-1" })
  })

  it("refuses a bad token before touching the database", async () => {
    await expect(flagForJudge("wrong", "123", form({ kind: "rerun" }))).rejects.toThrow("forbidden")
    expect(transaction).not.toHaveBeenCalled()
  })

  it.each([["bogus"], [""], ["RERUN"]])("rejects kind %j instead of treating it as a rerun", async (kind) => {
    await expect(flagForJudge("audit-token", "123", form({ kind }))).rejects.toThrow(/rerun.*deep/)
    expect(transaction).not.toHaveBeenCalled()
  })

  it("rejects a missing kind", async () => {
    await expect(flagForJudge("audit-token", "123", form({ note: "x" }))).rejects.toThrow()
    expect(transaction).not.toHaveBeenCalled()
  })

  it("writes the request, the note and the send-back in one serializable transaction", async () => {
    await flagForJudge("audit-token", "123", form({ kind: "rerun", note: "  looks wrong  " }))
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" })
    expect(tx.judgeRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workbcId: "123", kind: "rerun", resolvedAt: null } }),
    )
    expect(tx.judgeRequest.create).toHaveBeenCalledWith({ data: { workbcId: "123", kind: "rerun", note: "looks wrong" } })
    expect(tx.reviewNote.create).toHaveBeenCalledWith({ data: { workbcId: "123", body: "[rerun flag] looks wrong" } })
    // The same shape as sendBackToPending in lib/scoring/write-verdict.ts.
    expect(tx.job.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workbcId: "123" }, data: { scoredAt: null, status: "PENDING" } }),
    )
  })

  it("does not open a second request of the same kind, but still records the note", async () => {
    tx.judgeRequest.findFirst.mockResolvedValue({ id: "req-1", note: "first" })
    await flagForJudge("audit-token", "123", form({ kind: "deep", note: "second" }))
    expect(tx.judgeRequest.create).not.toHaveBeenCalled()
    expect(tx.judgeRequest.update).toHaveBeenCalledWith({ where: { id: "req-1" }, data: { note: "first\nsecond" } })
    expect(tx.reviewNote.create).toHaveBeenCalledWith({ data: { workbcId: "123", body: "[deep flag] second" } })
  })

  it("leaves an open request alone when the repeat flag has no note", async () => {
    tx.judgeRequest.findFirst.mockResolvedValue({ id: "req-1", note: null })
    await flagForJudge("audit-token", "123", form({ kind: "rerun", note: "   " }))
    expect(tx.judgeRequest.create).not.toHaveBeenCalled()
    expect(tx.judgeRequest.update).not.toHaveBeenCalled()
    expect(tx.reviewNote.create).not.toHaveBeenCalled()
    expect(tx.job.update).toHaveBeenCalled()
  })

  it("keeps a deep request's posting published and the public caches untouched", async () => {
    await flagForJudge("audit-token", "123", form({ kind: "deep" }))
    expect(tx.judgeRequest.create).toHaveBeenCalledWith({ data: { workbcId: "123", kind: "deep", note: null } })
    expect(tx.job.update).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith("/audit/audit-token/j/123")
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()
  })

  it("refreshes every public page that showed the posting after a rerun, on both replicas", async () => {
    await flagForJudge("audit-token", "123", form({ kind: "rerun" }))
    expect(revalidateTag).toHaveBeenCalledWith(DATA_CACHE_TAG)
    expect(revalidatePath).toHaveBeenCalledWith("/j/123")
    expect(revalidatePath).toHaveBeenCalledWith("/e/emp-1")
    expect(after).toHaveBeenCalledWith(requestRevalidation)
  })

  it("skips the employer page for a posting with no employer", async () => {
    tx.job.update.mockResolvedValue({ employerId: null })
    await flagForJudge("audit-token", "123", form({ kind: "rerun" }))
    expect(revalidatePath.mock.calls.map((c) => c[0])).not.toContainEqual(expect.stringMatching(/^\/e\//))
  })

  it("purges nothing when the transaction fails", async () => {
    transaction.mockRejectedValueOnce(new Error("could not serialize access"))
    await expect(flagForJudge("audit-token", "123", form({ kind: "rerun" }))).rejects.toThrow("serialize")
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()
  })
})
