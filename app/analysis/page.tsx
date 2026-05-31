import Link from "next/link"
import { prisma } from "@/lib/db"
import { parseChecks } from "@/lib/shared/json-schemas"
import { CATEGORIES } from "@/lib/signals/job-category"

export const dynamic = "force-dynamic"

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)
const RANK = { low: 1, medium: 2, high: 3 } as const
type Band = keyof typeof RANK
const worse = (a: Band | undefined, b: Band): Band => (a && RANK[a] >= RANK[b] ? a : b)
const catOf = (c: string | null) => (c && (CATEGORIES as readonly string[]).includes(c) ? c : "Other")

type Tally = { low: number; medium: number; high: number; total: number }
const emptyTally = (): Tally => ({ low: 0, medium: 0, high: 0, total: 0 })
const addBand = (t: Tally, b: Band) => {
  t[b]++
  t.total++
}

function Bar({ t }: { t: Tally }) {
  return (
    <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded bg-zinc-100" title={`${t.low} low · ${t.medium} medium · ${t.high} high`}>
      <div className="bg-green-500" style={{ width: `${pct(t.low, t.total)}%` }} />
      <div className="bg-amber-400" style={{ width: `${pct(t.medium, t.total)}%` }} />
      <div className="bg-red-500" style={{ width: `${pct(t.high, t.total)}%` }} />
    </div>
  )
}

export default async function AnalysisPage() {
  const [postingGroups, companyJobs, employers] = await Promise.all([
    prisma.job.groupBy({ by: ["category", "riskBand"], _count: true, where: { scoredAt: { not: null } } }),
    prisma.job.findMany({
      where: { scoredAt: { not: null }, employerId: { not: null } },
      select: { employerId: true, category: true, riskBand: true },
    }),
    prisma.employer.findMany({ where: { jobs: { some: { scoredAt: { not: null } } } }, select: { checks: true } }),
  ])

  // --- Posting-weighted (per category) ---
  const postCat = new Map<string, Tally>()
  for (const cat of CATEGORIES) postCat.set(cat, emptyTally())
  for (const g of postingGroups) {
    if (g.riskBand === "low" || g.riskBand === "medium" || g.riskBand === "high") {
      const t = postCat.get(catOf(g.category))!
      t[g.riskBand] += g._count
      t.total += g._count
    }
  }

  // --- Company-weighted (each employer classified by its WORST posting) ---
  const overallEmp = new Map<string, Band>() // employerId -> worst band overall
  const catEmp = new Map<string, Map<string, Band>>() // category -> (employerId -> worst band in that category)
  for (const j of companyJobs) {
    if (j.riskBand !== "low" && j.riskBand !== "medium" && j.riskBand !== "high") continue
    const band = j.riskBand
    const eid = j.employerId!
    overallEmp.set(eid, worse(overallEmp.get(eid), band))
    const cat = catOf(j.category)
    if (!catEmp.has(cat)) catEmp.set(cat, new Map())
    const m = catEmp.get(cat)!
    m.set(eid, worse(m.get(eid), band))
  }

  const compCat = new Map<string, Tally>()
  for (const [cat, m] of catEmp) {
    const t = emptyTally()
    for (const band of m.values()) addBand(t, band)
    compCat.set(cat, t)
  }

  // Overall tallies
  const postOverall = emptyTally()
  for (const t of postCat.values()) {
    postOverall.low += t.low
    postOverall.medium += t.medium
    postOverall.high += t.high
    postOverall.total += t.total
  }
  const compOverall = emptyTally()
  for (const band of overallEmp.values()) addBand(compOverall, band)

  // Unverifiable companies (web-verdict businessMatch === "mismatch")
  let webMismatch = 0,
    webChecked = 0
  for (const e of employers) {
    const bm = parseChecks(e.checks).web?.businessMatch
    if (!bm) continue
    webChecked++
    if (bm === "mismatch") webMismatch++
  }

  const elev = (t: Tally) => pct(t.medium + t.high, t.total)
  const high = (t: Tally) => pct(t.high, t.total)

  // By-company category rows, sorted by company elevated-rate desc.
  const compRows = [...compCat.entries()]
    .map(([cat, t]) => ({ cat, t, post: postCat.get(cat) ?? emptyTally() }))
    .filter((r) => r.t.total > 0)
    .sort((a, b) => elev(b.t) - elev(a.t))

  const postRows = [...postCat.entries()]
    .map(([cat, t]) => ({ cat, t }))
    .filter((r) => r.t.total > 0)
    .sort((a, b) => elev(b.t) - elev(a.t))

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Elevated-risk rate by job type</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Share of postings rated <span className="text-amber-600">medium</span> or{" "}
          <span className="text-red-600">high</span> risk. Automated <em>screening signals</em>, not
          verdicts. <strong>By company</strong> counts each employer once (by its worst posting), so a
          few big legitimate employers posting many jobs don&apos;t mask how many distinct companies
          look suspicious; <strong>by posting</strong> counts every listing.
        </p>
        <p className="mt-3 text-sm text-zinc-700">
          <span className="font-semibold">{pct(compOverall.medium + compOverall.high, compOverall.total).toFixed(1)}%</span>{" "}
          of <span className="font-semibold">{compOverall.total.toLocaleString()}</span> companies are
          elevated risk ({compOverall.high.toLocaleString()} have a high-risk posting) — vs{" "}
          <span className="font-semibold">{elev(postOverall).toFixed(1)}%</span> of{" "}
          {postOverall.total.toLocaleString()} postings. {webMismatch.toLocaleString()} of{" "}
          {webChecked.toLocaleString()} web-checked companies are unverifiable as a real business
          (businessMatch = mismatch).
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green-500" /> Low</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Medium</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> High</span>
        <span className="text-zinc-400">⚠ = small sample (n &lt; 30)</span>
      </div>

      {/* By company */}
      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">By company</h2>
        <p className="mb-3 text-xs text-zinc-400">
          Each employer classified by its highest-risk posting and counted once per category it posts in.
          &ldquo;posting&rdquo; column shows the per-listing rate for contrast.
        </p>
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
          {compRows.map((r) => (
            <li key={r.cat} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Link href={`/?cat=${encodeURIComponent(r.cat)}`} className="font-medium text-zinc-900 hover:underline">
                  {r.cat}
                </Link>
                <div className="flex items-baseline gap-3 text-sm tabular-nums">
                  <span className="font-semibold text-zinc-900">{elev(r.t).toFixed(0)}% elevated</span>
                  <span className="text-red-600">{high(r.t).toFixed(0)}% high</span>
                  <span className="text-zinc-400">{r.t.total.toLocaleString()} cos{r.t.total < 30 ? " ⚠" : ""}</span>
                  <span className="text-zinc-300">· {elev(r.post).toFixed(0)}% of postings</span>
                </div>
              </div>
              <Bar t={r.t} />
            </li>
          ))}
        </ul>
      </section>

      {/* By posting */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">By posting</h2>
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
          {postRows.map((r) => (
            <li key={r.cat} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Link href={`/?cat=${encodeURIComponent(r.cat)}`} className="font-medium text-zinc-900 hover:underline">
                  {r.cat}
                </Link>
                <div className="flex items-baseline gap-3 text-sm tabular-nums">
                  <span className="font-semibold text-zinc-900">{elev(r.t).toFixed(0)}% elevated</span>
                  <span className="text-red-600">{high(r.t).toFixed(0)}% high</span>
                  <span className="text-zinc-400">{r.t.total.toLocaleString()} postings</span>
                </div>
              </div>
              <Bar t={r.t} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
