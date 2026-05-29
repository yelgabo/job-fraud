// JUDGE (phase 2), step 1 of 2 — FETCH.
// Dumps pending (unjudged) postings as JSON so the orchestrating session can hand batches to
// fraud-detection agents. Read-only. Pair with judge-apply.ts (the single DB writer).
// Run: npm run judge:fetch -- [--limit N]
import { writeFileSync } from "node:fs"
import { prisma } from "../lib/db"
import { parseFlags } from "../lib/json-schemas"

async function main() {
  const argv = process.argv.slice(2)
  let limit: number | undefined
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--limit") limit = parseInt(argv[++i] ?? "", 10) || undefined

  const jobs = await prisma.job.findMany({
    where: { scoredAt: null },
    orderBy: { scrapedAt: "asc" },
    take: limit,
    include: { employer: true },
  })

  const out = jobs.map((j) => ({
    workbcId: j.workbcId,
    title: j.title,
    employer: j.employer?.nameDisplay ?? null,
    location: j.location,
    salary: j.salary,
    postedAt: j.postedAt,
    atsProvider: j.atsProvider,
    externalApplyOk: j.externalApplyOk,
    // flags carry evidence (incl. any mailing address) the agent should weigh + verify
    flags: parseFlags(j.applicationFlags),
    descriptionExcerpt: j.descriptionMd.slice(0, 1800),
  }))

  const path = `logs/pending-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  writeFileSync(path, JSON.stringify(out, null, 2), "utf8")
  console.log(`[judge:fetch] ${out.length} pending postings -> ${path}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
