import { createHash, timingSafeEqual } from "node:crypto"
import { revalidatePath, revalidateTag } from "next/cache"
// Relative imports (not "@/...") so the colocated route.test.ts resolves them under vitest's
// default config, which does not read tsconfig path aliases.
import { webEnv } from "../../../lib/env"
import { DATA_CACHE_TAG } from "../../../lib/shared/cache-tags"
import { WARM_PATHS } from "../../../lib/shared/warm-targets"

/** Constant-time comparison over fixed-length digests so neither content nor length leaks. */
function tokenMatches(given: string, expected: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest()
  return timingSafeEqual(h(given), h(expected))
}

/**
 * Bearer-token gate shared by both phases, following the AUDIT_TOKEN pattern: when the env var
 * is unset, every request is denied (deny by default).
 */
function authorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? ""
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : ""
  return Boolean(webEnv.REVALIDATE_TOKEN && given && tokenMatches(given, webEnv.REVALIDATE_TOKEN))
}

/**
 * Re-warm the common filter combinations after the caches were cleared, so the first visitor to
 * each does not pay the cold queries. Sequential on purpose: one in-flight page render at a time
 * means a warm cycle can never stampede the database - it looks like a single fast visitor
 * clicking through WARM_PATHS. Best-effort throughout: a failed or slow path is logged and
 * skipped, and the endpoint still returns 200.
 */
async function warmCaches(origin: string) {
  const timings: { path: string; ms: number; ok: boolean }[] = []
  for (const path of WARM_PATHS) {
    const started = Date.now()
    let ok = false
    try {
      const res = await fetch(new URL(path, origin), {
        // no-store on the outer fetch: the point is to run the page render (re-priming its
        // unstable_cache entries), not to cache this response.
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      })
      ok = res.ok
      if (!ok) console.warn(`[warm] ${path} responded ${res.status}`)
    } catch (err) {
      console.warn(`[warm] ${path} failed: ${(err as Error).message}`)
    }
    timings.push({ path, ms: Date.now() - started, ok })
  }
  return timings
}

/**
 * POST /api/revalidate - refresh every public cached surface now instead of waiting out the
 * 600 s revalidation window. Called by the write-side CLI scripts (scrape, judge, judge:apply)
 * at the end of a successful run; the timer remains the backstop when this is never called.
 *
 * Two phases behind the same token gate, called as two separate requests:
 *
 *   1. POST /api/revalidate             purges the caches, responds { revalidated: true }
 *   2. POST /api/revalidate?phase=warm  re-renders WARM_PATHS, responds with warm counts
 *
 * The split is load-bearing, not cosmetic. Next.js defers revalidateTag/revalidatePath issued
 * inside a route handler: they only queue the tags, and the actual purge runs after the handler
 * resolves (see node_modules/next/dist/server/web/spec-extension/revalidate.js and the
 * executeRevalidates pendingWaitUntil in route-modules/app-route/module.js). Warming inside the
 * purge request would therefore render against the still-valid old cache and any entries it
 * wrote would be invalidated moments later when the queued purge lands. Only a fresh request
 * arriving after the purge response sees the cleared cache, so the caller
 * (lib/shared/request-revalidation.ts) sends the warm phase second.
 */
export async function POST(req: Request) {
  if (!authorized(req)) {
    return Response.json({ revalidated: false }, { status: 401 })
  }

  const url = new URL(req.url)
  if (url.searchParams.get("phase") === "warm") {
    // Warm phase: page renders only, no cache invalidation. Must never call
    // revalidateTag/revalidatePath or it would wipe the very entries it just primed.
    const timings = await warmCaches(url.origin)
    return Response.json({
      warmed: timings.filter((t) => t.ok).length,
      warmFailed: timings.filter((t) => !t.ok).length,
      timings,
    })
  }

  // Purge phase. The list/aggregate pages ('/', '/companies', '/analysis') cache at the data
  // layer under one shared tag; the per-URL ISR pages are marked stale across all their
  // instances by passing the route pattern with the explicit 'page' type (required for dynamic
  // routes - see node_modules/next/dist/server/web/spec-extension/revalidate.js). No fetches
  // happen here: the purge only takes effect after this handler resolves.
  revalidateTag(DATA_CACHE_TAG)
  revalidatePath("/j/[id]", "page")
  revalidatePath("/e/[id]", "page")
  return Response.json({ revalidated: true })
}
