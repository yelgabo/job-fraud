import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { parseChecks } from "@/lib/json-schemas"
import { ScoreChip } from "@/components/ScoreChip"
import { requireAuditToken } from "../guard"

export const dynamic = "force-dynamic"

type SearchResult = { title?: string; url?: string; page_age?: string; encrypted_content?: string }
type SearchGroup = { query: string | null; results: SearchResult[]; error: string | null }

// Walk a log row's raw `blocks` (verbatim server_tool_use + web_search_tool_result content blocks)
// into query->results groups, in the order Claude issued them.
function groupBlocks(blocks: unknown): SearchGroup[] {
  if (!Array.isArray(blocks)) return []
  const groups: SearchGroup[] = []
  for (const raw of blocks) {
    const b = raw as { type?: string; name?: string; input?: { query?: unknown }; content?: unknown }
    if (b?.type === "server_tool_use" && b.name === "web_search") {
      groups.push({ query: typeof b.input?.query === "string" ? b.input.query : null, results: [], error: null })
    } else if (b?.type === "web_search_tool_result") {
      const target = groups[groups.length - 1] ?? { query: null, results: [], error: null }
      if (groups.length === 0) groups.push(target)
      if (Array.isArray(b.content)) {
        for (const c of b.content as SearchResult[] & { type?: string }[]) {
          if ((c as { type?: string }).type === "web_search_result") target.results.push(c)
        }
      } else if (b.content && typeof b.content === "object") {
        const c = b.content as { error_code?: string; type?: string }
        target.error = c.error_code ?? c.type ?? "error"
      }
    }
  }
  return groups
}

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ token: string; employerId: string }>
}) {
  const { token, employerId } = await params
  requireAuditToken(token)

  const employer = await prisma.employer.findUnique({
    where: { id: employerId },
    include: {
      webSearchLogs: { orderBy: { capturedAt: "desc" } },
      jobs: { where: { scoredAt: { not: null } }, orderBy: { fraudScore: "desc" } },
    },
  })
  if (!employer) notFound()

  const web = parseChecks(employer.checks).web

  return (
    <div className="space-y-6">
      <Link href={`/audit/${token}`} className="text-sm text-zinc-500 hover:underline">
        ← All audited employers
      </Link>

      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">{employer.nameDisplay}</h1>
        <p className="mt-1 text-sm text-zinc-500">{employer.webSearchLogs.length} verification(s) captured</p>
      </header>

      {/* Verdict context */}
      {web ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Current verdict</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-zinc-700">
            <span>business: <b>{web.businessMatch}</b></span>
            <span>location: <b>{web.locationMatch}</b></span>
            <span>jobs page: <b>{web.hasJobsListing}</b></span>
            <span>
              mail-to:{" "}
              <b className={["residential", "po_box", "virtual"].includes(web.applicationAddressType ?? "") ? "text-red-700" : ""}>
                {web.applicationAddressType}
              </b>
            </span>
            <span>confidence: <b>{web.confidence.toFixed(2)}</b></span>
          </div>
          {web.websiteUrl && (
            <a href={web.websiteUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block text-blue-700 hover:underline">
              {web.websiteUrl}
            </a>
          )}
          <p className="mt-2 text-zinc-500">{web.summary}</p>
        </section>
      ) : (
        <p className="text-sm text-zinc-400">No web verdict stored on this employer.</p>
      )}

      {/* Jobs */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Postings ({employer.jobs.length})
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <ul className="divide-y divide-zinc-100">
            {employer.jobs.map((job) => (
              <li key={job.workbcId} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-zinc-50">
                <ScoreChip score={job.fraudScore ?? 0} />
                <Link href={`/j/${job.workbcId}`} className="font-medium text-zinc-900 hover:underline">
                  {job.title}
                </Link>
                {job.location && <span className="text-zinc-500">· {job.location}</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Search logs, newest first */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Search trail</h2>
        {employer.webSearchLogs.length === 0 && <p className="text-sm text-zinc-400">No captured searches.</p>}
        {employer.webSearchLogs.map((log) => {
          const groups = groupBlocks(log.blocks)
          const queries = Array.isArray(log.queries) ? (log.queries as string[]) : []
          const totalResults = groups.reduce((n, g) => n + g.results.length, 0)
          return (
            <div key={log.id} className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs text-zinc-400">{new Date(log.capturedAt).toLocaleString("en-CA")}</span>
                <span className="text-xs text-zinc-400">
                  {queries.length} quer{queries.length === 1 ? "y" : "ies"} · {totalResults} results
                </span>
              </div>

              {groups.length === 0 ? (
                <p className="text-zinc-400">No searches issued in this verification.</p>
              ) : (
                <ol className="space-y-3">
                  {groups.map((g, i) => (
                    <li key={i} className="border-l-2 border-zinc-200 pl-3">
                      <p className="font-mono text-xs text-zinc-900">
                        🔍 {g.query ?? <span className="italic text-zinc-400">(query not captured)</span>}
                      </p>
                      {g.error ? (
                        <p className="mt-1 text-xs text-red-700">search error: {g.error}</p>
                      ) : g.results.length === 0 ? (
                        <p className="mt-1 text-xs text-zinc-400">no results</p>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {g.results.map((r, j) => (
                            <li key={j} className="text-xs">
                              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
                                {r.title || r.url}
                              </a>
                              <span className="ml-1 text-zinc-400 break-all">{r.url}</span>
                              {r.page_age && <span className="ml-1 text-zinc-400">· {r.page_age}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-3 text-[11px] text-zinc-300">
                Raw blocks stored ({Array.isArray(log.blocks) ? (log.blocks as unknown[]).length : 0}), incl.
                encrypted_content for replay/citation.
              </p>
            </div>
          )
        })}
      </section>
    </div>
  )
}
