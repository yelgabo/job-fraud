import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MAX_ATTEMPTS, requestRevalidation } from "./request-revalidation"

const fetchMock = vi.fn()

function replicaResponse(replica: string | undefined, status = 200) {
  return new Response(JSON.stringify({ revalidated: status === 200, replica, warmed: 8, warmFailed: 0 }), { status })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubEnv("REVALIDATE_TOKEN", "tok")
  vi.stubEnv("REVALIDATE_URL", "http://site.test/api/revalidate")
  vi.stubEnv("REVALIDATE_REPLICAS", "")
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("requestRevalidation", () => {
  it("does nothing without a token", async () => {
    vi.stubEnv("REVALIDATE_TOKEN", "")
    await requestRevalidation()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("repeats the combined call until it has seen two distinct replicas", async () => {
    fetchMock
      .mockResolvedValueOnce(replicaResponse("a"))
      .mockResolvedValueOnce(replicaResponse("a"))
      .mockResolvedValueOnce(replicaResponse("b"))
    await requestRevalidation()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).toBe("http://site.test/api/revalidate")
      expect(init.method).toBe("POST")
      expect(init.headers.authorization).toBe("Bearer tok")
      // A reused socket stays on one replica behind a per-connection balancer.
      expect(init.headers.connection).toBe("close")
    }
    expect(vi.mocked(console.log).mock.calls.at(-1)?.[0]).toMatch(/2 replicas \(a, b\) in 3 calls/)
  })

  it("stops at the attempt cap and says how many replicas it reached", async () => {
    fetchMock.mockImplementation(async () => replicaResponse("a"))
    await requestRevalidation()
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS)
    expect(vi.mocked(console.warn).mock.calls.at(-1)?.[0]).toMatch(/refreshed 1 of 2 replicas \(a\)/)
  })

  it("honours REVALIDATE_REPLICAS", async () => {
    vi.stubEnv("REVALIDATE_REPLICAS", "1")
    fetchMock.mockImplementation(async () => replicaResponse("a"))
    await requestRevalidation()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not count a replica whose purge failed, and tries again", async () => {
    fetchMock
      .mockResolvedValueOnce(replicaResponse("a", 502))
      .mockResolvedValueOnce(replicaResponse("a"))
      .mockResolvedValueOnce(replicaResponse("b"))
    await requestRevalidation()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("stops on a denied token without retrying", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ revalidated: false }), { status: 401 }))
    await requestRevalidation()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("stops when the site does not name a replica, since it cannot tell replicas apart", async () => {
    fetchMock.mockImplementation(async () => replicaResponse(undefined))
    await requestRevalidation()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("never throws, whatever the network does", async () => {
    fetchMock.mockRejectedValue(new Error("connect refused"))
    await expect(requestRevalidation()).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockReset().mockResolvedValue(new Response("not json", { status: 200 }))
    await expect(requestRevalidation()).resolves.toBeUndefined()
  })
})
