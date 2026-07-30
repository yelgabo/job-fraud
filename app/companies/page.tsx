import Link from "next/link"
import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/db"
import { parseChecks } from "@/lib/shared/json-schemas"
import { RATING_ANCHOR } from "@/lib/shared/methodology"
import { orderEmployerAggs } from "@/lib/shared/companies-query"
import { PAGE_SIZE, pageArgs, parsePage } from "@/lib/shared/postings-filter"
import { PaginationNav } from "@/components/PaginationNav"
import { cn } from "@/lib/utils"

// force-dynamic keeps this page out of build-time prerendering: the Railway builder has no
// private-network route to the database, so a static build would fail the deploy. The time-based
// cache lives on loadCompanies below instead, keyed per page.
export const dynamic = "force-dynamic"

const BAND_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-green-500",
}

/**
 * One page of the companies list. The whole-corpus ordering works on a per-employer aggregate
 * (one small row per employer); only the page being shown loads employer details and band
 * tallies, so the payload stays bounded as the corpus grows. Each page number is its own cache
 * entry, served up to 10 minutes stale (accepted for visitors).
 */
const loadCompanies = unstable_cache(loadCompaniesUncached, ["companies-list"], { revalidate: 600 })

async function loadCompaniesUncached(page: number) {
  const groups = await prisma.job.groupBy({
    by: ["employerId"],
    where: { scoredAt: { not: null }, employerId: { not: null } },
    _max: { fraudScore: true },
    _count: true,
  })

  const ordered = orderEmployerAggs(
    groups.map((g) => ({
      employerId: g.employerId as string,
      worst: g._max.fraudScore ?? -1,
      count: g._count,
    })),
  )
  const totalEmployers = ordered.length

  const { skip, take } = pageArgs(page)
  const pageAggs = ordered.slice(skip, skip + take)
  const ids = pageAggs.map((a) => a.employerId)

  const [employers, bandGroups] = await Promise.all([
    prisma.employer.findMany({
      where: { id: { in: ids } },
      select: { id: true, nameDisplay: true, checks: true },
    }),
    prisma.job.groupBy({
      by: ["employerId", "riskBand"],
      where: { scoredAt: { not: null }, employerId: { in: ids } },
      _count: true,
    }),
  ])

  const byId = new Map(employers.map((e) => [e.id, e]))
  const bandsFor = new Map<string, Record<string, number>>()
  for (const g of bandGroups) {
    const eid = g.employerId as string
    if (!bandsFor.has(eid)) bandsFor.set(eid, { high: 0, medium: 0, low: 0 })
    const t = bandsFor.get(eid)!
    if (g.riskBand && g.riskBand in t) t[g.riskBand] += g._count
  }

  return {
    totalEmployers,
    rows: pageAggs.flatMap((a) => {
      const e = byId.get(a.employerId)
      if (!e) return []
      return [
        {
          id: e.id,
          name: e.nameDisplay,
          count: a.count,
          bands: bandsFor.get(a.employerId) ?? { high: 0, medium: 0, low: 0 },
          worst: a.worst,
          web: parseChecks(e.checks).web ?? null,
        },
      ]
    }),
  }
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page } = await searchParams
  const activePage = parsePage(page)
  const { totalEmployers, rows } = await loadCompanies(activePage)
  const pageCount = Math.max(1, Math.ceil(totalEmployers / PAGE_SIZE))
  const pageHref = (n: number) => (n > 1 ? `/companies?page=${n}` : "/companies")

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-zinc-900">Companies</h1>
        <p className="text-sm text-zinc-500">
          {totalEmployers} employers with judged postings ·{" "}
          <Link href={`/about#${RATING_ANCHOR}`} className="underline hover:text-zinc-900">
            what do these ratings mean?
          </Link>
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-500">
          {totalEmployers === 0 ? (
            "No judged postings yet."
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
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Postings</th>
                <th className="px-4 py-2.5 font-medium">Risk mix</th>
                <th className="px-4 py-2.5 font-medium">Top score</th>
                <th className="px-4 py-2.5 font-medium">Web check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 align-top">
                    <Link href={`/e/${r.id}`} className="font-medium text-zinc-900 hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-top tabular-nums text-zinc-600">{r.count}</td>
                  <td className="px-4 py-3 align-top">
                    <span className="inline-flex items-center gap-2 text-xs text-zinc-600">
                      {(["high", "medium", "low"] as const).map((b) =>
                        r.bands[b] ? (
                          <span key={b} className="inline-flex items-center gap-1">
                            <span className={cn("h-2 w-2 rounded-full", BAND_DOT[b])} />
                            {r.bands[b]}
                          </span>
                        ) : null,
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top tabular-nums">
                    <span
                      className={cn(
                        "font-semibold",
                        r.worst >= 70 ? "text-red-700" : r.worst >= 30 ? "text-amber-700" : "text-green-700",
                      )}
                    >
                      {r.worst < 0 ? "—" : r.worst}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-zinc-500">
                    {r.web
                      ? r.web.businessMatch === "mismatch"
                        ? "⚠ business mismatch"
                        : r.web.businessMatch === "match"
                          ? "✓ verified"
                          : "uncertain"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationNav
        page={activePage}
        pageCount={pageCount}
        hrefFor={pageHref}
        summary={`${totalEmployers} employers`}
      />
    </div>
  )
}
