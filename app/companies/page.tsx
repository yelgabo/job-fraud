import Link from "next/link"
import { prisma } from "@/lib/db"
import { parseChecks } from "@/lib/json-schemas"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const BAND_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-green-500",
}

export default async function CompaniesPage() {
  // Employers with at least one judged posting, plus their judged jobs' scores/bands.
  const employers = await prisma.employer.findMany({
    where: { jobs: { some: { scoredAt: { not: null } } } },
    include: { jobs: { where: { scoredAt: { not: null } }, select: { fraudScore: true, riskBand: true } } },
  })

  const rows = employers
    .map((e) => {
      const bands = { high: 0, medium: 0, low: 0 } as Record<string, number>
      let worst = -1
      for (const j of e.jobs) {
        if (j.riskBand && j.riskBand in bands) bands[j.riskBand]++
        if ((j.fraudScore ?? -1) > worst) worst = j.fraudScore ?? -1
      }
      const web = parseChecks(e.checks).web
      return { id: e.id, name: e.nameDisplay, count: e.jobs.length, bands, worst, web }
    })
    // most suspicious first (highest single posting score), then by posting count
    .sort((a, b) => b.worst - a.worst || b.count - a.count)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-zinc-900">Companies</h1>
        <p className="text-sm text-zinc-500">{rows.length} employers with judged postings</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-500">
          No judged postings yet.
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
    </div>
  )
}
