// Turns raw judgments plus deterministic evidence into the stored verdict. Pure: same input,
// same output, no clock, no network, no model. Both judging paths call this so a posting cannot
// score differently depending on which one drained the queue.

import type { ApplicationFlag, Checks, Signal, WebVerification } from "../shared/json-schemas"
import type { Category } from "../signals/job-category"
import { bandFor, type RiskBand } from "../shared/risk-band"
import {
  BASELINE,
  DETERMINISTIC,
  FLOOR_NOUL_THRESHOLD,
  FLOORS,
  JUDGMENT,
  MAX_SIGNAL_WEIGHT,
  MIN_SIGNAL_WEIGHT,
  type DeterministicId,
} from "./weights"

/** Text judgments. Scores are rubric indices 0..3; nouls are probabilities 0..1. */
export type Judgments = {
  specificity: number
  employerSubstantiation: number
  payPlausibility: number | null
  urgency: number
  preHireAsk: number
  moneyHandling: number
  roleCoherence: number
}

export type ComposeInput = {
  judgments: Judgments | null
  checks: Checks
  flags: ApplicationFlag[]
  category: Category
}

export type ComposeResult = {
  fraudScore: number
  riskBand: RiskBand
  signals: Signal[]
}

const SOFTWARE_CATEGORIES: ReadonlySet<Category> = new Set(["Software & Data", "IT & Infrastructure"])

const clampWeight = (w: number) => Math.max(MIN_SIGNAL_WEIGHT, Math.min(MAX_SIGNAL_WEIGHT, w))

function deterministicSignals(input: ComposeInput): Signal[] {
  const out: Signal[] = []
  const add = (id: DeterministicId, evidence: string, weight?: number) =>
    out.push({ label: id, weight: clampWeight(weight ?? DETERMINISTIC[id]), evidence })

  const flag = (name: string) => input.flags.find((f) => f.flag === name)
  const web: WebVerification | null | undefined = input.checks.web
  const c = input.checks

  const ats = flag("ats_known_provider")
  if (ats) add("ats_known_provider", ats.evidence || "applies through a recognized hiring system")

  if (web) {
    if (web.businessMatch === "match") add("business_match", web.summary)
    if (web.businessMatch === "mismatch") add("business_mismatch", web.summary)
    if (web.locationMatch === "match") add("location_match", web.summary)
    if (web.locationMatch === "mismatch") add("location_mismatch", web.summary)
    if (web.hasJobsListing === "yes") add("jobs_listing", web.websiteUrl ?? web.summary)

    const addr = web.applicationAddressType
    if (addr === "business") add("apply_address_business", web.summary)
    if (addr === "none") add("apply_address_none", "the posting asks for no mailed materials")
    if (addr === "residential" || addr === "po_box" || addr === "virtual") {
      add("apply_address_private", `applications are mailed to a ${addr} address: ${web.summary}`)
    }
  }

  // `null` on any check means not checked, which must never count against a posting. Comparing
  // against an explicit value is what makes that true, rather than a paragraph asking for it.
  if (c.addressGeocoded === false || (typeof c.addressMatchConfidence === "number" && c.addressMatchConfidence < 0.5)) {
    add("address_not_geocoded", c.addressResolvedTo ?? "the stated address did not resolve")
  }
  if (c.addressMatchesCity === true) add("address_city_match", c.addressResolvedTo ?? "address resolves to the stated city")
  if (c.addressMatchesCity === false) add("address_city_mismatch", c.addressResolvedTo ?? "address resolves to a different city")
  if (c.websiteReachable === false) add("website_unreachable", `website returned ${c.websiteStatusCode ?? "no response"}`)

  const email = flag("generic_email_domain")
  if (email) {
    const extra = c.websiteReachable === false ? DETERMINISTIC.generic_email_no_website : 0
    add("generic_email_domain", email.evidence, DETERMINISTIC.generic_email_domain + extra)
  }

  for (const name of ["crypto_payment", "banking_info_upfront", "fee_to_apply", "id_upfront", "whatsapp_telegram_only"] as const) {
    const hit = flag(name)
    if (hit) add(name, hit.evidence)
  }

  const mail = flag("mail_physical_resume")
  if (mail && SOFTWARE_CATEGORIES.has(input.category)) {
    add("mail_resume_software_role", mail.evidence)
  }

  return out
}

/**
 * Fraction of a Score dimension's peak weight to charge. Rubric level ACCEPTABLE_LEVEL and above
 * is a clean posting and costs nothing; below it the charge ramps to full at level 0. Without
 * this every ordinary posting pays a few points on every dimension, which just shifts the scale.
 */
const ACCEPTABLE_LEVEL = 2
const shortfall = (level: number) => Math.max(0, (ACCEPTABLE_LEVEL - level) / ACCEPTABLE_LEVEL)

function judgmentSignals(j: Judgments): Signal[] {
  const out: Signal[] = []
  const add = (label: string, fraction: number, peak: number, evidence: string) => {
    const weight = Math.round(Math.max(0, Math.min(1, fraction)) * peak)
    if (weight !== 0) out.push({ label, weight: clampWeight(weight), evidence })
  }

  add("vague_description", shortfall(j.specificity), JUDGMENT.vague_description, `description specificity ${j.specificity.toFixed(2)} of 3`)
  add("unsubstantiated_employer", shortfall(j.employerSubstantiation), JUDGMENT.unsubstantiated_employer, `employer detail ${j.employerSubstantiation.toFixed(2)} of 3`)
  if (j.payPlausibility !== null) {
    add("pay_implausible", shortfall(j.payPlausibility), JUDGMENT.pay_implausible, `pay plausibility ${j.payPlausibility.toFixed(2)} of 3`)
  }
  add("urgency_pressure", j.urgency, JUDGMENT.urgency_pressure, `urgency probability ${j.urgency.toFixed(2)}`)
  add("pre_hire_ask", j.preHireAsk, JUDGMENT.pre_hire_ask, `pre-hire money or ID request probability ${j.preHireAsk.toFixed(2)}`)
  add("money_handling", j.moneyHandling, JUDGMENT.money_handling, `money or parcel handling probability ${j.moneyHandling.toFixed(2)}`)
  add("role_incoherent", 1 - j.roleCoherence, JUDGMENT.role_incoherent, `role coherence probability ${j.roleCoherence.toFixed(2)}`)

  return out
}

export function composeScore(input: ComposeInput): ComposeResult {
  const signals = [
    ...deterministicSignals(input),
    ...(input.judgments ? judgmentSignals(input.judgments) : []),
  ]

  const sum = signals.reduce((a, s) => a + s.weight, BASELINE)
  let fraudScore = Math.max(0, Math.min(100, Math.round(sum)))

  if (signals.some((s) => s.label === "apply_address_private")) {
    fraudScore = Math.max(fraudScore, FLOORS.apply_address_private)
  }
  if (input.judgments && input.judgments.preHireAsk > FLOOR_NOUL_THRESHOLD) {
    fraudScore = Math.max(fraudScore, FLOORS.pre_hire_ask)
  }

  signals.sort((a, b) => b.weight - a.weight)
  return { fraudScore, riskBand: bandFor(fraudScore), signals }
}
