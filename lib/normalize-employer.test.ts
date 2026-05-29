import { describe, it, expect } from "vitest"
import { normalizeEmployer } from "./normalize-employer"

describe("normalizeEmployer", () => {
  it("collapses suffix/case/punctuation variants to the same key", () => {
    expect(normalizeEmployer("Acme Corp.")).toBe("acme")
    expect(normalizeEmployer("acme   corporation")).toBe("acme")
    expect(normalizeEmployer("ACME, Inc.")).toBe("acme")
    expect(normalizeEmployer("Acme Corp.")).toBe(normalizeEmployer("acme corporation"))
  })

  it("strips a single legal suffix but keeps the distinctive name", () => {
    expect(normalizeEmployer("IDmelon Technologies Inc.")).toBe("idmelon technologies")
    expect(normalizeEmployer("New Global One Data Inc.")).toBe("new global one data")
    expect(normalizeEmployer("Astrom training solutions Inc.")).toBe("astrom training solutions")
  })

  it("leaves names without a legal suffix intact (lowercased)", () => {
    expect(normalizeEmployer("ORX Surgical")).toBe("orx surgical")
    expect(normalizeEmployer("Uride")).toBe("uride")
  })
})
