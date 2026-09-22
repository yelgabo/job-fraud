// The whole tuning surface for composed scores. Data only, no logic: a reweight is a diff to
// this file followed by `npm run recompose`, with no inference and no model call.
//
// Every number here is provisional. They were transcribed from the prose ranges in the prompt
// that lib/ai/scoring.ts sends, by taking the midpoint of each range. They have never been
// fitted against known-fraudulent postings, because no labelled set exists yet.

import { MIN_SIGNAL_WEIGHT, MAX_SIGNAL_WEIGHT } from "../shared/json-schemas"

/** Fires from a deterministic check or a regex flag. Each is a plain integer contribution. */
export const DETERMINISTIC = {
  ats_known_provider: -25,
  business_match: -15,
  business_mismatch: 25,
  location_match: -5,
  location_mismatch: 12,
  jobs_listing: -7,
  apply_address_business: -5,
  apply_address_none: -4,
  apply_address_private: 40,
  address_not_geocoded: 20,
  address_city_match: -5,
  address_city_mismatch: 15,
  website_unreachable: 12,
  generic_email_domain: 20,
  generic_email_no_website: 5,
  crypto_payment: 25,
  banking_info_upfront: 25,
  fee_to_apply: 20,
  id_upfront: 20,
  whatsapp_telegram_only: 20,
  mail_resume_software_role: 20,
} as const

export type DeterministicId = keyof typeof DETERMINISTIC

/**
 * Peak contribution of each text judgment. A Score dimension contributes its full weight at the
 * worst rubric level and nothing at the best; a Noul contributes its full weight at probability 1.
 */
export const JUDGMENT = {
  vague_description: 15,
  unsubstantiated_employer: 10,
  pay_implausible: 15,
  urgency_pressure: 10,
  pre_hire_ask: 25,
  money_handling: 25,
  role_incoherent: 12,
} as const

export type JudgmentId = keyof typeof JUDGMENT

/**
 * Conditions that set a lower bound on the final score regardless of what offsets them.
 * "Any serious violation" is not a weighted sum, and the prompt could only ever ask a model
 * to honour these.
 */
export const FLOORS = {
  apply_address_private: 70,
  pre_hire_ask: 70,
} as const

/** Above this probability a Noul counts as asserted for floor purposes. */
export const FLOOR_NOUL_THRESHOLD = 0.8

/**
 * Score for a posting where nothing fires at all.
 *
 * DELIBERATELY NOT FITTED. Sweeping this constant against the 300 stored verdicts in
 * docs/jev-comparison-findings.md moves raw band agreement from 186/300 to 231/300, which is
 * tempting and wrong: it would be fitting to the current model's opinions, and those opinions
 * are the thing under question. The sweep is recorded in the findings doc as evidence about
 * how the scale behaves, not as a target. Set this from labelled postings when they exist.
 */
export const BASELINE = 20

export { MIN_SIGNAL_WEIGHT, MAX_SIGNAL_WEIGHT }
