import { describe, expect, it } from "vitest"
import { composeScore, type ComposeInput, type Judgments } from "./compose"
import { BASELINE, DETERMINISTIC, FLOORS, JUDGMENT } from "./weights"
import { humanizeSignalLabel } from "../shared/signal-labels"

const CLEAN_JUDGMENTS: Judgments = {
  specificity: 3,
  employerSubstantiation: 3,
  payPlausibility: null,
  urgency: 0,
  preHireAsk: 0,
  moneyHandling: 0,
  roleCoherence: 1,
}

const base = (over: Partial<ComposeInput> = {}): ComposeInput => ({
  judgments: null,
  checks: {},
  flags: [],
  category: "Other",
  ...over,
})

const weightOf = (input: ComposeInput, label: string) =>
  composeScore(input).signals.find((s) => s.label === label)?.weight

describe("composeScore", () => {
  it("scores a posting with no evidence at the baseline", () => {
    const r = composeScore(base())
    expect(r.signals).toEqual([])
    expect(r.fraudScore).toBe(BASELINE)
  })

  it("treats neutral judgments as contributing nothing", () => {
    expect(composeScore(base({ judgments: CLEAN_JUDGMENTS })).fraudScore).toBe(BASELINE)
  })

  it("is pure: the same input gives the same output", () => {
    const input = base({ flags: [{ flag: "crypto_payment", evidence: "paid in bitcoin" }] })
    expect(composeScore(input)).toEqual(composeScore(input))
  })

  describe("null checks never count against a posting", () => {
    // The prompt spends five lines and capital letters on this rule; here it is a comparison.
    it.each(["addressGeocoded", "addressMatchesCity", "websiteReachable"] as const)("%s null is neutral", (key) => {
      expect(composeScore(base({ checks: { [key]: null } })).fraudScore).toBe(BASELINE)
    })

    it("an unchecked address is not the same as one that failed to resolve", () => {
      expect(composeScore(base({ checks: { addressGeocoded: null } })).fraudScore).toBe(BASELINE)
      expect(composeScore(base({ checks: { addressGeocoded: false } })).fraudScore).toBe(
        BASELINE + DETERMINISTIC.address_not_geocoded,
      )
    })
  })

  describe("deterministic signals", () => {
    it("credits a recognized hiring system", () => {
      const input = base({ flags: [{ flag: "ats_known_provider", evidence: "myworkdayjobs.com" }] })
      expect(weightOf(input, "ats_known_provider")).toBe(DETERMINISTIC.ats_known_provider)
    })

    it.each([
      ["crypto_payment", DETERMINISTIC.crypto_payment],
      ["banking_info_upfront", DETERMINISTIC.banking_info_upfront],
      ["fee_to_apply", DETERMINISTIC.fee_to_apply],
      ["id_upfront", DETERMINISTIC.id_upfront],
      ["whatsapp_telegram_only", DETERMINISTIC.whatsapp_telegram_only],
    ])("fires %s at its table weight", (flag, weight) => {
      expect(weightOf(base({ flags: [{ flag, evidence: "x" }] }), flag)).toBe(weight)
    })

    it("charges extra for a free-provider email when the website is also unreachable", () => {
      const withSite = base({ flags: [{ flag: "generic_email_domain", evidence: "a@gmail.com" }] })
      const without = base({
        flags: [{ flag: "generic_email_domain", evidence: "a@gmail.com" }],
        checks: { websiteReachable: false },
      })
      expect(weightOf(withSite, "generic_email_domain")).toBe(DETERMINISTIC.generic_email_domain)
      expect(weightOf(without, "generic_email_domain")).toBe(
        DETERMINISTIC.generic_email_domain + DETERMINISTIC.generic_email_no_website,
      )
    })

    it("only penalizes a mailed résumé for a software role", () => {
      const flags = [{ flag: "mail_physical_resume", evidence: "mail your resume" }]
      expect(weightOf(base({ flags, category: "Food Service" }), "mail_resume_software_role")).toBeUndefined()
      expect(weightOf(base({ flags, category: "Software & Data" }), "mail_resume_software_role")).toBe(
        DETERMINISTIC.mail_resume_software_role,
      )
    })
  })

  describe("brand credit is conditional on an employer-owned application route", () => {
    const verifiedBrand = {
      websiteUrl: "https://timhortons.ca", websiteReachable: "yes" as const,
      businessMatch: "match" as const, locationMatch: "match" as const,
      hasJobsListing: "yes" as const, applicationAddressType: "none" as const,
      confidence: 0.9, summary: "Tim Hortons is a real chain",
    }

    it("credits a verified employer when nothing disowns the route", () => {
      const r = composeScore(base({ checks: { web: verifiedBrand } }))
      expect(r.signals.map((s) => s.label).sort()).toEqual(["apply_address_none", "business_match", "jobs_listing", "location_match"])
    })

    it("withholds every brand credit when contact is a free consumer mailbox", () => {
      const r = composeScore(base({
        checks: { web: verifiedBrand },
        flags: [{ flag: "generic_email_domain", evidence: "teamtims@gmail.com" }],
      }))
      expect(r.signals.map((s) => s.label)).toEqual(["generic_email_domain"])
      expect(r.riskBand).toBe("medium")
    })

    it("still applies the penalties on those same fields", () => {
      const r = composeScore(base({
        checks: { web: { ...verifiedBrand, businessMatch: "mismatch", locationMatch: "mismatch" } },
        flags: [{ flag: "generic_email_domain", evidence: "x@gmail.com" }],
      }))
      expect(r.signals.map((s) => s.label).sort()).toEqual(["business_mismatch", "generic_email_domain", "location_mismatch"])
    })

    it("a private mailing address is never suppressed", () => {
      const r = composeScore(base({
        checks: { web: { ...verifiedBrand, applicationAddressType: "residential" } },
        flags: [{ flag: "generic_email_domain", evidence: "x@gmail.com" }],
      }))
      expect(r.signals.map((s) => s.label)).toContain("apply_address_private")
      expect(r.riskBand).toBe("high")
    })
  })

  describe("floors", () => {
    const privateAddress = base({
      checks: { web: { websiteUrl: null, websiteReachable: "unknown", businessMatch: "match", locationMatch: "match", hasJobsListing: "yes", applicationAddressType: "residential", confidence: 0.9, summary: "a house" } },
      flags: [{ flag: "ats_known_provider", evidence: "greenhouse.io" }],
    })

    it("a private mailing address lands high even against every legitimacy credit", () => {
      const r = composeScore(privateAddress)
      expect(r.fraudScore).toBeGreaterThanOrEqual(FLOORS.apply_address_private)
      expect(r.riskBand).toBe("high")
    })

    it("an asserted pre-hire money request lands high", () => {
      const r = composeScore(base({ judgments: { ...CLEAN_JUDGMENTS, preHireAsk: 0.95 } }))
      expect(r.fraudScore).toBeGreaterThanOrEqual(FLOORS.pre_hire_ask)
    })

    it("leaves an uncertain pre-hire request below the floor", () => {
      const r = composeScore(base({ judgments: { ...CLEAN_JUDGMENTS, preHireAsk: 0.5 } }))
      expect(r.fraudScore).toBeLessThan(FLOORS.pre_hire_ask)
    })
  })

  describe("judgment scaling", () => {
    it("charges nothing at or above the acceptable rubric level", () => {
      for (const specificity of [2, 3]) {
        expect(weightOf(base({ judgments: { ...CLEAN_JUDGMENTS, specificity } }), "vague_description")).toBeUndefined()
      }
    })

    it("charges the full weight at the worst rubric level", () => {
      expect(weightOf(base({ judgments: { ...CLEAN_JUDGMENTS, specificity: 0 } }), "vague_description")).toBe(
        JUDGMENT.vague_description,
      )
    })

    it("skips pay entirely when the posting states none", () => {
      expect(weightOf(base({ judgments: { ...CLEAN_JUDGMENTS, payPlausibility: null } }), "pay_implausible")).toBeUndefined()
    })
  })

  describe("output shape", () => {
    it("clamps to 0..100", () => {
      const allBad = base({
        flags: ["crypto_payment", "banking_info_upfront", "fee_to_apply", "id_upfront", "whatsapp_telegram_only", "generic_email_domain"].map((flag) => ({ flag, evidence: "x" })),
        checks: { addressGeocoded: false, addressMatchesCity: false, websiteReachable: false },
      })
      expect(composeScore(allBad).fraudScore).toBeLessThanOrEqual(100)
      expect(composeScore(base({ flags: [{ flag: "ats_known_provider", evidence: "x" }] })).fraudScore).toBeGreaterThanOrEqual(0)
    })

    it("sorts signals strongest fraud first", () => {
      const r = composeScore(base({
        flags: [{ flag: "ats_known_provider", evidence: "x" }, { flag: "crypto_payment", evidence: "y" }],
      }))
      expect(r.signals.map((s) => s.weight)).toEqual([...r.signals.map((s) => s.weight)].sort((a, b) => b - a))
    })
  })

  it("every label the composer can emit has a plain-language rendering", () => {
    // signal-labels.ts renders an unknown label verbatim, which for a closed vocabulary would
    // leak an internal id onto the site. Adding a weight-table row means adding its wording.
    const ids = [...Object.keys(DETERMINISTIC), ...Object.keys(JUDGMENT)].filter(
      (id) => id !== "generic_email_no_website",
    )
    const unmapped = ids.filter((id) => humanizeSignalLabel(id) === id)
    expect(unmapped).toEqual([])
  })
})
