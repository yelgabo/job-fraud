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
  JUDGMENT_NOUL_NEUTRAL,
  MAX_SIGNAL_WEIGHT,
  MIN_SIGNAL_WEIGHT,
  ROUTE_PLAUSIBLE_THRESHOLD,
  type DeterministicId,
} from "./weights"

/**
 * Jev's answers about the posting text. Nouls are probabilities 0..1; `brandProminence` is a
 * rubric index 0..3. Every field is stored on the row; only `routePlausibleForEmployer` and
 * `askBeforeHire` currently move the score (weights.ts says why).
 */
export type Judgments = {
  routePlausibleForEmployer: number
  employerIsOrganisation: number
  brokerRouting: number
  brandProminence: number
  askBeforeHire: number
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
  /** Whether the brand credits were withheld, and on whose say-so. */
  routeDisowned: "judgment" | "flags" | null
}

const SOFTWARE_CATEGORIES: ReadonlySet<Category> = new Set(["Software & Data", "IT & Infrastructure"])

const clampWeight = (w: number) => Math.max(MIN_SIGNAL_WEIGHT, Math.min(MAX_SIGNAL_WEIGHT, w))

/**
 * Confirming the advertised employer is a real business only vouches for THIS posting when the
 * application actually goes to that business. A verified brand reached through a free consumer
 * mailbox is the impersonation shape, not a reassurance: anyone can put "Tim Hortons" on a
 * posting and collect replies at gmail. So the brand credits are withheld on an unowned route,
 * while the penalties on the same fields still apply.
 *
 * With judgments, "unowned" is Jev's graded answer to whether the route fits this employer,
 * which is what lets a neighbourhood pub on gmail keep its credits while a national chain on
 * gmail loses them. Without judgments it falls back to the flags, which cannot tell them apart.
 */
function routeDisownedBy(input: ComposeInput): ComposeResult["routeDisowned"] {
  if (input.judgments) {
    return input.judgments.routePlausibleForEmployer < ROUTE_PLAUSIBLE_THRESHOLD ? "judgment" : null
  }
  const flag = (name: string) => input.flags.some((f) => f.flag === name)
  return flag("generic_email_domain") || flag("whatsapp_telegram_only") ? "flags" : null
}

function deterministicSignals(input: ComposeInput, routeDisowned: boolean): Signal[] {
  const out: Signal[] = []
  const add = (id: DeterministicId, evidence: string, weight?: number) =>
    out.push({ label: id, weight: clampWeight(weight ?? DETERMINISTIC[id]), evidence })

  const flag = (name: string) => input.flags.find((f) => f.flag === name)
  const web: WebVerification | null | undefined = input.checks.web
  const c = input.checks

  const ats = flag("ats_known_provider")
  if (ats) add("ats_known_provider", ats.evidence || "applies through a recognized hiring system")

  const postingMailsApplications = Boolean(flag("mail_physical_resume"))

  if (web) {
    if (web.businessMatch === "match" && !routeDisowned) add("business_match", web.summary)
    if (web.businessMatch === "mismatch") add("business_mismatch", web.summary)
    if (web.locationMatch === "match" && !routeDisowned) add("location_match", web.summary)
    if (web.locationMatch === "mismatch") add("location_mismatch", web.summary)
    if (web.hasJobsListing === "yes" && !routeDisowned) add("jobs_listing", web.websiteUrl ?? web.summary)

    // applicationAddressType is stored per EMPLOYER but describes one posting's mailing address,
    // so it must only be applied to postings that actually mail. Otherwise one franchise location
    // that posts a street address decides the verdict for every sibling posting: dentalcorp has
    // 47 postings and one address, Wendy's 32 and one. A sibling that applies online is telling
    // the truth when it says no mailed materials are involved.
    const addr = postingMailsApplications ? web.applicationAddressType : "none"
    if (addr === "business" && !routeDisowned) add("apply_address_business", web.summary)
    if (addr === "none" && !routeDisowned) add("apply_address_none", "the posting asks for no mailed materials")
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

/** Fraction of a Noul's peak weight to charge: nothing up to the neutral point, full at 1. */
const asserted = (p: number) => Math.max(0, Math.min(1, (p - JUDGMENT_NOUL_NEUTRAL) / (1 - JUDGMENT_NOUL_NEUTRAL)))

function judgmentSignals(j: Judgments): Signal[] {
  const out: Signal[] = []
  const add = (label: keyof typeof JUDGMENT, fraction: number, evidence: string) => {
    const weight = Math.round(fraction * JUDGMENT[label])
    if (weight !== 0) out.push({ label, weight: clampWeight(weight), evidence })
  }
  add("pre_hire_ask", asserted(j.askBeforeHire), `pre-hire money or ID request probability ${j.askBeforeHire.toFixed(2)}`)
  return out
}

export function composeScore(input: ComposeInput): ComposeResult {
  const routeDisowned = routeDisownedBy(input)
  const signals = [
    ...deterministicSignals(input, routeDisowned !== null),
    ...(input.judgments ? judgmentSignals(input.judgments) : []),
  ]

  const sum = signals.reduce((a, s) => a + s.weight, BASELINE)
  let fraudScore = Math.max(0, Math.min(100, Math.round(sum)))

  if (signals.some((s) => s.label === "apply_address_private")) {
    fraudScore = Math.max(fraudScore, FLOORS.apply_address_private)
  }
  if (input.judgments && input.judgments.askBeforeHire > FLOOR_NOUL_THRESHOLD) {
    fraudScore = Math.max(fraudScore, FLOORS.pre_hire_ask)
  }

  signals.sort((a, b) => b.weight - a.weight)
  return { fraudScore, riskBand: bandFor(fraudScore), signals, routeDisowned }
}
