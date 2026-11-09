// Detects the Anthropic "out of credit" billing error. This arrives as a 400 invalid_request_error
// ("Your credit balance is too low to access the Anthropic API"), NOT a 429 — so the SDK does not
// retry it, and every subsequent call fails the same way. The judge treats it as fatal and aborts
// rather than silently marking thousands of postings as failed/unknown.
export function isBillingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /credit balance is too low|too low to access the anthropic api|billing.*(upgrade|purchase|credit)/i.test(msg)
}

// A missing, revoked or placeholder key (401) or a key without access (403). Like the billing
// error it fails every call the same way, so the judge aborts and leaves postings pending instead
// of holding back every employer one by one and exiting 0.
export function isAuthError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status
  if (status === 401 || status === 403) return true
  const msg = err instanceof Error ? err.message : String(err)
  return /authentication_error|permission_error|invalid x-api-key/i.test(msg)
}

export const isFatalApiError = (err: unknown): boolean => isBillingError(err) || isAuthError(err)
