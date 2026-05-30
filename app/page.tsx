import Link from "next/link"
import { prisma } from "@/lib/db"
import { parseFlags } from "@/lib/json-schemas"
import { ScoreChip } from "@/components/ScoreChip"
import { FlagIcons } from "@/components/FlagIcons"
import { CATEGORIES } from "@/lib/job-category"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const BANDS = ["all", "high", "medium", "low", "unknown"] as const
type BandTab = (typeof BANDS)[number]

function tabClass(active: boolean) {
  return cn(
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
    active ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100",
  )
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ band?: string; cat?: string }>
}) {
  const { band, cat } = await searchParams
  const active: BandTab = (BANDS as readonly string[]).includes(band ?? "")
    ? (band as BandTab)
    : "all"
  const activeCat: string = (CATEGORIES as readonly string[]).includes(cat ?? "") ? (cat as string) : "all"

  // Only judged postings; each dimension's counts reflect the OTHER active filter.
  const base = { scoredAt: { not: null as never } }
  const bandWhere = active === "all" ? {} : { riskBand: active }
  const catWhere = activeCat === "all" ? {} : { category: activeCat }

  const [grouped, catGrouped, total, agg, rows] = await Promise.all([
    prisma.job.groupBy({ by: ["riskBand"], _count: true, where: { ...base, ...catWhere } }),
    prisma.job.groupBy({ by: ["category"], _count: true, where: { ...base, ...bandWhere } }),
    prisma.job.count({ where: base }),
    prisma.job.aggregate({ _max: { scrapedAt: true } }),
    prisma.job.findMany({
      where: { ...base, ...bandWhere, ...catWhere },
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

  const scored = (counts.high ?? 0) + (counts.medium ?? 0) + (counts.low ?? 0)
  const lastScraped = agg._max.scrapedAt

  // Build a href preserving the other active filter.
  const hrefFor = (nextBand: BandTab, nextCat: string) => {
    const p = new URLSearchParams()
    if (nextBand !== "all") p.set("band", nextBand)
    if (nextCat !== "all") p.set("cat", nextCat)
    const q = p.toString()
    return q ? `/?${q}` : "/"
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-zinc-900">Scanned postings</h1>
        <p className="text-sm text-zinc-500">
          {scored} of {total} scored
          {lastScraped ? ` · last scan ${new Date(lastScraped).toLocaleString("en-CA")}` : ""}
        </p>
      </div>

      <nav className="mb-3 flex flex-wrap gap-2">
        {BANDS.map((b) => (
          <Link key={b} href={hrefFor(b, activeCat)} className={tabClass(b === active)}>
            {b[0].toUpperCase() + b.slice(1)}
            <span className="ml-1.5 text-xs opacity-70">{counts[b] ?? 0}</span>
          </Link>
        ))}
      </nav>

      <nav className="mb-5 flex flex-wrap gap-2">
        <Link href={hrefFor(active, "all")} className={tabClass(activeCat === "all")}>
          All types<span className="ml-1.5 text-xs opacity-70">{catAll}</span>
        </Link>
        {CATEGORIES.filter((c) => (catCounts[c] ?? 0) > 0 || c === activeCat).map((c) => (
          <Link key={c} href={hrefFor(active, c)} className={tabClass(c === activeCat)}>
            {c}
            <span className="ml-1.5 text-xs opacity-70">{catCounts[c] ?? 0}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-500">
          {total === 0
            ? "No postings yet. Run the scraper (npm run scrape) to populate the database."
            : "No postings match this filter."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Score</th>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Employer</th>
                <th className="px-4 py-2.5 font-medium">Location</th>
                <th className="px-4 py-2.5 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((job) => (
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
                  <td className="px-4 py-3 align-top">
                    <FlagIcons flags={parseFlags(job.applicationFlags)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
