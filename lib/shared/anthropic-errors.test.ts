import { describe, it, expect } from "vitest"
import { isBillingError } from "./anthropic-errors"

describe("isBillingError", () => {
  it("matches the real out-of-credit message", () => {
    const msg =
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'
    expect(isBillingError(new Error(msg))).toBe(true)
  })

  it("does not match unrelated errors", () => {
    expect(isBillingError(new Error("429 rate_limit_error"))).toBe(false)
    expect(isBillingError(new Error("tool input failed zod validation"))).toBe(false)
    expect(isBillingError(null)).toBe(false)
  })
})
