import { describe, it, expect } from "vitest"
import { extractAtsTenant, tenantEmployerMatch } from "./apply-host"

describe("extractAtsTenant", () => {
  it("pulls the Workday tenant from the subdomain", () => {
    expect(extractAtsTenant("https://remitly.wd5.myworkdayjobs.com/Remitly_Careers/job/x")).toEqual({
      provider: "workday",
      tenant: "remitly",
    })
    expect(extractAtsTenant("https://relx.wd3.myworkdayjobs.com/relx/job/y")).toEqual({
      provider: "workday",
      tenant: "relx",
    })
  })

  it("pulls Greenhouse / Lever tenants from the path", () => {
    expect(extractAtsTenant("https://boards.greenhouse.io/acmecorp/jobs/123")).toEqual({
      provider: "greenhouse",
      tenant: "acmecorp",
    })
    expect(extractAtsTenant("https://jobs.lever.co/widgetco/abc-def")).toEqual({
      provider: "lever",
      tenant: "widgetco",
    })
  })

  it("handles regional Greenhouse board hosts (tenant in path, not subdomain)", () => {
    expect(extractAtsTenant("https://job-boards.eu.greenhouse.io/cision/jobs/9")).toEqual({
      provider: "greenhouse",
      tenant: "cision",
    })
  })

  it("returns null for non-ATS or unparseable URLs", () => {
    expect(extractAtsTenant("https://www.example.com/careers")).toBeNull()
    expect(extractAtsTenant("not a url")).toBeNull()
  })
})

describe("tenantEmployerMatch", () => {
  it("matches when the tenant equals the employer (tolerant of suffixes)", () => {
    expect(tenantEmployerMatch("Remitly", "https://remitly.wd5.myworkdayjobs.com/x").result).toBe("match")
    expect(tenantEmployerMatch("Remitly Inc.", "https://remitly.wd5.myworkdayjobs.com/x").result).toBe("match")
  })

  it("flags a mismatch when the tenant is a different company", () => {
    const m = tenantEmployerMatch("Remitly", "https://relx.wd3.myworkdayjobs.com/relx/job/y")
    expect(m.result).toBe("mismatch")
    expect(m.tenant).toBe("relx")
    expect(m.provider).toBe("workday")
  })

  it("clears obvious acronym tenants without a web-check (match)", () => {
    expect(tenantEmployerMatch("University of British Columbia", "https://ubc.wd10.myworkdayjobs.com/x").result).toBe("match")
    expect(tenantEmployerMatch("Service Corporation International", "https://sci.wd1.myworkdayjobs.com/x").result).toBe("match")
    expect(tenantEmployerMatch("West Point Grey Academy", "https://wpga.bamboohr.com/careers").result).toBe("match")
    expect(tenantEmployerMatch("Johnson Controls", "https://jci.wd5.myworkdayjobs.com/x").result).toBe("match") // jci ~ JC + Inc
    expect(tenantEmployerMatch("Penfolds Roofing & Solar", "https://penfoldstime.bamboohr.com/x").result).toBe("match") // first-word prefix
  })

  it("does NOT clear a single-word brand whose impersonator tenant shares a first letter", () => {
    // "Remitly" acronym is just "r"; must not match tenant "relx" via the acronym rule.
    expect(tenantEmployerMatch("Remitly", "https://relx.wd3.myworkdayjobs.com/x").result).toBe("mismatch")
    expect(tenantEmployerMatch("Renishaw", "https://relx.wd3.myworkdayjobs.com/x").result).toBe("mismatch")
  })

  it("returns no-tenant when there's nothing to compare", () => {
    expect(tenantEmployerMatch("Remitly", "https://www.example.com/careers").result).toBe("no-tenant")
    expect(tenantEmployerMatch(null, "https://relx.wd3.myworkdayjobs.com/x").result).toBe("no-tenant")
    expect(tenantEmployerMatch("Remitly", null).result).toBe("no-tenant")
  })
})
