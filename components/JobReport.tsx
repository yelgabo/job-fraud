import Link from "next/link"
import type { Employer, Job } from "@prisma/client"
import { parseFlags, parseSignals, parseChecks } from "@/lib/shared/json-schemas"
import { effectivePostedDate, formatPostedDate } from "@/lib/shared/posted-date"
import { humanizeSignalLabel } from "@/lib/shared/signal-labels"
import { RATING_ANCHOR } from "@/lib/shared/methodology"
import { ScoreChip } from "@/components/ScoreChip"
import { EmployerChecks } from "@/components/EmployerChecks"
import { FlagIcons } from "@/components/FlagIcons"
import { cn } from "@/lib/utils"

// The full fraud-report body for one posting: header, verdict + signals, flags, employer
// checks, description. Shared by the public /j/[id] page and the token-gated /audit admin
// mirror so the two never drift.
export function JobReport({ job }: { job: Job & { employer: Employer | null } }) {
  const signals = parseSignals(job.signals).slice().sort((a, b) => b.weight - a.weight)
  const flags = parseFlags(job.applicationFlags)
  const checks = job.employer ? parseChecks(job.employer.checks) : {}
  const posted = effectivePostedDate({ postedDate: job.postedDate, scrapedAt: job.scrapedAt })

  return (
    <div className="space-y-6">
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
          <p className="mt-1 text-sm text-zinc-500">
            <span
              title={
                posted.estimated
                  ? "This posting has no usable posted date. Estimated from the date it was scraped."
                  : undefined
              }
            >
              Posted {formatPostedDate(posted)}
            </span>
            {" · "}
            {job.scoredAt ? `Reviewed on ${job.scoredAt.toISOString().slice(0, 10)}` : "Not yet reviewed"}
            {" · "}
            <Link href={`/about#${RATING_ANCHOR}`} className="underline hover:text-zinc-700">
              What do these ratings mean?
            </Link>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {job.externalApplyUrl ? (
              <>
                <a
                  href={job.externalApplyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={job.externalApplyHost ?? undefined}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
                >
                  Apply ↗
                </a>
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  WorkBC listing ↗
                </a>
              </>
            ) : (
              <a
                href={job.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                View on WorkBC ↗
              </a>
            )}
          </div>
          {job.externalApplyHost && (
            <p className="text-xs text-zinc-400">
              applies via {job.externalApplyHost}
              {job.atsProvider && job.atsProvider !== "unknown" ? ` (${job.atsProvider})` : ""}
            </p>
          )}
        </div>
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
                    {/* title keeps the stored label inspectable when a plain rendering replaced it */}
                    <span className="text-zinc-800" title={humanizeSignalLabel(s.label) !== s.label ? s.label : undefined}>
                      {humanizeSignalLabel(s.label)}
                    </span>
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
          <EmployerChecks checks={checks} checkedAt={job.employer.checkedAt} />
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
