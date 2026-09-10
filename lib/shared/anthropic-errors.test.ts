import { describe, it, expect } from "vitest"
import { isBillingError } from "./anthropic-errors"

describe("isBillingError", () => {
  it("matches the real out-of-credit message", () => {
    const msg =
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'
    expect(isBillingError(new Error(msg))).toBe(true)
  })

  // The reason `.env.example` ships ANTHROPIC_API_KEY commented out: a placeholder key passes the
  // non-empty check in lib/env.ts, every call then 401s, and a 401 is NOT fatal here, so judge.ts
  // writes a failed verdict plus a scoredAt timestamp for each posting rather than leaving it pending.
  it("does not match an invalid-key 401, so a placeholder key marks postings judged", () => {
    const msg =
      '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'
    expect(isBillingError(new Error(msg))).toBe(false)
  })

  it("does not match unrelated errors", () => {
    expect(isBillingError(new Error("429 rate_limit_error"))).toBe(false)
    expect(isBillingError(new Error("tool input failed zod validation"))).toBe(false)
    expect(isBillingError(null)).toBe(false)
  })
})
