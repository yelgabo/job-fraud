import { describe, expect, it } from "vitest"
import { composeScore, type Judgments } from "./compose"
import { explainVerdict } from "./explain"

const judgments: Judgments = { routePlausibleForEmployer: 0.9, employerIsOrganisation: 0.9, brokerRouting: 0.1, brandProminence: 2, askBeforeHire: 0 }
const web = { websiteUrl: "https://acme.com", websiteReachable: "yes" as const, businessMatch: "match" as const, locationMatch: "match" as const, hasJobsListing: "yes" as const, applicationAddressType: "none" as const, confidence: 0.9, summary: "Acme exists" }

describe("explainVerdict", () => {
  it("opens with the band and closes with the provenance", () => {
    const r = composeScore({ judgments, checks: {}, flags: [], category: "Other" })
    const text = explainVerdict(r, judgments)
    expect(text.startsWith("Rated low risk.")).toBe(true)
    expect(text).toContain("No check produced evidence either way.")
    expect(text.endsWith("no model chose the number.")).toBe(true)
  })

  it("names the strongest signals in plain language, fraud first", () => {
    const r = composeScore({ judgments, checks: { web }, flags: [{ flag: "crypto_payment", evidence: "btc" }], category: "Other" })
    const text = explainVerdict(r, judgments)
    expect(text).toContain("Counting against it: payment in cryptocurrency is involved.")
    expect(text).toContain("In its favour: web search confirms the employer is a real business")
    expect(text).not.toMatch(/crypto_payment|business_match/)
  })

  it("says why the brand credits were withheld, on Jev's number", () => {
    const r = composeScore({ judgments: { ...judgments, routePlausibleForEmployer: 0.12 }, checks: { web }, flags: [], category: "Other" })
    expect(explainVerdict(r, { ...judgments, routePlausibleForEmployer: 0.12 })).toContain("route plausibility 0.12")
  })

  it("says why the brand credits were withheld, on the flags", () => {
    const r = composeScore({ judgments: null, checks: { web }, flags: [{ flag: "generic_email_domain", evidence: "x@gmail.com" }], category: "Other" })
    expect(explainVerdict(r, null)).toContain("free mailbox or messaging app")
  })
})
