import Link from "next/link"
import { prisma } from "@/lib/db"
import { parseChecks } from "@/lib/shared/json-schemas"
import { requireAuditToken } from "./guard"

export const dynamic = "force-dynamic"

export default async function AuditIndexPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  requireAuditToken(token)

  const employers = await prisma.employer.findMany({
    where: { webSearchLogs: { some: {} } },
    include: {
      _count: { select: { webSearchLogs: true } },
      webSearchLogs: { orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true, queries: true } },
      jobs: {
        where: { scoredAt: { not: null } },
        orderBy: { fraudScore: "desc" },
        take: 1,
        select: { fraudScore: true, riskBand: true },
      },
    },
  })

  // Order by most-recently-verified (latest log row) first.
  employers.sort(
    (a, b) =>
      (b.webSearchLogs[0]?.capturedAt.getTime() ?? 0) - (a.webSearchLogs[0]?.capturedAt.getTime() ?? 0),
  )

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Web-search audit</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Raw <code className="rounded bg-zinc-100 px-1">web_search</code> activity captured behind each
          employer verification. Internal tool — unlinked, not for public use. {employers.length} employers
          with a captured trail.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Employer</th>
              <th className="px-4 py-2 font-semibold">Verdict</th>
              <th className="px-4 py-2 font-semibold">Mail-to</th>
              <th className="px-4 py-2 font-semibold">Top score</th>
              <th className="px-4 py-2 font-semibold">Logs</th>
              <th className="px-4 py-2 font-semibold">Last verified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {employers.map((e) => {
              const web = parseChecks(e.checks).web
              const addr = web?.applicationAddressType
              const flagged = addr === "residential" || addr === "po_box" || addr === "virtual"
              return (
                <tr key={e.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2">
                    <Link href={`/audit/${token}/${e.id}`} className="font-medium text-zinc-900 hover:underline">
                      {e.nameDisplay}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    {web ? (
                      <span className={web.businessMatch === "mismatch" ? "text-red-700" : "text-zinc-600"}>
                        {web.businessMatch}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {addr ? (
                      <span className={flagged ? "font-medium text-red-700" : "text-zinc-600"}>
                        {addr.replace("_", " ")}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">
                    {e.jobs[0]?.fraudScore ?? "—"}
                    {e.jobs[0]?.riskBand ? ` (${e.jobs[0].riskBand})` : ""}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{e._count.webSearchLogs}</td>
                  <td className="px-4 py-2 text-zinc-500">
                    {e.webSearchLogs[0]?.capturedAt
                      ? new Date(e.webSearchLogs[0].capturedAt).toLocaleString("en-CA")
                      : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
