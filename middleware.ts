import { NextResponse, type NextRequest } from "next/server"
import { canonicalUrl } from "./lib/shared/canonical-url"

// What /j/[id] and /e/[id] send from their `revalidate = 600` ISR config. The list pages are
// force-dynamic, so Next marks them private; setting the header here is what lets Railway's edge
// (auto mode) cache them. Keep the 600 in step with the list pages' unstable_cache revalidate.
const EDGE_CACHEABLE = "s-maxage=600, stale-while-revalidate=31535400"
const EDGE_CACHED_PAGES = new Set(["/", "/companies"])

export function middleware(req: NextRequest) {
  const url = req.nextUrl
  // Client-side navigations also get the cacheable header below: Next strips the RSC header and
  // ?_rsc= before middleware runs, so they cannot be told apart here. That is safe on Railway:
  // its edge treats any request with an RSC header as DYNAMIC, never storing the response or
  // answering it from the HTML cache (tested on production, 2026-10-27).
  if (req.method !== "GET" && req.method !== "HEAD") return NextResponse.next()

  const canonical = canonicalUrl(url.pathname, url.searchParams)
  if (canonical === null) return NextResponse.next()

  if (canonical !== url.pathname + url.search) {
    const target = url.clone()
    const [path, query = ""] = canonical.split("?")
    target.pathname = path
    target.search = query
    return NextResponse.redirect(target, 308)
  }

  const res = NextResponse.next()
  if (EDGE_CACHED_PAGES.has(url.pathname)) res.headers.set("Cache-Control", EDGE_CACHEABLE)
  return res
}

export const config = {
  matcher: ["/", "/companies", "/j/:id*", "/e/:id*"],
}
