import Link from "next/link"
import { prisma } from "@/lib/db"
import { CATEGORIES } from "@/lib/job-category"

export const dynamic = "force-dynamic"

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)

type Row = { category: string; low: number; medium: number; high: number; total: number }

export default async function AnalysisPage() {
  const grouped = await prisma.job.groupBy({
    by: ["category", "riskBand"],
    _count: true,
    where: { scoredAt: { not: null } },
  })

  const map = new Map<string, Row>()
  for (const cat of CATEGORIES) map.set(cat, { category: cat, low: 0, medium: 0, high: 0, total: 0 })
  for (const g of grouped) {
    const cat = g.category && (CATEGORIES as readonly string[]).includes(g.category) ? g.category : "Other"
    const row = map.get(cat)!
    if (g.riskBand === "low" || g.riskBand === "medium" || g.riskBand === "high") row[g.riskBand] += g._count
  }
  for (const r of map.values()) r.total = r.low + r.medium + r.high // "rated" denominator (excludes unknown)

  const rows = [...map.values()].filter((r) => r.total > 0)
  rows.sort((a, b) => pct(b.medium + b.high, b.total) - pct(a.medium + a.high, a.total))

  const grand = rows.reduce(
    (a, r) => ({ low: a.low + r.low, medium: a.medium + r.medium, high: a.high + r.high, total: a.total + r.total }),
    { low: 0, medium: 0, high: 0, total: 0 },
  )
  const overallElevated = grand.medium + grand.high

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Elevated-risk rate by job type</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Share of reviewed postings rated <span className="text-amber-600">medium</span> or{" "}
          <span className="text-red-600">high</span> risk, grouped by occupation (NOC). These are
          automated <em>screening signals</em>, not verdicts — a higher rate means more postings in
          that category warrant a closer look, not proof of fraud.
        </p>
        <p className="mt-3 text-sm text-zinc-600">
          Overall: <span className="font-semibold text-zinc-900">{overallElevated.toLocaleString()}</span> of{" "}
          {grand.total.toLocaleString()} reviewed postings rated elevated risk (
          <span className="font-semibold">{pct(overallElevated, grand.total).toFixed(1)}%</span>) ·{" "}
          {grand.high.toLocaleString()} high.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green-500" /> Low</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Medium</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> High</span>
        <span className="text-zinc-400">⚠ = small sample (n &lt; 30), rate is noisy</span>
      </div>

      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
        {rows.map((r) => {
          const elevated = pct(r.medium + r.high, r.total)
          const high = pct(r.high, r.total)
          return (
            <li key={r.category} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Link
                  href={`/?cat=${encodeURIComponent(r.category)}`}
                  className="font-medium text-zinc-900 hover:underline"
                >
                  {r.category}
                </Link>
                <div className="flex items-baseline gap-3 text-sm tabular-nums">
                  <span className="font-semibold text-zinc-900">{elevated.toFixed(0)}% elevated</span>
                  <span className="text-red-600">{high.toFixed(0)}% high</span>
                  <span className="text-zinc-400">
                    n={r.total.toLocaleString()}
                    {r.total < 30 ? " ⚠" : ""}
                  </span>
                </div>
              </div>
              <div
                className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded bg-zinc-100"
                title={`${r.low} low · ${r.medium} medium · ${r.high} high`}
              >
                <div className="bg-green-500" style={{ width: `${pct(r.low, r.total)}%` }} />
                <div className="bg-amber-400" style={{ width: `${pct(r.medium, r.total)}%` }} />
                <div className="bg-red-500" style={{ width: `${pct(r.high, r.total)}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
