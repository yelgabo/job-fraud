import { cn } from "@/lib/utils"

function pillClass(active: boolean) {
  return cn(
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
    active ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100",
  )
}

/** Page numbers to offer: endpoints plus a window around the current page, deduped and sorted. */
function pageNumbers(page: number, pageCount: number): number[] {
  const wanted = new Set([1, 2, page - 1, page, page + 1, pageCount - 1, pageCount])
  return [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b)
}

/**
 * Prev/number/Next pagination pills, styled like the filter tabs, plus a "Page X of Y · summary"
 * caption so the paged-away rows never feel hidden. Renders nothing when there is a single page.
 *
 * Plain <a> pills: a full page load is served from the edge cache, where a Link prefetch or
 * client navigation would render on the origin (see the comment on the homepage's filter tabs).
 */
export function PaginationNav({
  page,
  pageCount,
  hrefFor,
  summary,
}: {
  page: number
  pageCount: number
  hrefFor: (page: number) => string
  summary: string
}) {
  if (pageCount <= 1) return null
  return (
    <nav className="mt-4 flex flex-wrap items-center gap-2" aria-label="Pagination">
      {page > 1 ? (
        <a href={hrefFor(page - 1)} className={pillClass(false)}>
          ← Prev
        </a>
      ) : (
        <span className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-300">← Prev</span>
      )}
      {pageNumbers(page, pageCount).map((n, i, arr) => (
        <span key={n} className="flex items-center gap-2">
          {i > 0 && arr[i - 1] !== n - 1 ? <span className="text-zinc-400">…</span> : null}
          <a href={hrefFor(n)} className={pillClass(n === page)}>
            {n}
          </a>
        </span>
      ))}
      {page < pageCount ? (
        <a href={hrefFor(page + 1)} className={pillClass(false)}>
          Next →
        </a>
      ) : (
        <span className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-300">Next →</span>
      )}
      <span className="ml-1 text-sm text-zinc-500">
        Page {Math.min(page, pageCount)} of {pageCount} · {summary}
      </span>
    </nav>
  )
}
