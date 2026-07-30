import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// The route module reads webEnv (parsed from process.env at import time), so each case stubs the
// env first, resets the module registry, and imports the route fresh - the same pattern as
// lib/env.test.ts. next/cache is mocked: the factory re-runs per fresh import, so the mock
// instances are read back via import("next/cache") after the route is loaded.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function loadRoute(token: string | undefined) {
  vi.stubEnv("DATABASE_URL", "postgresql://test")
  vi.stubEnv("REVALIDATE_TOKEN", token)
  vi.resetModules()
  const route = await import("./route")
  const cache = vi.mocked(await import("next/cache"))
  return { route, cache }
}

function post(auth?: string) {
  return new Request("http://localhost/api/revalidate", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  })
}

// The route warms pages through global fetch after revalidating; every case stubs it so no test
// ever performs network I/O.
const fetchMock = vi.fn()

beforeEach(() => {
  vi.unstubAllEnvs()
  fetchMock.mockReset().mockResolvedValue(new Response("ok", { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("POST /api/revalidate", () => {
  it("denies when REVALIDATE_TOKEN is unset, even with a plausible bearer token", async () => {
    const { route, cache } = await loadRoute(undefined)
    const res = await route.POST(post("Bearer anything"))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ revalidated: false })
    expect(cache.revalidateTag).not.toHaveBeenCalled()
    expect(cache.revalidatePath).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("denies a wrong token", async () => {
    const { route, cache } = await loadRoute("right-token")
    const res = await route.POST(post("Bearer wrong-token"))
    expect(res.status).toBe(401)
    expect(cache.revalidateTag).not.toHaveBeenCalled()
    expect(cache.revalidatePath).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("denies a missing Authorization header", async () => {
    const { route, cache } = await loadRoute("right-token")
    const res = await route.POST(post())
    expect(res.status).toBe(401)
    expect(cache.revalidateTag).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("revalidates every public surface on the right token, then warms the common combos", async () => {
    const { route, cache } = await loadRoute("right-token")
    const res = await route.POST(post("Bearer right-token"))
    expect(res.status).toBe(200)
    const body = await res.json()
    const { WARM_PATHS } = await import("../../../lib/shared/warm-targets")
    expect(body.revalidated).toBe(true)
    expect(body.warmed).toBe(WARM_PATHS.length)
    expect(body.warmFailed).toBe(0)

    const { DATA_CACHE_TAG } = await import("../../../lib/shared/cache-tags")
    expect(cache.revalidateTag).toHaveBeenCalledWith(DATA_CACHE_TAG)
    // Dynamic ISR routes need the explicit 'page' type or revalidatePath is a silent no-op.
    expect(cache.revalidatePath).toHaveBeenCalledWith("/j/[id]", "page")
    expect(cache.revalidatePath).toHaveBeenCalledWith("/e/[id]", "page")

    // Warming happens AFTER the caches are cleared, against the request's own origin, one URL
    // per warm path and nothing else (no cross-product blowup).
    expect(fetchMock).toHaveBeenCalledTimes(WARM_PATHS.length)
    const fetched = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(fetched).toEqual(WARM_PATHS.map((p) => new URL(p, "http://localhost").toString()))
    expect(cache.revalidateTag.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0])
  })

  it("reports warm failures without failing the request", async () => {
    fetchMock.mockRejectedValue(new Error("connect refused"))
    const { route } = await loadRoute("right-token")
    const res = await route.POST(post("Bearer right-token"))
    expect(res.status).toBe(200)
    const body = await res.json()
    const { WARM_PATHS } = await import("../../../lib/shared/warm-targets")
    expect(body.revalidated).toBe(true)
    expect(body.warmed).toBe(0)
    expect(body.warmFailed).toBe(WARM_PATHS.length)
  })
})
