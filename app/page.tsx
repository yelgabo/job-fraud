import Link from "next/link"
import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/db"
import { ScoreChip } from "@/components/ScoreChip"
import { PaginationNav } from "@/components/PaginationNav"
import { CATEGORIES } from "@/lib/signals/job-category"
import { effectivePostedDate } from "@/lib/shared/posted-date"
import { DATA_CACHE_TAG } from "@/lib/shared/cache-tags"
import { RATING_ANCHOR } from "@/lib/shared/methodology"
import {
  BANDS,
  PAGE_SIZE,
  POSTED_WINDOWS,
  POSTINGS_ORDER_BY,
  buildPostingsQuery,
  pageArgs,
  parseBand,
  parsePage,
  parsePostedWindow,
  type BandKey,
  type PostedWindowKey,
} from "@/lib/shared/postings-filter"
import { cn } from "@/lib/utils"

// Reading searchParams makes this route render dynamically per request, so route-level
// `revalidate` cannot cache it; the time-based cache lives on loadPostings below instead, keyed
// per (band, cat, posted, page) combination.
export const dynamic = "force-dynamic"

function tabClass(active: boolean) {
  return cn(
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
    active ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100",
  )
}

/**
 * Everything one render of the postings list needs, fetched in one place and fully serializable
 * (the cache stores JSON, so a Date would come back a string on a hit). The tab counts are
 * whole-corpus aggregates composed in lib/shared/postings-filter.ts; only the row query is paged.
 * Do not add skip/take to any count query: the tab numbers must not change as the visitor pages
 * through the rows under them.
 *
 * unstable_cache keys on its arguments, so each (band, cat, posted, page) combination is its own
 * entry, each serving up to 10 minutes stale. That staleness is accepted for visitors; the
 * token-gated /audit pages stay uncached.
 */
const loadPostings = unstable_cache(loadPostingsUncached, ["postings-list"], {
  revalidate: 600,
  tags: [DATA_CACHE_TAG],
})

