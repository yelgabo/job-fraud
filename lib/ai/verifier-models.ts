// Request settings and list prices for each model that can run the employer web check
// (lib/ai/verify-employer-web.ts). Prices are first-party API list rates, USD per million tokens,
// from the Claude API model table cached 2026-10-06; web search is $10 per 1,000 searches.

export type VerifierProfile = {
  model: string
  inputPerMTok: number
  outputPerMTok: number
  webSearchTool: "web_search_20250305" | "web_search_20260209"
  maxTokens: number
  /** Only for models that accept a non-default value; the 5.x models reject one with a 400. */
  temperature?: number
}

export const WEB_SEARCH_USD = 0.01

export const VERIFIER_PROFILES = {
  // The production default. Unchanged request: these are the values judge.ts has always sent.
  "haiku-4.5": {
    model: "claude-haiku-4-5-20251001",
    inputPerMTok: 1,
    outputPerMTok: 5,
    webSearchTool: "web_search_20250305",
    maxTokens: 1500,
    temperature: 0,
  },
  // Billed at $0.50 / $2.50 instead once a prompt passes 100K tokens. A single verification is
  // expected to stay below that; the per-call input tokens in the compare-verifiers log show it.
  "haiku-5.5": {
    model: "claude-haiku-5-5",
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    webSearchTool: "web_search_20250305",
    maxTokens: 16000,
  },
  "sonnet-5.5": {
    model: "claude-sonnet-5-5",
    inputPerMTok: 2,
    outputPerMTok: 10,
    webSearchTool: "web_search_20260209",
    maxTokens: 16000,
  },
  "opus-5.5": {
    model: "claude-opus-5-5",
    inputPerMTok: 4,
    outputPerMTok: 20,
    webSearchTool: "web_search_20260209",
    maxTokens: 16000,
  },
} as const satisfies Record<string, VerifierProfile>

export type VerifierName = keyof typeof VERIFIER_PROFILES
/** What verifyEmployerWeb sends when called without a profile: the request judge.ts used until 2026-10-26. */
export const DEFAULT_VERIFIER: VerifierName = "haiku-4.5"

// How the judging paths verify employers since 2026-10-26: the cheap model first, the strong one
// only for a verdict that would raise a rating. Measured in docs/verifier-model-eval.md: Haiku 5.5
// matched Opus 5.5 on every alarm call over 10 employers at a sixth of the cost, while Haiku 4.5
// called two real out-of-province firms a location mismatch.
export const TIERED_VERIFIER = { primary: "haiku-5.5", escalation: "opus-5.5" } as const satisfies Record<string, VerifierName>

export type VerifierUsage = { inputTokens: number; outputTokens: number; webSearchRequests: number }

export function verifierCostUsd(profile: VerifierProfile, u: VerifierUsage): number {
  return (
    (u.inputTokens / 1e6) * profile.inputPerMTok +
    (u.outputTokens / 1e6) * profile.outputPerMTok +
    u.webSearchRequests * WEB_SEARCH_USD
  )
}
