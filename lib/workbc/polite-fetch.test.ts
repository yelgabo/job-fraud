import { describe, it, expect, vi } from "vitest"
import { createPoliteFetch } from "./polite-fetch"

const resp = (status: number, headers: Record<string, string> = {}) =>
  new Response("{}", { status, headers })

// Instant sleep that records requested delays — keeps tests fast and lets us assert pacing/backoff.
function instantSleep() {
  const delays: number[] = []
  const sleep = vi.fn(async (ms: number) => {
    delays.push(ms)
  })
  return { sleep, delays }
}

describe("createPoliteFetch", () => {
  it("returns the response on first success", async () => {
    const fetchImpl = vi.fn(async () => resp(200))
    const pf = createPoliteFetch({ fetchImpl, sleep: instantSleep().sleep, minIntervalMs: 0 })
    const r = await pf("https://x.test/")
    expect(r.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("retries 5xx then succeeds", async () => {
    const fetchImpl = vi.fn(async () => resp(200)).mockResolvedValueOnce(resp(503))
    const pf = createPoliteFetch({ fetchImpl, sleep: instantSleep().sleep, minIntervalMs: 0, baseDelayMs: 1 })
    const r = await pf("https://x.test/")
    expect(r.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("retries network errors then succeeds", async () => {
    const fetchImpl = vi.fn(async () => resp(200)).mockRejectedValueOnce(new TypeError("fetch failed"))
    const pf = createPoliteFetch({ fetchImpl, sleep: instantSleep().sleep, minIntervalMs: 0, baseDelayMs: 1 })
    const r = await pf("https://x.test/")
    expect(r.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("does NOT retry a non-429 4xx — returns it for the caller to interpret", async () => {
    const fetchImpl = vi.fn(async () => resp(404))
    const pf = createPoliteFetch({ fetchImpl, sleep: instantSleep().sleep, minIntervalMs: 0 })
    const r = await pf("https://x.test/")
    expect(r.status).toBe(404)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("retries 429 and honors a numeric Retry-After", async () => {
    const { sleep, delays } = instantSleep()
    const fetchImpl = vi
      .fn(async () => resp(200))
      .mockResolvedValueOnce(resp(429, { "retry-after": "2" }))
    const pf = createPoliteFetch({ fetchImpl, sleep, minIntervalMs: 0, baseDelayMs: 1 })
    const r = await pf("https://x.test/")
    expect(r.status).toBe(200)
    expect(delays).toContain(2000)
  })

  it("gives up after retries+1 attempts and throws with the last error", async () => {
    const fetchImpl = vi.fn(async () => resp(500))
    const pf = createPoliteFetch({ fetchImpl, sleep: instantSleep().sleep, minIntervalMs: 0, retries: 2, baseDelayMs: 1 })
    await expect(pf("https://x.test/")).rejects.toThrow(/giving up after 3 attempts.*HTTP 500/)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it("paces back-to-back requests at least minIntervalMs apart", async () => {
    const { sleep, delays } = instantSleep()
    const fetchImpl = vi.fn(async () => resp(200))
    const pf = createPoliteFetch({ fetchImpl, sleep, minIntervalMs: 150 })
    await Promise.all([pf("https://x.test/a"), pf("https://x.test/b"), pf("https://x.test/c")])
    // First call runs immediately; the 2nd and 3rd must wait for their reserved slots.
    const waits = delays.filter((d) => d > 0)
    expect(waits.length).toBeGreaterThanOrEqual(2)
    expect(Math.max(...waits)).toBeGreaterThanOrEqual(150)
  })
})
