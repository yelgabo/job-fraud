import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// The route module reads webEnv (parsed from process.env at import time), so each case stubs the
// env first, resets the module registry, and imports the route fresh - the same pattern as
// lib/env.test.ts. next/cache is mocked: the mock instances survive resetModules and are read
// back via import("next/cache") after the route is loaded, so beforeEach clears their call
// history to keep cross-test assertions honest.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function loadRoute(token: string | undefined) {
  vi.stubEnv("DATABASE_URL", "postgresql://test")
  vi.stubEnv("REVALIDATE_TOKEN", token)
  vi.resetModules()
  const route = await import("./route")
  const cache = vi.mocked(await import("next/cache"))
  return { route, cache }
}

function post(auth?: string, phase?: string) {
  const url = phase ? `http://localhost/api/revalidate?phase=${phase}` : "http://localhost/api/revalidate"
  return new Request(url, {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  })
}

// The warm phase renders pages through global fetch; every case stubs it so no test ever
// performs network I/O.
const fetchMock = vi.fn()

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  fetchMock.mockReset().mockResolvedValue(new Response("ok", { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("POST /api/revalidate (purge phase)", () => {
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

  it("revalidates every public surface on the right token and makes no warm fetches", async () => {
    const { route, cache } = await loadRoute("right-token")
    const res = await route.POST(post("Bearer right-token"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revalidated: true })

    const { DATA_CACHE_TAG } = await import("../../../lib/shared/cache-tags")
    expect(cache.revalidateTag).toHaveBeenCalledWith(DATA_CACHE_TAG)
    // Dynamic ISR routes need the explicit 'page' type or revalidatePath is a silent no-op.
    expect(cache.revalidatePath).toHaveBeenCalledWith("/j/[id]", "page")
    expect(cache.revalidatePath).toHaveBeenCalledWith("/e/[id]", "page")

    // Ordering guarantee: warming never happens inside the purge request, because Next defers
    // the revalidation until after this handler resolves - a same-request warm would render
    // against the old cache and be wiped by the purge.
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("POST /api/revalidate?phase=warm (warm phase)", () => {
  it("denies when REVALIDATE_TOKEN is unset and performs zero warm fetches", async () => {
    const { route, cache } = await loadRoute(undefined)
    const res = await route.POST(post("Bearer anything", "warm"))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cache.revalidateTag).not.toHaveBeenCalled()
    expect(cache.revalidatePath).not.toHaveBeenCalled()
  })

  it("denies a wrong token and performs zero warm fetches", async () => {
    const { route } = await loadRoute("right-token")
    const res = await route.POST(post("Bearer wrong-token", "warm"))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("denies a missing Authorization header and performs zero warm fetches", async () => {
    const { route } = await loadRoute("right-token")
    const res = await route.POST(post(undefined, "warm"))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("warms every common combo against its own origin and never touches the cache API", async () => {
    const { route, cache } = await loadRoute("right-token")
    const res = await route.POST(post("Bearer right-token", "warm"))
    expect(res.status).toBe(200)
    const body = await res.json()
    const { WARM_PATHS } = await import("../../../lib/shared/warm-targets")
    expect(body.warmed).toBe(WARM_PATHS.length)
    expect(body.warmFailed).toBe(0)

    // One URL per warm path and nothing else (no cross-product blowup).
    expect(fetchMock).toHaveBeenCalledTimes(WARM_PATHS.length)
    const fetched = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(fetched).toEqual(WARM_PATHS.map((p) => new URL(p, "http://localhost").toString()))

    // Ordering guarantee, other side: the warm phase must not invalidate anything or it would
    // wipe the very entries it just primed.
    expect(cache.revalidateTag).not.toHaveBeenCalled()
    expect(cache.revalidatePath).not.toHaveBeenCalled()
  })

  it("reports warm failures without failing the request", async () => {
    fetchMock.mockRejectedValue(new Error("connect refused"))
    const { route } = await loadRoute("right-token")
    const res = await route.POST(post("Bearer right-token", "warm"))
    expect(res.status).toBe(200)
    const body = await res.json()
    const { WARM_PATHS } = await import("../../../lib/shared/warm-targets")
    expect(body.warmed).toBe(0)
    expect(body.warmFailed).toBe(WARM_PATHS.length)
  })
})
