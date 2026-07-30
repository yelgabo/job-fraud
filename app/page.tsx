import Link from "next/link"
import { prisma } from "@/lib/db"
import { parseFlags } from "@/lib/shared/json-schemas"
import { ScoreChip } from "@/components/ScoreChip"
import { FlagIcons } from "@/components/FlagIcons"
import { CATEGORIES } from "@/lib/signals/job-category"
import { effectivePostedDate } from "@/lib/shared/posted-date"
import { RATING_ANCHOR } from "@/lib/shared/methodology"
import {
  BANDS,
  POSTED_WINDOWS,
  buildPostingsQuery,
  parseBand,
  parsePostedWindow,
  type BandKey,
  type PostedWindowKey,
} from "@/lib/shared/postings-filter"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

function tabClass(active: boolean) {
  return cn(
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
    active ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100",
  )
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ band?: string; cat?: string; posted?: string }>
}) {
  const { band, cat, posted } = await searchParams
  const active: BandKey = parseBand(band)
  const activeCat: string = (CATEGORIES as readonly string[]).includes(cat ?? "") ? (cat as string) : "all"
  const activePosted: PostedWindowKey = parsePostedWindow(posted)

  // Only judged postings; each of the three dimensions' counts reflect the OTHER TWO active
  // filters, so the tab numbers always match the rows listed below them. Composed and tested in
  // lib/shared/postings-filter.ts - do not inline these clauses back into the page.
  const q = buildPostingsQuery({ band: active, cat: activeCat, posted: activePosted, now: new Date() })

  const [grouped, catGrouped, postedCounts, total, scored, agg, rows] = await Promise.all([
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
    prisma.job.findMany({
      where: q.rowsWhere,
      orderBy: [{ fraudScore: "desc" }, { title: "asc" }],
      include: { employer: true },
    }),
  ])

  const counts: Record<string, number> = { all: 0 }
  for (const g of grouped) if (g.riskBand) counts[g.riskBand] = g._count
  counts.all = grouped.reduce((n, g) => n + g._count, 0)

  const catCounts: Record<string, number> = {}
  for (const g of catGrouped) if (g.category) catCounts[g.category] = g._count
  const catAll = catGrouped.reduce((n, g) => n + g._count, 0)

  const dateCounts = Object.fromEntries(postedCounts) as Record<PostedWindowKey, number>

  const lastScraped = agg._max.scrapedAt

  // Build a href preserving the other two active filters.
  const hrefFor = (nextBand: BandKey, nextCat: string, nextPosted: PostedWindowKey) => {
    const p = new URLSearchParams()
    if (nextBand !== "all") p.set("band", nextBand)
    if (nextCat !== "all") p.set("cat", nextCat)
    if (nextPosted !== "any") p.set("posted", nextPosted)
    const qs = p.toString()
    return qs ? `/?${qs}` : "/"
  }

  const listed = rows.map((job) => ({
    job,
    posted: effectivePostedDate({ postedDate: job.postedDate, scrapedAt: job.scrapedAt }),
  }))
  const anyEstimated = listed.some((r) => r.posted.estimated)

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

      {listed.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-500">
          {total === 0
            ? "No postings yet. Run the scraper (npm run scrape) to populate the database."
            : "No postings match this filter."}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Score</th>
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Employer</th>
                  <th className="px-4 py-2.5 font-medium">Location</th>
                  <th className="px-4 py-2.5 font-medium">Posted</th>
                  <th className="px-4 py-2.5 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {listed.map(({ job, posted: p }) => (
                  <tr key={job.workbcId} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 align-top">
                      <ScoreChip score={job.fraudScore ?? 0} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Link href={`/j/${job.workbcId}`} className="font-medium text-zinc-900 hover:underline">
                        {job.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top text-zinc-600">
                      {job.employer ? (
                        <Link href={`/e/${job.employer.id}`} className="hover:underline">
                          {job.employer.nameDisplay}
                        </Link>
                      ) : (
                        <span className="italic text-zinc-400">employer hidden</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-zinc-600">{job.location ?? "—"}</td>
                    <td className="px-4 py-3 align-top text-zinc-600">
                      {p.estimated ? (
                        <span
                          title="This posting has no usable posted date. Estimated from the date it was scraped."
                          className="text-zinc-500"
                        >
                          <span className="whitespace-nowrap tabular-nums">~{p.day}</span>{" "}
                          <span className="whitespace-nowrap text-xs italic text-zinc-400">(est. from scrape)</span>
                        </span>
                      ) : (
                        <span className="whitespace-nowrap tabular-nums">{p.day}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <FlagIcons flags={parseFlags(job.applicationFlags)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {anyEstimated ? (
            <p className="mt-2 text-xs text-zinc-500">
              A date shown as <span className="italic">~date (est. from scrape)</span> is not a published posted date:
              that posting carried no usable one, so the day we scraped it stands in.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
