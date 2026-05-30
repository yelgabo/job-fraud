// Detects the Anthropic "out of credit" billing error. This arrives as a 400 invalid_request_error
// ("Your credit balance is too low to access the Anthropic API"), NOT a 429 — so the SDK does not
// retry it, and every subsequent call fails the same way. The judge treats it as fatal and aborts
// rather than silently marking thousands of postings as failed/unknown.
export function isBillingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /credit balance is too low|too low to access the anthropic api|billing.*(upgrade|purchase|credit)/i.test(msg)
}
