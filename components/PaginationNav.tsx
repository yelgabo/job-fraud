import Link from "next/link"
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
        <Link href={hrefFor(page - 1)} className={pillClass(false)}>
          ← Prev
        </Link>
      ) : (
        <span className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-300">← Prev</span>
      )}
      {pageNumbers(page, pageCount).map((n, i, arr) => (
        <span key={n} className="flex items-center gap-2">
          {i > 0 && arr[i - 1] !== n - 1 ? <span className="text-zinc-400">…</span> : null}
          <Link href={hrefFor(n)} className={pillClass(n === page)}>
            {n}
          </Link>
        </span>
      ))}
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className={pillClass(false)}>
          Next →
        </Link>
      ) : (
        <span className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-300">Next →</span>
      )}
      <span className="ml-1 text-sm text-zinc-500">
        Page {Math.min(page, pageCount)} of {pageCount} · {summary}
      </span>
    </nav>
  )
}
