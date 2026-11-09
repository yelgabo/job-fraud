// What judge-keyless:apply accepts from the orchestrating session's verdict files.
import { z } from "zod"
import { TIERED_VERIFIER } from "../ai/verifier-models"
import { ImpersonationSchema } from "../ai/check-impersonation"
import { AgentSearchLogSchema } from "./agent-search-log"
import { WebVerificationSchema } from "./json-schemas"

const { primary, escalation } = TIERED_VERIFIER
export const KEYLESS_VERIFIERS = [primary, escalation, `${primary}>${escalation}`] as const

// The orchestrator labels each verdict with the tier that produced it, and tierViolation trusts
// that label, so it must be one of the three the tiered check can produce. `source` is dropped:
// "ats-tenant-match" marks a presumption apply makes itself, and an agent that sent it would have
// its verdict treated as presumed everywhere. `addressChecked` is set by apply from the posting.
export const AgentWebSchema = WebVerificationSchema.omit({ source: true, verifiedBy: true, addressChecked: true }).extend({
  verifiedBy: z.enum(KEYLESS_VERIFIERS),
})

// Anything else an agent returns (a fraudScore, signals, prose) is dropped here: the score is
// composed, never copied. Older verdict files therefore still apply, minus their numbers.
export const VerdictSchema = z.object({
  workbcId: z.string(),
  web: AgentWebSchema.optional(),
  searchLog: AgentSearchLogSchema.optional(),
})

export const ImpersonationResultSchema = ImpersonationSchema.extend({
  checkKey: z.string(),
  searchLog: AgentSearchLogSchema.optional(),
})
