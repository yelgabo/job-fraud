import Link from "next/link"
import { prisma } from "@/lib/db"
import { parseChecks } from "@/lib/shared/json-schemas"
import { requireAuditToken } from "./guard"
import { isPrivateAddress, scoredAddressType } from "@/lib/shared/address-type"
import { isPresumed } from "@/lib/shared/employer-check"
import { scrapeRunStatus } from "@/lib/shared/scrape-run-status"

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
        where: { status: "PUBLISHED" },
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

  const openRequests = await prisma.judgeRequest.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "desc" },
  })
  const requestJobs = await prisma.job.findMany({
    where: { workbcId: { in: openRequests.map((r) => r.workbcId) } },
    select: { workbcId: true, title: true },
  })
  const titleFor = new Map(requestJobs.map((j) => [j.workbcId, j.title]))
  const [runs, scrapeRuns] = await Promise.all([
    prisma.judgeRun.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    prisma.scrapeRun.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
  ])
  const now = new Date()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Web-search audit</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Raw <code className="rounded bg-zinc-100 px-1">web_search</code> activity captured behind each
          employer verification. Internal tool — unlinked, not for public use. {employers.length} employers
          with a captured trail. To review a posting, open{" "}
          <code className="rounded bg-zinc-100 px-1">/audit/&lt;token&gt;/j/&lt;workbcId&gt;</code>.
        </p>
      </header>

      <section className="rounded-lg border-2 border-amber-300 bg-amber-50 p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-700">
          Review queue ({openRequests.length} open)
        </h2>
        {openRequests.length === 0 ? (
          <p className="text-sm text-amber-700/60">
            No open re-judge requests. Flag postings from their admin pages.
          </p>
        ) : (
          <ul className="space-y-1">
            {openRequests.map((r) => (
              <li key={r.id} className="rounded bg-white px-3 py-2 text-sm">
                <span className="mr-2 font-semibold text-amber-800">{r.kind}</span>
                <Link href={`/audit/${token}/j/${r.workbcId}`} className="text-zinc-900 hover:underline">
                  {titleFor.get(r.workbcId) ?? r.workbcId}
                </Link>
                {r.note ? <span className="ml-2 text-zinc-500">— “{r.note}”</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent judge runs</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-zinc-400">No judge run recorded yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {runs.map((r) => (
                <li key={r.id} className="text-zinc-700">
                  <span className={r.outcome === "OK" ? "font-semibold text-zinc-700" : "font-semibold text-red-700"}>
                    {r.outcome}
                  </span>{" "}
                  {r.path.toLowerCase()} · {new Date(r.startedAt).toLocaleString("en-CA")} · {r.pendingAtStart} pending at
                  start, {r.scored} scored, {r.held} held, {r.failed} failed
                  {r.note ? <span className="ml-2 text-zinc-500">{r.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent scrape runs</h2>
          {scrapeRuns.length === 0 ? (
            <p className="text-sm text-zinc-400">No scrape run recorded yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {scrapeRuns.map((r) => {
                const status = scrapeRunStatus(r, now)
                return (
                  <li key={r.id} className="text-zinc-700">
                    <span
                      className={
                        status === "OK" || status === "RUNNING" ? "font-semibold text-zinc-700" : "font-semibold text-red-700"
                      }
                    >
                      {status}
                    </span>{" "}
                    {new Date(r.startedAt).toLocaleString("en-CA")} ·{" "}
                    <code className="rounded bg-zinc-100 px-1 text-xs">{r.args || "(no args)"}</code> · {r.listed} listed,{" "}
                    {r.toFetch} to fetch, {r.written} written, {r.sentBack} sent back, {r.failed} failed
                    {r.note ? <span className="ml-2 text-zinc-500">{r.note}</span> : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

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
              const flagged = web ? isPrivateAddress(scoredAddressType(web)) : false
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
                        {isPresumed(web) ? (
                          <span className="ml-1 text-xs text-zinc-400">(presumed, no web search)</span>
                        ) : null}
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
