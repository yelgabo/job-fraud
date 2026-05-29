import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { parseChecks } from "@/lib/json-schemas"
import { ScoreChip } from "@/components/ScoreChip"

export const dynamic = "force-dynamic"

function ReachBadge({ value }: { value: boolean | null | undefined }) {
  if (value === true) return <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">✓ reachable</span>
  if (value === false) return <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">✗ unreachable</span>
  return <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">not checked</span>
}

function TriBadge({
  value,
  good,
  bad,
  unknown,
}: {
  value: string | null | undefined
  good: string
  bad: string
  unknown: string
}) {
  if (value === "match" || value === "yes")
    return <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">{good}</span>
  if (value === "mismatch" || value === "no")
    return <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">{bad}</span>
  return <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">{unknown}</span>
}

export default async function EmployerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const employer = await prisma.employer.findUnique({
    where: { id },
    include: { jobs: { orderBy: { fraudScore: "desc" } } },
  })
  if (!employer) notFound()

  const checks = parseChecks(employer.checks)

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Back to all postings
      </Link>

      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">{employer.nameDisplay}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
          {employer.website ? (
            <a href={employer.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {employer.website}
            </a>
          ) : (
            <span className="italic text-zinc-400">no website</span>
          )}
          <ReachBadge value={checks.websiteReachable} />
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Address claimed</h2>
          <p className="text-zinc-700">{employer.addressRaw ?? "—"}</p>
          {checks.addressResolvedTo && (
            <p className="mt-2 text-xs text-zinc-500">
              Resolved to: {checks.addressResolvedTo}
              {typeof checks.addressMatchConfidence === "number"
                ? ` (confidence ${checks.addressMatchConfidence.toFixed(2)})`
                : ""}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Verification</h2>
          <pre className="overflow-x-auto text-xs text-zinc-700">{JSON.stringify(checks, null, 2)}</pre>
          {employer.checkedAt && (
            <p className="mt-2 text-xs text-zinc-400">
              Checked {new Date(employer.checkedAt).toLocaleString("en-CA")}
            </p>
          )}
        </div>
      </section>

      {checks.web && (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Web verification</h2>
          <div className="flex flex-wrap items-center gap-2">
            {checks.web.websiteUrl ? (
              <a
                href={checks.web.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {checks.web.websiteUrl}
              </a>
            ) : (
              <span className="italic text-zinc-400">no site found</span>
            )}
            <TriBadge
              value={checks.web.businessMatch}
              good="real / matches"
              bad="business mismatch"
              unknown="business uncertain"
            />
            <TriBadge
              value={checks.web.locationMatch}
              good="location agrees"
              bad="location mismatch"
              unknown="location uncertain"
            />
            {checks.web.hasJobsListing === "yes" && (
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">has careers page</span>
            )}
            {["residential", "po_box", "virtual"].includes(checks.web.applicationAddressType ?? "") && (
              <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                ⚠ mail-to: {(checks.web.applicationAddressType ?? "").replace("_", " ")} address
              </span>
            )}
            {checks.web.applicationAddressType === "business" && (
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">business mailing address</span>
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {checks.web.summary} (confidence {checks.web.confidence.toFixed(2)})
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Postings in this scan ({employer.jobs.length})
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <ul className="divide-y divide-zinc-100">
            {employer.jobs.map((job) => (
              <li key={job.workbcId} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                <ScoreChip score={job.fraudScore} />
                <Link href={`/j/${job.workbcId}`} className="font-medium text-zinc-900 hover:underline">
                  {job.title}
                </Link>
                {job.location && <span className="text-sm text-zinc-500">· {job.location}</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
