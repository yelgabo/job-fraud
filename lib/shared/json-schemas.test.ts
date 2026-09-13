import { describe, it, expect } from "vitest"
import { WebVerificationSchema, parseChecks, ScoringSignalsSchema, parseSignals } from "./json-schemas"

describe("WebVerificationSchema", () => {
  it("parses a full verdict and nulls an empty websiteUrl", () => {
    const v = WebVerificationSchema.parse({
      websiteUrl: "",
      websiteReachable: "yes",
      businessMatch: "match",
      locationMatch: "uncertain",
      hasJobsListing: "no",
      confidence: 0.8,
      summary: "ok",
    })
    expect(v.websiteUrl).toBeNull()
    expect(v.businessMatch).toBe("match")
  })

  it("trims and keeps a real websiteUrl", () => {
    const v = WebVerificationSchema.parse({
      websiteUrl: " https://acme.com ",
      websiteReachable: "yes",
      businessMatch: "match",
      locationMatch: "match",
      hasJobsListing: "yes",
      confidence: 0.9,
      summary: "real",
    })
    expect(v.websiteUrl).toBe("https://acme.com")
  })

  it("rejects an invalid enum or out-of-range confidence", () => {
    const base = {
      websiteUrl: "x",
      websiteReachable: "yes",
      businessMatch: "match",
      locationMatch: "match",
      hasJobsListing: "yes",
      confidence: 1,
      summary: "",
    }
    expect(() => WebVerificationSchema.parse({ ...base, businessMatch: "nope" })).toThrow()
    expect(() => WebVerificationSchema.parse({ ...base, confidence: 5 })).toThrow()
  })
})

describe("ChecksSchema.web", () => {
  it("accepts web present, null, or absent", () => {
    expect(parseChecks({}).web).toBeUndefined()
    expect(parseChecks({ web: null }).web).toBeNull()
    const c = parseChecks({
      web: {
        websiteUrl: "https://x.com",
        websiteReachable: "yes",
        businessMatch: "match",
        locationMatch: "match",
        hasJobsListing: "yes",
        confidence: 0.9,
        summary: "s",
      },
    })
    expect(c.web?.websiteUrl).toBe("https://x.com")
  })
})


describe("scoring signal bounds", () => {
  it.each([-30, 0, 35, 45])("accepts the approved integer weight %i for new verdicts", (weight) => {
    expect(ScoringSignalsSchema.parse([{ label: "signal", weight, evidence: "source" }])[0].weight).toBe(weight)
  })

  it.each([-31, 46, 35.5])("rejects weight %s outside the new-verdict contract", (weight) => {
    expect(ScoringSignalsSchema.safeParse([{ label: "signal", weight, evidence: "source" }]).success).toBe(false)
  })

  it("keeps historical signal records readable without rewriting their values", () => {
    const historical = [{ label: "legacy", weight: 50.5, evidence: "stored evidence" }]
    expect(parseSignals(historical)).toEqual(historical)
  })
})
