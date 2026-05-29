import { describe, it, expect } from "vitest"
import { detectFlags } from "./application-flags"

function flagNames(text: string): string[] {
  return detectFlags(text).map((f) => f.flag)
}

describe("detectFlags — mail_physical_resume", () => {
  it("catches the classic 'mail your resume to <address>' phrasing", () => {
    expect(flagNames("Mail your resume to PO Box 123")).toContain("mail_physical_resume")
  })

  it("catches the real WorkBC 'By mail: <street address>' phrasing (regression)", () => {
    const text = "How to apply By mail: Room 9265 135 Street Surrey British Columbia V3V 5T9"
    expect(flagNames(text)).toContain("mail_physical_resume")
  })

  it("does not fire when applying online with no mailing address", () => {
    expect(flagNames("Send your application through our careers portal.")).not.toContain(
      "mail_physical_resume",
    )
  })
})

describe("detectFlags — generic_email_domain", () => {
  it("flags free consumer email providers", () => {
    expect(flagNames("Apply to orxsurgical@outlook.com")).toContain("generic_email_domain")
    expect(flagNames("email careers@gmail.com")).toContain("generic_email_domain")
  })

  it("does NOT flag a company-domain email (regression: idmelon.com is legitimate)", () => {
    expect(flagNames("Apply to jobs@idmelon.com")).not.toContain("generic_email_domain")
    expect(flagNames("contact hiring@arya-health.ca")).not.toContain("generic_email_domain")
  })
})

describe("detectFlags — other detectors", () => {
  it("flags fee-to-apply, id-upfront, and messaging-app-only", () => {
    expect(flagNames("A $200 application fee is required.")).toContain("fee_to_apply")
    expect(flagNames("Submit your SIN before the interview.")).toContain("id_upfront")
    expect(flagNames("Apply via WhatsApp only.")).toContain("whatsapp_telegram_only")
  })

  it("flags crypto payment only in a payment context (not generic blockchain roles)", () => {
    expect(flagNames("You will be paid in Bitcoin weekly.")).toContain("crypto_payment")
    expect(flagNames("salary paid in USDT")).toContain("crypto_payment")
    // a legitimate blockchain engineering role that merely mentions crypto should not trip
    expect(flagNames("Build smart contracts and cryptocurrency exchange integrations.")).not.toContain(
      "crypto_payment",
    )
  })

  it("flags requests for banking info / void cheque upfront", () => {
    expect(flagNames("Send a void cheque to set up payroll.")).toContain("banking_info_upfront")
    expect(flagNames("Provide your bank account details before your first day.")).toContain(
      "banking_info_upfront",
    )
  })

  it("returns no flags for a clean posting", () => {
    expect(detectFlags("Apply on our website. Competitive salary and benefits.")).toEqual([])
  })

  it("attaches evidence to each flag", () => {
    const flags = detectFlags("Apply to orxsurgical@outlook.com")
    expect(flags[0].evidence).toContain("orxsurgical@outlook.com")
  })
})
