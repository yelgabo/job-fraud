import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { JobReport } from "@/components/JobReport"

// Rendered on demand per posting, then cached up to 10 minutes; a re-judged score appears within
// that window. The empty generateStaticParams opts the route into on-demand static generation
// without prerendering any path, so the build never queries the database (the Railway builder
// has no private-network route to Postgres).
export const revalidate = 600
export function generateStaticParams(): Array<{ id: string }> {
  return []
}

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

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Back to all postings
      </Link>
      <JobReport job={job} />
    </div>
  )
}
