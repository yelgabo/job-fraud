import { describe, expect, it, vi } from "vitest"

vi.mock("../db", () => ({ prisma: {} }))
const { deriveStatus } = await import("./derive-status")

const at = new Date("2026-11-01")
const row = (o: Partial<Parameters<typeof deriveStatus>[0]>) => ({
  scoredAt: null,
  scoringVersion: null,
  fraudScore: null,
  reasoning: null,
  ...o,
})

describe("deriveStatus", () => {
  it("leaves a never-judged row pending with no kind", () => {
    expect(deriveStatus(row({}))).toEqual({ status: "PENDING", verdictKind: null })
  })

  it("marks a composed row by its version", () => {
    expect(deriveStatus(row({ scoredAt: at, scoringVersion: 2, fraudScore: 12, reasoning: "x" }))).toEqual({
      status: "PUBLISHED",
      verdictKind: "COMPOSED",
    })
  })

  it("marks an unversioned scored row as a model verdict, including a failed -1", () => {
    expect(deriveStatus(row({ scoredAt: at, fraudScore: 55, reasoning: "x" })).verdictKind).toBe("MODEL")
    expect(deriveStatus(row({ scoredAt: at, fraudScore: -1, reasoning: null })).verdictKind).toBe("MODEL")
  })

  it("marks an impersonation by its prefix, even on an old row that kept a version", () => {
    const reasoning = "Brand impersonation: presents as Acme"
    expect(deriveStatus(row({ scoredAt: at, fraudScore: 90, reasoning })).verdictKind).toBe("IMPERSONATION")
    expect(deriveStatus(row({ scoredAt: at, scoringVersion: 1, fraudScore: 90, reasoning })).verdictKind).toBe("IMPERSONATION")
  })

  it("keeps the old verdict's kind on a row a rerun sent back to pending", () => {
    expect(deriveStatus(row({ scoringVersion: 2, fraudScore: 30, reasoning: "x" }))).toEqual({
      status: "PENDING",
      verdictKind: "COMPOSED",
    })
  })
})
