import { describe, expect, it } from "vitest"
import type { WebVerification } from "../shared/json-schemas"
import { verificationAction } from "./verification-plan"

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

  it("re-verifies everything on a rejudge", () => {
    expect(verificationAction("Acme", [online], web(), { rejudge: true })).toBe("web")
  })
})
