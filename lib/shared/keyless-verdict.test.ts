import { describe, expect, it } from "vitest"
import { VerdictSchema } from "./keyless-verdict"

const web = {
  websiteUrl: "https://acme.com",
  websiteReachable: "yes",
  businessMatch: "match",
  locationMatch: "match",
  hasJobsListing: "yes",
  applicationAddressType: "business",
  confidence: 0.9,
  summary: "Real company.",
}

describe("VerdictSchema", () => {
  it("accepts the three labels the tiered check produces", () => {
    for (const verifiedBy of ["haiku-5.5", "opus-5.5", "haiku-5.5>opus-5.5"]) {
      expect(VerdictSchema.safeParse({ workbcId: "1", web: { ...web, verifiedBy } }).success).toBe(true)
    }
  })

  it("rejects a verdict with no label or a made-up one", () => {
    expect(VerdictSchema.safeParse({ workbcId: "1", web }).success).toBe(false)
    expect(VerdictSchema.safeParse({ workbcId: "1", web: { ...web, verifiedBy: "opus" } }).success).toBe(false)
  })

  it("drops an agent's source and addressChecked, so it cannot pass for a presumption", () => {
    const parsed = VerdictSchema.parse({
      workbcId: "1",
      web: { ...web, verifiedBy: "haiku-5.5", source: "ats-tenant-match", addressChecked: "x" },
    })
    expect(parsed.web).not.toHaveProperty("source")
    expect(parsed.web).not.toHaveProperty("addressChecked")
  })

  it("drops a score an agent sends", () => {
    const parsed = VerdictSchema.parse({ workbcId: "1", fraudScore: 99, web: { ...web, verifiedBy: "opus-5.5" } })
    expect(parsed).not.toHaveProperty("fraudScore")
  })
})
