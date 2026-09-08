// Hardened fetch for the WorkBC APIs: global request pacing (be polite to a government API that
// publishes no rate limits), a per-request timeout (a hung socket must never stall a run), and
// bounded exponential-backoff retries on transient failures (429/5xx/network). 4xx other than 429
// is NOT retried — it means "this request is wrong / this posting is gone", and retrying can't fix it.

export type PoliteFetchOptions = {
  /** Minimum ms between request STARTS across all callers of this instance (global pacing). */
  minIntervalMs?: number
  /** Per-attempt timeout in ms. */
  timeoutMs?: number
  /** Retry attempts AFTER the first (so 3 = up to 4 requests). */
  retries?: number
  /** Base backoff delay in ms; attempt n waits base * 2^n (+ jitter), capped at 30s. */
  baseDelayMs?: number
  /** Injectable for tests. */
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function backoffMs(attempt: number, base: number): number {
  const exp = Math.min(base * 2 ** attempt, 30_000)
  return exp + Math.random() * base // full-jitter-ish: spread concurrent retriers apart
}

/** Honor a numeric Retry-After header (seconds), capped at 60s; null when absent/unparseable. */
function retryAfterMs(resp: Response): number | null {
  const h = resp.headers.get("retry-after")
  if (!h) return null
  const secs = Number(h)
  return Number.isFinite(secs) && secs >= 0 ? Math.min(secs, 60) * 1000 : null
}

/**
 * Build a fetch with shared pacing + timeout + retry. All requests through one instance are
 * globally spaced >= minIntervalMs apart, regardless of caller concurrency.
 */
export function createPoliteFetch(opts: PoliteFetchOptions = {}): typeof fetch {
  const minInterval = opts.minIntervalMs ?? 150
  const timeoutMs = opts.timeoutMs ?? 20_000
  const retries = opts.retries ?? 3
  const baseDelay = opts.baseDelayMs ?? 500
  // Resolve the global lazily so test stubs / polyfills installed later are honored.
  const doFetch: typeof fetch = opts.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
  const sleep = opts.sleep ?? defaultSleep

  // Pacing: each call reserves the next start slot up front, so concurrent callers queue fairly.
  let nextSlot = 0
  async function pace(): Promise<void> {
    const now = Date.now()
    const mySlot = Math.max(now, nextSlot)
    nextSlot = mySlot + minInterval
    if (mySlot > now) await sleep(mySlot - now)
  }

  return async function politeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let lastErr: unknown
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(backoffMs(attempt - 1, baseDelay))
      await pace()
      let resp: Response
      try {
        resp = await doFetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      } catch (e) {
        lastErr = e // network error / timeout — transient, retry
        continue
      }
      if (resp.status === 429 || resp.status >= 500) {
        lastErr = new Error(`HTTP ${resp.status}`)
        const ra = retryAfterMs(resp)
        if (ra !== null) await sleep(ra)
        continue
      }
      return resp // ok OR a non-retryable 4xx — the caller decides what a 4xx means
    }
    throw new Error(`politeFetch: giving up after ${retries + 1} attempts (${String(lastErr)})`, { cause: lastErr })
  }
}
