// The whole tuning surface for composed scores. Data only, no logic: a reweight is a diff to
// this file followed by `npm run recompose`, with no inference and no model call.
//
// Every number here is provisional. They were transcribed from the prose ranges in the prompt
// the pre-composer scorer sent, by taking the midpoint of each range. They have never been
// fitted against known-fraudulent postings: 21 labels, 2 of them high, cannot support fitting.

import { MIN_SIGNAL_WEIGHT, MAX_SIGNAL_WEIGHT } from "../shared/json-schemas"

/**
 * Stamped on every row the composer writes. Bump it when a change to this file or to
 * compose.ts means two rows with the same inputs could carry different numbers; rows scored
 * before the composer have null.
 */
export const SCORING_VERSION = 1

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
 * Peak contribution of each weighted text judgment: a Noul contributes its full weight at
 * probability 1. Only questions that measurably separate bands get a row here; the rest of
 * the Jev question set is stored on the row and never weighted (docs/scoring-algorithm.md).
 *
 * `pre_hire_ask` reads 0.03-0.08 across the whole corpus because WorkBC moderation keeps that
 * copy out. It stays because it is the only cover for the thing that would matter most if
 * moderation lapsed, not because this data supports it.
 */
export const JUDGMENT = {
  pre_hire_ask: 25,
} as const

export type JudgmentId = keyof typeof JUDGMENT

/**
 * Below this probability on `routePlausibleForEmployer` the application route is treated as
 * not the employer's own, and the brand credits are withheld. Measured on the 21 human labels
 * (low 0.62-0.95, medium 0.10-0.52, one overlap) and confirmed end to end in the composer:
 * 0.57 ties the live system at 19/21, keeps 62/62 stored highs, and leaks 2 of 100 stored lows
 * where the regex switch leaked 13 (docs/jev-comparison-findings.md, addendum 7).
 */
export const ROUTE_PLAUSIBLE_THRESHOLD = 0.57

/**
 * Conditions that set a lower bound on the final score regardless of what offsets them.
 * "Any serious violation" is not a weighted sum, and a prompt could only ever ask a model
 * to honour these.
 */
export const FLOORS = {
  apply_address_private: 70,
  pre_hire_ask: 70,
} as const

/** Above this probability a Noul counts as asserted for floor purposes. */
export const FLOOR_NOUL_THRESHOLD = 0.8

/**
 * A weighted Noul contributes nothing at or below this probability and ramps to its peak at 1.
 * Without it a clean posting reading 0.05 on the pre-hire question rounds to a +1 signal whose
 * label says money was requested, which is a published false claim over a rounding error.
 */
export const JUDGMENT_NOUL_NEUTRAL = 0.5

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
