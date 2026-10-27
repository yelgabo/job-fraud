// The one canonical URL for each public page the edge caches. The edge keys its cache on the full
// URL, query string included, so every variant of a URL is a separate cache entry. A visitor
// arriving from Facebook carries a fresh ?fbclid= on every click, so without this every such
// visit would miss the cache and render on the single origin.

import { CATEGORIES } from "../signals/job-category"
import { homeHref, parseBand, parsePage, parsePostedWindow } from "./postings-filter"

const ID_PAGE = /^\/(j|e)\/([^/]+)\/?$/

/**
 * The canonical form of a public URL, or null for a path this does not govern (audit pages, the
 * API, /about, /analysis and static assets pass through untouched).
 */
export function canonicalUrl(pathname: string, params: URLSearchParams): string | null {
  if (pathname === "/") {
    const cat = params.get("cat")
    return homeHref(
      parseBand(params.get("band")),
      (CATEGORIES as readonly string[]).includes(cat ?? "") ? (cat as string) : "all",
      parsePostedWindow(params.get("posted")),
      parsePage(params.get("page")),
    )
  }
  if (pathname === "/companies") {
    const page = parsePage(params.get("page"))
    return page > 1 ? `/companies?page=${page}` : "/companies"
  }
  const m = ID_PAGE.exec(pathname)
  if (m) return `/${m[1]}/${m[2]}`
  return null
}
