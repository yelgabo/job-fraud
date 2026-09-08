import { isBillingError } from "./anthropic-errors"

// One retry after a short delay — the shared policy for the AI callers (scoring, web-verify,
// impersonation). Transient failures (5xx blips the SDK gave up on, malformed tool calls that a
// re-roll fixes) get a second attempt; the out-of-credit billing error is FATAL-by-design (every
// subsequent call fails identically), so it is rethrown immediately instead of wasting a call and
// delaying the pipeline's billing-abort path.
export async function retryOnce<T>(fn: () => Promise<T>, delayMs = 2000): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (isBillingError(e)) throw e
    await new Promise((r) => setTimeout(r, delayMs))
    return await fn()
  }
}
