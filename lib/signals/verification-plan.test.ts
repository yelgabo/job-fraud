import { describe, expect, it } from "vitest"
import type { WebVerification } from "../shared/json-schemas"
import { planByEmployer, presumedVerdict, verificationAction } from "./verification-plan"

const web = (over: Partial<WebVerification> = {}): WebVerification => ({
  websiteUrl: "https://acme.com",
  websiteReachable: "yes",
  businessMatch: "match",
  locationMatch: "match",
  hasJobsListing: "yes",
  applicationAddressType: "none",
  confidence: 0.9,
  summary: "Real company.",
  ...over,
})
const online = { externalApplyUrl: "https://example.com/apply", applicationFlags: [] }
const mailing = { externalApplyUrl: null, applicationFlags: [{ flag: "mail_physical_resume", evidence: "12 Main St" }] }
const ownTenant = { externalApplyUrl: "https://acme.wd3.myworkdayjobs.com/en-US/careers/job/1", applicationFlags: [] }

describe("verificationAction", () => {
  it("verifies an employer with no cached verdict", () => {
    expect(verificationAction("Acme", [online], undefined)).toBe("web")
  })

  it("presumes an employer whose postings all apply through its own ATS tenant", () => {
    expect(verificationAction("Acme", [ownTenant], undefined)).toBe("presume")
  })

  it("reuses a cached verdict", () => {
    expect(verificationAction("Acme", [online], web())).toBe("reuse")
  })

  it("re-verifies when a cached 'none' meets a posting that gives a mailing address", () => {
    expect(verificationAction("Acme", [online, mailing], web({ applicationAddressType: "none" }))).toBe("web")
  })

  it("re-verifies a presumed verdict once a posting leaves the employer's own tenant", () => {
    expect(verificationAction("Acme", [ownTenant, online], web({ source: "ats-tenant-match" }))).toBe("web")
  })

  it("re-verifies an alarming cached verdict that no escalation model confirmed", () => {
    expect(verificationAction("Acme", [online], web({ businessMatch: "mismatch" }))).toBe("web")
    expect(verificationAction("Acme", [mailing], web({ applicationAddressType: "uncertain", verifiedBy: "haiku-5.5" }))).toBe("web")
  })

  it("reuses an alarming cached verdict the escalation model gave", () => {
    expect(verificationAction("Acme", [online], web({ businessMatch: "mismatch", verifiedBy: "opus-5.5" }))).toBe("reuse")
    expect(verificationAction("Acme", [mailing], web({ applicationAddressType: "residential", verifiedBy: "haiku-5.5>opus-5.5" }))).toBe("reuse")
  })

  it("re-verifies everything on a rejudge", () => {
    expect(verificationAction("Acme", [online], web(), { rejudge: true })).toBe("web")
  })
})

describe("planByEmployer", () => {
  const job = (workbcId: string, employerId: string | null, over: Partial<{ externalApplyUrl: string | null; applicationFlags: unknown }> = {}, checks: unknown = {}) => ({
    workbcId,
    employerId,
    ...online,
    ...over,
    employer: employerId ? { nameDisplay: "Acme", checks } : null,
  })

  it("makes one plan per employer and shows the verifier a posting that mails applications", () => {
    const plans = planByEmployer([job("1", "e1"), job("2", "e1", mailing), job("3", "e2", {}, { web: web() })])
    expect(plans.map((p) => [p.employerId, p.action, p.postings.length])).toEqual([["e1", "web", 2], ["e2", "reuse", 1]])
    expect(plans[0].representative.workbcId).toBe("2")
  })

  it("treats each posting without an employer as its own check", () => {
    const plans = planByEmployer([job("1", null), job("2", null)])
    expect(plans.map((p) => [p.representative.workbcId, p.action])).toEqual([["1", "web"], ["2", "web"]])
  })
})

describe("presumedVerdict", () => {
  it("names the matched ATS and marks the verdict as a presumption", () => {
    const v = presumedVerdict("Acme", [ownTenant])
    expect(v.source).toBe("ats-tenant-match")
    expect(v.businessMatch).toBe("match")
    expect(v.summary).toMatch(/workday/i)
  })
})