async function loadPostingsUncached(band: BandKey, cat: string, posted: PostedWindowKey, page: number) {
  const q = buildPostingsQuery({ band, cat, posted, now: new Date() })

  const [grouped, catGrouped, postedCounts, total, scored, agg, filteredTotal, rows] = await Promise.all([
    prisma.job.groupBy({ by: ["riskBand"], _count: true, where: q.bandCountWhere }),
    prisma.job.groupBy({ by: ["category"], _count: true, where: q.catCountWhere }),
    Promise.all(
      POSTED_WINDOWS.map(async (w) => [w.key, await prisma.job.count({ where: q.postedCountWhere[w.key] })] as const),
    ),
    // The header describes the whole judged corpus, so both of its numbers ignore the filters:
    // otherwise a filtered numerator sits next to an unfiltered denominator and reads as wrong.
    prisma.job.count({ where: { scoredAt: { not: null } } }),
    prisma.job.count({ where: { scoredAt: { not: null }, riskBand: { in: ["high", "medium", "low"] } } }),
    prisma.job.aggregate({ _max: { scrapedAt: true } }),
    prisma.job.count({ where: q.rowsWhere }),
    prisma.job.findMany({
      where: q.rowsWhere,
      orderBy: POSTINGS_ORDER_BY,
      ...pageArgs(page),
      // Only what a list row renders. Location and application flags moved to the detail page
      // the title links to; selecting them here would bloat the cache entry and the RSC payload.
      select: {
        workbcId: true,
        title: true,
        fraudScore: true,
        postedDate: true,
        scrapedAt: true,
        employer: { select: { id: true, nameDisplay: true } },
      },
    }),
  ])

  const counts: Record<string, number> = { all: 0 }
  for (const g of grouped) if (g.riskBand) counts[g.riskBand] = g._count
  counts.all = grouped.reduce((n, g) => n + g._count, 0)

  const catCounts: Record<string, number> = {}
  for (const g of catGrouped) if (g.category) catCounts[g.category] = g._count
  const catAll = catGrouped.reduce((n, g) => n + g._count, 0)

  return {
    counts,
    catCounts,
    catAll,
    dateCounts: Object.fromEntries(postedCounts) as Record<PostedWindowKey, number>,
    total,
    scored,
    lastScraped: agg._max.scrapedAt?.toISOString() ?? null,
    filteredTotal,
    rows: rows.map((job) => {
      const p = effectivePostedDate({ postedDate: job.postedDate, scrapedAt: job.scrapedAt })
      return {
        workbcId: job.workbcId,
        title: job.title,
        fraudScore: job.fraudScore,
        employerId: job.employer?.id ?? null,
        employerName: job.employer?.nameDisplay ?? null,
        day: p.day,
        estimated: p.estimated,
      }
    }),
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ band?: string; cat?: string; posted?: string; page?: string }>
}) {
  const { band, cat, posted, page } = await searchParams
  const active: BandKey = parseBand(band)
  const activeCat: string = (CATEGORIES as readonly string[]).includes(cat ?? "") ? (cat as string) : "all"
  const activePosted: PostedWindowKey = parsePostedWindow(posted)
  const activePage = parsePage(page)

  const { counts, catCounts, catAll, dateCounts, total, scored, lastScraped, filteredTotal, rows } =
    await loadPostings(active, activeCat, activePosted, activePage)

  const pageCount = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE))

  // Build a href preserving the other active dimensions. Changing any filter resets to page 1 so
  // a visitor is never dropped past the end of a shorter result set.
  const hrefFor = (nextBand: BandKey, nextCat: string, nextPosted: PostedWindowKey, nextPage = 1) => {
    const p = new URLSearchParams()
    if (nextBand !== "all") p.set("band", nextBand)
    if (nextCat !== "all") p.set("cat", nextCat)
    if (nextPosted !== "any") p.set("posted", nextPosted)
    if (nextPage > 1) p.set("page", String(nextPage))
    const qs = p.toString()
    return qs ? `/?${qs}` : "/"
  }
  const pageHref = (n: number) => hrefFor(active, activeCat, activePosted, n)

  const anyEstimated = rows.some((r) => r.estimated)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-zinc-900">Scanned postings</h1>
        <p className="text-sm text-zinc-500">
          {scored} of {total} scored
          {lastScraped ? ` · last scan ${new Date(lastScraped).toLocaleString("en-CA")}` : ""}
        </p>
      </div>

      <nav className="mb-3 flex flex-wrap items-center gap-2">
        {BANDS.map((b) => (
          <Link key={b} href={hrefFor(b, activeCat, activePosted)} className={tabClass(b === active)}>
            {b[0].toUpperCase() + b.slice(1)}
            <span className="ml-1.5 text-xs opacity-70">{counts[b] ?? 0}</span>
          </Link>
        ))}
        <Link
          href={`/about#${RATING_ANCHOR}`}
          className="ml-1 text-sm text-zinc-500 underline hover:text-zinc-900"
        >
          What do these ratings mean?
        </Link>
      </nav>

      <nav className="mb-3 flex flex-wrap gap-2">
        <Link href={hrefFor(active, "all", activePosted)} className={tabClass(activeCat === "all")}>
          All types<span className="ml-1.5 text-xs opacity-70">{catAll}</span>
        </Link>
        {CATEGORIES.filter((c) => (catCounts[c] ?? 0) > 0 || c === activeCat).map((c) => (
          <Link key={c} href={hrefFor(active, c, activePosted)} className={tabClass(c === activeCat)}>
            {c}
            <span className="ml-1.5 text-xs opacity-70">{catCounts[c] ?? 0}</span>
          </Link>
        ))}
      </nav>

      <nav className="mb-5 flex flex-wrap gap-2">
        {POSTED_WINDOWS.map((w) => (
          <Link key={w.key} href={hrefFor(active, activeCat, w.key)} className={tabClass(w.key === activePosted)}>
            {w.label}
            <span className="ml-1.5 text-xs opacity-70">{dateCounts[w.key] ?? 0}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-500">
          {total === 0 ? (
            "No postings yet. Run the scraper (npm run scrape) to populate the database."
          ) : filteredTotal === 0 ? (
            "No postings match this filter."
          ) : (
            <>
              Nothing on page {activePage}.{" "}
              <Link href={pageHref(1)} className="underline hover:text-zinc-900">
                Back to page 1
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {/* Rows are deliberately lean (they dominate the page's HTML): the shared cell
                styling lives on the table element, and location and application flags live on
                the detail page each title links to. */}
            <table className="w-full text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_th]:px-4 [&_th]:py-2.5 [&_th]:font-medium">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th>Score</th>
                  <th>Title</th>
                  <th>Employer</th>
                  <th>Posted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((job) => (
                  <tr key={job.workbcId} className="hover:bg-zinc-50">
                    <td>
                      <ScoreChip score={job.fraudScore ?? 0} />
                    </td>
                    <td>
                      <Link href={`/j/${job.workbcId}`} className="font-medium text-zinc-900 hover:underline">
                        {job.title}
                      </Link>
                    </td>
                    <td className="text-zinc-600">
                      {job.employerId ? (
                        <Link href={`/e/${job.employerId}`} className="hover:underline">
                          {job.employerName}
                        </Link>
                      ) : (
                        <span className="italic text-zinc-400">employer hidden</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-zinc-600">
                      {job.estimated ? `~${job.day}` : job.day}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {anyEstimated ? (
            <p className="mt-2 text-xs text-zinc-500">
              A date shown as <span className="italic">~date</span> is not a published posted date: that posting
              carried no usable one, so the day we scraped it stands in.
            </p>
          ) : null}
        </>
      )}
      <PaginationNav
        page={activePage}
        pageCount={pageCount}
        hrefFor={pageHref}
        summary={`${filteredTotal} postings`}
      />
    </div>
  )
}
