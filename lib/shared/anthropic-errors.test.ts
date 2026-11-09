import { describe, it, expect } from "vitest"
import { isBillingError } from "./anthropic-errors"

describe("isBillingError", () => {
  it("matches the real out-of-credit message", () => {
    const msg =
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'
    expect(isBillingError(new Error(msg))).toBe(true)
  })

  // A 401 is caught by isAuthError instead; billing and auth stay separate so each abort names its cause.
  it("does not match an invalid-key 401", () => {
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

describe("isAuthError", () => {
  it("matches a 401 or 403 by status or by the API's error type", async () => {
    const { isAuthError, isFatalApiError } = await import("./anthropic-errors")
    expect(isAuthError(Object.assign(new Error("x"), { status: 401 }))).toBe(true)
    expect(isAuthError(Object.assign(new Error("x"), { status: 403 }))).toBe(true)
    expect(isAuthError(new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'))).toBe(true)
    expect(isAuthError(Object.assign(new Error("429 rate_limit_error"), { status: 429 }))).toBe(false)
    expect(isAuthError(null)).toBe(false)
    expect(isFatalApiError(new Error("Your credit balance is too low to access the Anthropic API"))).toBe(true)
  })
})
