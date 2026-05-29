import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { parseFlags, parseSignals, parseChecks } from "@/lib/json-schemas"
import { ScoreChip } from "@/components/ScoreChip"
import { FlagIcons } from "@/components/FlagIcons"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const job = await prisma.job.findUnique({ where: { workbcId: id }, include: { employer: true } })
  if (!job) notFound()

  if (!job.scoredAt) {
    return (
      <div className="space-y-4">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Back to all postings
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-900">{job.title}</h1>
        <p className="text-zinc-600">This posting hasn’t been evaluated yet.</p>
      </div>
    )
  }

  const signals = parseSignals(job.signals).slice().sort((a, b) => b.weight - a.weight)
  const flags = parseFlags(job.applicationFlags)
  const checks = job.employer ? parseChecks(job.employer.checks) : {}

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Back to all postings
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <ScoreChip score={job.fraudScore ?? 0} />
            <h1 className="text-2xl font-semibold text-zinc-900">{job.title}</h1>
          </div>
          <p className="mt-1 text-zinc-600">
            {job.employer ? (
              <Link href={`/e/${job.employer.id}`} className="hover:underline">
                {job.employer.nameDisplay}
              </Link>
            ) : (
              <span className="italic text-zinc-400">employer hidden</span>
            )}
            {job.location ? ` · ${job.location}` : ""}
            {job.salary ? ` · ${job.salary}` : ""}
          </p>
        </div>
        <a
          href={job.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          View on WorkBC ↗
        </a>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Verdict</h2>
        <p className="mb-4 text-zinc-700">{job.reasoning ?? ""}</p>
        {signals.length > 0 && (
          <ul className="space-y-2">
            {signals.map((s, i) => {
              const fraud = s.weight >= 0
              const pct = Math.min(100, (Math.abs(s.weight) / 30) * 100)
              return (
                <li key={i} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-800">{s.label}</span>
                    <span className={cn("tabular-nums font-medium", fraud ? "text-red-600" : "text-green-600")}>
                      {fraud ? "+" : ""}
                      {s.weight}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-zinc-100">
                    <div
                      className={cn("h-full rounded", fraud ? "bg-red-500" : "bg-green-500")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {s.evidence && <p className="mt-1 text-xs text-zinc-500">{s.evidence}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <details className="rounded-lg border border-zinc-200 bg-white p-5" open>
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Application flags ({flags.length})
        </summary>
        <div className="mt-3 space-y-2">
          {flags.length === 0 ? (
            <p className="text-sm text-zinc-400">No application flags detected.</p>
          ) : (
            flags.map((f, i) => (
              <div key={i} className="text-sm">
                <FlagIcons flags={[f]} />
                <p className="mt-1 text-xs text-zinc-500">{f.evidence}</p>
              </div>
            ))
          )}
        </div>
      </details>

      {job.employer && (
        <details className="rounded-lg border border-zinc-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Employer checks
          </summary>
          <pre className="mt-3 overflow-x-auto rounded bg-zinc-50 p-3 text-xs text-zinc-700">
            {JSON.stringify(checks, null, 2)}
          </pre>
        </details>
      )}

      <details className="rounded-lg border border-zinc-200 bg-white p-5">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Full description
        </summary>
        <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
          {job.descriptionMd}
        </pre>
      </details>
    </div>
  )
}
