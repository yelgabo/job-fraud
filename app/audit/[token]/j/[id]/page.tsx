import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { JobReport } from "@/components/JobReport"
import { requireAuditToken } from "../../guard"
import { addNote, flagForJudge } from "./actions"

export const dynamic = "force-dynamic"

// Admin mirror of a posting's fraud report: the same report body as /j/[id], plus the owner's
// notes thread and re-run / deep-look flags. Unlinked and token-gated like the rest of /audit.
export default async function AdminJobPage({
  params,
}: {
  params: Promise<{ token: string; id: string }>
}) {
  const { token, id } = await params
  requireAuditToken(token)

  const job = await prisma.job.findUnique({ where: { workbcId: id }, include: { employer: true } })
  if (!job) notFound()

  const [notes, requests, latest] = await Promise.all([
    prisma.reviewNote.findMany({ where: { workbcId: id }, orderBy: { createdAt: "desc" } }),
    prisma.judgeRequest.findMany({ where: { workbcId: id }, orderBy: { createdAt: "desc" } }),
    prisma.job.aggregate({ _max: { lastSeenAt: true } }),
  ])
  const openRequests = requests.filter((r) => !r.resolvedAt)

  const addNoteAction = addNote.bind(null, token, id)
  const flagAction = flagForJudge.bind(null, token, id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/audit/${token}`} className="text-sm text-zinc-500 hover:underline">
          ← Audit home
        </Link>
        <Link href={`/j/${id}`} className="text-sm text-zinc-500 hover:underline">
          Public page ↗
        </Link>
      </div>

      <section className="rounded-lg border-2 border-amber-300 bg-amber-50 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-700">
          Admin panel
        </h2>

        {!job.scoredAt && (
          <p className="mb-3 rounded bg-white px-3 py-2 text-sm text-amber-800">
            Pending — this posting is queued for the next judge run.
          </p>
        )}
        {openRequests.length > 0 && (
          <ul className="mb-3 space-y-1">
            {openRequests.map((r) => (
              <li key={r.id} className="rounded bg-white px-3 py-2 text-sm text-amber-800">
                Open <span className="font-semibold">{r.kind}</span> request from{" "}
                {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                {r.note ? ` — “${r.note}”` : ""}
              </li>
            ))}
          </ul>
        )}

        <form action={flagAction} className="space-y-2">
          <textarea
            name="note"
            rows={2}
            placeholder="Optional note — passed to the deep-look agent as owner context"
            className="w-full rounded-md border border-amber-200 bg-white p-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="kind"
              value="rerun"
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Flag: re-run next update
            </button>
            <button
              type="submit"
              name="kind"
              value="deep"
              className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
            >
              Flag: deep look
            </button>
          </div>
        </form>

        <div className="mt-5 border-t border-amber-200 pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            Notes ({notes.length})
          </h3>
          <form action={addNoteAction} className="mb-3 flex gap-2">
            <input
              name="body"
              placeholder="Add a comment…"
              className="flex-1 rounded-md border border-amber-200 bg-white p-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              Save
            </button>
          </form>
          {notes.length === 0 ? (
            <p className="text-sm text-amber-700/60">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded bg-white px-3 py-2 text-sm text-zinc-700">
                  <span className="mr-2 text-xs text-zinc-400">
                    {n.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                  {n.body}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {job.scoredAt ? (
        <JobReport job={job} latestSeenAt={latest._max.lastSeenAt} />
      ) : (
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{job.title}</h1>
          <p className="text-zinc-600">This posting hasn’t been evaluated yet.</p>
        </div>
      )}
    </div>
  )
}
