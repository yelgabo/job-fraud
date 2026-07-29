import { describe, it, expect } from "vitest"
import { WebVerificationSchema, parseChecks } from "./json-schemas"

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

// AGENTS.md ("The keyless judge path") tells agents that once a `web` object is present it is
// almost entirely required, and that a partial one makes judge:apply skip the whole verdict.
// These cases pin that claim to the schema so the doc cannot drift away from it silently.
describe("WebVerificationSchema field requiredness (as documented in AGENTS.md)", () => {
  const full = {
    websiteUrl: "https://acme.com",
    websiteReachable: "yes",
    businessMatch: "match",
    locationMatch: "match",
    hasJobsListing: "yes",
    applicationAddressType: "business",
    confidence: 0.85,
    summary: "reachable, matches",
  }

  it.each([
    "websiteUrl",
    "websiteReachable",
    "businessMatch",
    "locationMatch",
    "hasJobsListing",
    "confidence",
    "summary",
  ])("rejects a web object missing %s", (field) => {
    const partial: Record<string, unknown> = { ...full }
    delete partial[field]
    expect(WebVerificationSchema.safeParse(partial).success).toBe(false)
  })

  it("accepts a null websiteUrl (required but nullable)", () => {
    const v = WebVerificationSchema.parse({ ...full, websiteUrl: null })
    expect(v.websiteUrl).toBeNull()
  })

  it("defaults applicationAddressType to none and leaves source optional", () => {
    const partial: Record<string, unknown> = { ...full }
    delete partial.applicationAddressType
    const v = WebVerificationSchema.parse(partial)
    expect(v.applicationAddressType).toBe("none")
    expect(v.source).toBeUndefined()
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
