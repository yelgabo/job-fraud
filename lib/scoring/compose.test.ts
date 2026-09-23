import { describe, expect, it } from "vitest"
import { composeScore, type ComposeInput, type Judgments } from "./compose"
import { BASELINE, DETERMINISTIC, FLOORS, JUDGMENT, JUDGMENT_NOUL_NEUTRAL, ROUTE_PLAUSIBLE_THRESHOLD } from "./weights"
import { humanizeSignalLabel } from "../shared/signal-labels"

const CLEAN_JUDGMENTS: Judgments = {
  routePlausibleForEmployer: 0.9,
  employerIsOrganisation: 0.9,
  brokerRouting: 0.1,
  brandProminence: 1,
  askBeforeHire: 0,
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

const verifiedBrand = {
  websiteUrl: "https://timhortons.ca", websiteReachable: "yes" as const,
  businessMatch: "match" as const, locationMatch: "match" as const,
  hasJobsListing: "yes" as const, applicationAddressType: "none" as const,
  confidence: 0.9, summary: "Tim Hortons is a real chain",
}
const BRAND_CREDITS = ["apply_address_none", "business_match", "jobs_listing", "location_match"]

describe("composeScore", () => {
  it("scores a posting with no evidence at the baseline", () => {
    const r = composeScore(base())
    expect(r.signals).toEqual([])
    expect(r.fraudScore).toBe(BASELINE)
    expect(r.routeDisowned).toBeNull()
  })

  it("treats clean judgments as contributing nothing", () => {
    expect(composeScore(base({ judgments: CLEAN_JUDGMENTS })).fraudScore).toBe(BASELINE)
  })

  it("is pure: the same input gives the same output", () => {
    const input = base({ flags: [{ flag: "crypto_payment", evidence: "paid in bitcoin" }] })
    expect(composeScore(input)).toEqual(composeScore(input))
  })

  describe("null checks never count against a posting", () => {
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
    it("credits a verified employer when nothing disowns the route", () => {
      const r = composeScore(base({ checks: { web: verifiedBrand } }))
      expect(r.signals.map((s) => s.label).sort()).toEqual(BRAND_CREDITS)
    })

    describe("without judgments the flags decide", () => {
      it("withholds every brand credit when contact is a free consumer mailbox", () => {
        const r = composeScore(base({
          checks: { web: verifiedBrand },
          flags: [{ flag: "generic_email_domain", evidence: "teamtims@gmail.com" }],
        }))
        expect(r.signals.map((s) => s.label)).toEqual(["generic_email_domain"])
        expect(r.riskBand).toBe("medium")
        expect(r.routeDisowned).toBe("flags")
      })

      it("still applies the penalties on those same fields", () => {
        const r = composeScore(base({
          checks: { web: { ...verifiedBrand, businessMatch: "mismatch", locationMatch: "mismatch" } },
          flags: [{ flag: "generic_email_domain", evidence: "x@gmail.com" }],
        }))
        expect(r.signals.map((s) => s.label).sort()).toEqual(["business_mismatch", "generic_email_domain", "location_mismatch"])
      })
    })

    describe("with judgments the route question decides, graded", () => {
      const gmail = [{ flag: "generic_email_domain", evidence: "x@gmail.com" }]

      it("a national chain on gmail loses the credits", () => {
        const r = composeScore(base({
          checks: { web: verifiedBrand }, flags: gmail,
          judgments: { ...CLEAN_JUDGMENTS, routePlausibleForEmployer: 0.10, brandProminence: 3 },
        }))
        expect(r.signals.map((s) => s.label)).toEqual(["generic_email_domain"])
        expect(r.routeDisowned).toBe("judgment")
      })

      it("a neighbourhood pub on gmail keeps them, and still pays the email penalty", () => {
        const r = composeScore(base({
          checks: { web: { ...verifiedBrand, summary: "Browns Crafthouse, one pub" } }, flags: gmail,
          judgments: { ...CLEAN_JUDGMENTS, routePlausibleForEmployer: 0.77, brandProminence: 1 },
        }))
        expect(r.signals.map((s) => s.label).sort()).toEqual([...BRAND_CREDITS, "generic_email_domain"].sort())
        expect(r.routeDisowned).toBeNull()
      })

      it("the threshold is the boundary", () => {
        const at = base({ checks: { web: verifiedBrand }, judgments: { ...CLEAN_JUDGMENTS, routePlausibleForEmployer: ROUTE_PLAUSIBLE_THRESHOLD } })
        const below = base({ checks: { web: verifiedBrand }, judgments: { ...CLEAN_JUDGMENTS, routePlausibleForEmployer: ROUTE_PLAUSIBLE_THRESHOLD - 0.01 } })
        expect(composeScore(at).routeDisowned).toBeNull()
        expect(composeScore(below).routeDisowned).toBe("judgment")
      })

      it("overrides the flags in both directions", () => {
        const noFlagButImplausible = base({ checks: { web: verifiedBrand }, judgments: { ...CLEAN_JUDGMENTS, routePlausibleForEmployer: 0.2 } })
        expect(composeScore(noFlagButImplausible).routeDisowned).toBe("judgment")
      })
    })

    it("a private mailing address is never suppressed", () => {
      const r = composeScore(base({
        checks: { web: { ...verifiedBrand, applicationAddressType: "residential" } },
        flags: [
          { flag: "generic_email_domain", evidence: "x@gmail.com" },
          { flag: "mail_physical_resume", evidence: "By mail: 12 Somewhere Cres" },
        ],
      }))
      expect(r.signals.map((s) => s.label)).toContain("apply_address_private")
      expect(r.riskBand).toBe("high")
    })
  })

  describe("an employer-level address verdict only touches postings that mail", () => {
    const residentialEmployer = {
      web: { websiteUrl: null, websiteReachable: "unknown" as const, businessMatch: "match" as const,
        locationMatch: "match" as const, hasJobsListing: "no" as const,
        applicationAddressType: "residential" as const, confidence: 0.9, summary: "a house" },
    }

    it("penalises the posting that actually mails to the house", () => {
      const r = composeScore(base({ checks: residentialEmployer, flags: [{ flag: "mail_physical_resume", evidence: "By mail: 3444 Caldera Ct" }] }))
      expect(r.signals.map((s) => s.label)).toContain("apply_address_private")
      expect(r.riskBand).toBe("high")
    })

    it("spares a sibling posting that applies online", () => {
      const r = composeScore(base({ checks: residentialEmployer }))
      expect(r.signals.map((s) => s.label)).not.toContain("apply_address_private")
      expect(r.riskBand).toBe("low")
    })
  })

  describe("floors", () => {
    const privateAddress = base({
      checks: { web: { websiteUrl: null, websiteReachable: "unknown", businessMatch: "match", locationMatch: "match", hasJobsListing: "yes", applicationAddressType: "residential", confidence: 0.9, summary: "a house" } },
      flags: [
        { flag: "ats_known_provider", evidence: "greenhouse.io" },
        { flag: "mail_physical_resume", evidence: "By mail: 12 Somewhere Cres" },
      ],
    })

    it("a private mailing address lands high even against every legitimacy credit", () => {
      const r = composeScore(privateAddress)
      expect(r.fraudScore).toBeGreaterThanOrEqual(FLOORS.apply_address_private)
      expect(r.riskBand).toBe("high")
    })

    it("an asserted pre-hire money request lands high", () => {
      const r = composeScore(base({ judgments: { ...CLEAN_JUDGMENTS, askBeforeHire: 0.95 } }))
      expect(r.fraudScore).toBeGreaterThanOrEqual(FLOORS.pre_hire_ask)
    })

    it("leaves an uncertain pre-hire request below the floor", () => {
      const r = composeScore(base({ judgments: { ...CLEAN_JUDGMENTS, askBeforeHire: 0.5 } }))
      expect(r.fraudScore).toBeLessThan(FLOORS.pre_hire_ask)
    })
  })

  describe("judgment weights", () => {
    it("charges the pre-hire ask from the neutral point up to its peak", () => {
      expect(weightOf(base({ judgments: { ...CLEAN_JUDGMENTS, askBeforeHire: 1 } }), "pre_hire_ask")).toBe(JUDGMENT.pre_hire_ask)
      expect(weightOf(base({ judgments: { ...CLEAN_JUDGMENTS, askBeforeHire: 0.75 } }), "pre_hire_ask")).toBe(Math.round(0.5 * JUDGMENT.pre_hire_ask))
      expect(weightOf(base({ judgments: { ...CLEAN_JUDGMENTS, askBeforeHire: JUDGMENT_NOUL_NEUTRAL } }), "pre_hire_ask")).toBeUndefined()
    })

    it("a clean posting's residual probability never becomes a published claim", () => {
      // 0.05 * 25 rounds to 1, and the label for that 1 says money was requested.
      const r = composeScore(base({ judgments: { ...CLEAN_JUDGMENTS, askBeforeHire: 0.05 } }))
      expect(r.signals).toEqual([])
    })

    it("stores but never weights the unmeasured questions", () => {
      const extreme = base({ judgments: { ...CLEAN_JUDGMENTS, employerIsOrganisation: 0, brokerRouting: 1, brandProminence: 3 } })
      expect(composeScore(extreme).fraudScore).toBe(BASELINE)
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
