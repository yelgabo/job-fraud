import { createHash, timingSafeEqual } from "node:crypto"
import { revalidatePath, revalidateTag } from "next/cache"
// Relative imports (not "@/...") so the colocated route.test.ts resolves them under vitest's
// default config, which does not read tsconfig path aliases.
import { webEnv } from "../../../lib/env"
import { DATA_CACHE_TAG } from "../../../lib/shared/cache-tags"

/** Constant-time comparison over fixed-length digests so neither content nor length leaks. */
function tokenMatches(given: string, expected: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest()
  return timingSafeEqual(h(given), h(expected))
}

/**
 * POST /api/revalidate - refresh every public cached surface now instead of waiting out the
 * 600 s revalidation window. Called by the write-side CLI scripts (scrape, judge, judge:apply)
 * at the end of a successful run; the timer remains the backstop when this is never called.
 *
 * Gated by REVALIDATE_TOKEN following the AUDIT_TOKEN pattern: when the env var is unset,
 * every request is denied (deny by default). Expects `Authorization: Bearer <token>`.
 */
export async function POST(req: Request) {
  const header = req.headers.get("authorization") ?? ""
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : ""
  if (!webEnv.REVALIDATE_TOKEN || !given || !tokenMatches(given, webEnv.REVALIDATE_TOKEN)) {
    return Response.json({ revalidated: false }, { status: 401 })
  }

  // The list/aggregate pages ('/', '/companies', '/analysis') cache at the data layer under one
  // shared tag; the per-URL ISR pages are marked stale across all their instances by passing the
  // route pattern with the explicit 'page' type (required for dynamic routes - see
  // node_modules/next/dist/server/web/spec-extension/revalidate.js).
  revalidateTag(DATA_CACHE_TAG)
  revalidatePath("/j/[id]", "page")
  revalidatePath("/e/[id]", "page")
  return Response.json({ revalidated: true })
}
