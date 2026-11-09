// Read-only: how many currently listed, published postings would a refetch send back to pending?
// Samples the scheduler's two search passes, refetches each sampled posting's detail and compares
// it with the stored row the way scrape.ts does. Writes nothing.
// Run: npx tsx --env-file=.env scripts/measure-refetch-drift.ts [sampleSize]
import pLimit from "p-limit"
import { prisma } from "../lib/db"
import { cityLocation, fetchJobDetailApi, searchJobsApi } from "../lib/workbc/workbc-api"
import { normalizeEmployer } from "../lib/signals/normalize-employer"
import { contentChanged, dueForRefetch, salaryChanged, type PostingContent } from "../lib/shared/posting-content"

async function main() {
  const sample = parseInt(process.argv[2] ?? "150", 10) || 150
  const stubs = new Map(
    [
      ...(await searchJobsApi("software engineer", 5000)),
      ...(await searchJobsApi("software", 5000)),
      ...(await searchJobsApi("", 5000, undefined, 0, [cityLocation("Victoria")])),
    ].map((s) => [s.workbcId, s]),
  )
  const rows = await prisma.job.findMany({
    where: { workbcId: { in: [...stubs.keys()] }, status: "PUBLISHED" },
    select: {
      workbcId: true, title: true, descriptionMd: true, externalApplyUrl: true, salary: true, location: true,
      employerId: true, scrapedAt: true, verdictKind: true,
    },
  })
  const now = new Date()
  const due = rows.filter((r) => r.verdictKind !== "IMPERSONATION" && dueForRefetch({ fetchedAt: null, scrapedAt: r.scrapedAt }, 28, now))
  const picked = due.sort(() => Math.random() - 0.5).slice(0, sample)
  const employers = new Map((await prisma.employer.findMany({ select: { id: true, nameNormalized: true } })).map((e) => [e.nameNormalized, e.id]))

  const fieldHits: Record<string, number> = {}
  let changed = 0, failed = 0
  const examples: string[] = []
  const limit = pLimit(6)
  await Promise.all(picked.map((r) => limit(async () => {
    const stub = stubs.get(r.workbcId)!
    const d = await fetchJobDetailApi(r.workbcId).catch(() => null)
    if (!d) { failed++; return }
    let externalApplyUrl: string | null = null
    try { if (d.applyUrl && !/workbc\.ca$/i.test(new URL(d.applyUrl).hostname)) externalApplyUrl = d.applyUrl } catch { /* not a URL */ }
    const name = stub.employerName ?? d.employerName
    const after: PostingContent = {
      title: d.title || stub.title,
      descriptionMd: d.descriptionMd,
      externalApplyUrl,
      salary: d.salary,
      location: d.location ?? stub.location ?? null,
      employerId: name ? employers.get(normalizeEmployer(name)) ?? null : null,
    }
    if (!contentChanged(r, after)) return
    changed++
    if (examples.length < 8) {
      const f = salaryChanged(r.salary, after.salary) ? "salary" as const : (["title", "descriptionMd"] as const).find((k) => (r[k] ?? null) !== (after[k] ?? null)) ?? "title"
      const a = String(r[f] ?? ""), b = String(after[f] ?? "")
      let i = 0
      while (i < a.length && a[i] === b[i]) i++
      examples.push(`${r.workbcId} ${f} @${i}: ${JSON.stringify(a.slice(Math.max(0, i - 30), i + 60))} -> ${JSON.stringify(b.slice(Math.max(0, i - 30), i + 60))}`)
    }
    for (const f of ["title", "descriptionMd", "externalApplyUrl", "salary", "location", "employerId"] as const) {
      if (f === "salary" ? salaryChanged(r.salary, after.salary) : (r[f] ?? null) !== (after[f] ?? null)) fieldHits[f] = (fieldHits[f] ?? 0) + 1
    }
  })))
  console.log(JSON.stringify({ listedAndPublished: rows.length, dueForRefetch: due.length, sampled: picked.length, failed, changed, fieldHits }))
  for (const e of examples) console.log(e)
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
