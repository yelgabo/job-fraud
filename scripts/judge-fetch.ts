// JUDGE (phase 2), step 1 — FETCH + BATCH.
// Dumps pending (unjudged) postings into a timestamped dir as batch files, one per fraud agent.
// Read-only. Pair with judge-apply.ts (the single DB writer).
// Run: npm run judge:fetch -- [--limit N] [--batch-size B]
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { prisma } from "../lib/db"
import { parseFlags } from "../lib/json-schemas"

async function main() {
  const argv = process.argv.slice(2)
  let limit: number | undefined
  let batchSize = 15
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") limit = parseInt(argv[++i] ?? "", 10) || undefined
    else if (argv[i] === "--batch-size") batchSize = parseInt(argv[++i] ?? "", 10) || 15
  }

  const jobs = await prisma.job.findMany({
    where: { scoredAt: null },
    orderBy: { scrapedAt: "asc" },
    take: limit,
    include: { employer: true },
  })

  const items = jobs.map((j) => ({
    workbcId: j.workbcId,
    title: j.title,
    employer: j.employer?.nameDisplay ?? null,
    location: j.location,
    salary: j.salary,
    postedAt: j.postedAt,
    atsProvider: j.atsProvider,
    externalApplyOk: j.externalApplyOk,
    flags: parseFlags(j.applicationFlags),
    descriptionExcerpt: j.descriptionMd.slice(0, 1800),
  }))

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const dir = join("logs", `judge-${stamp}`)
  mkdirSync(dir, { recursive: true })
  let batches = 0
  for (let i = 0; i < items.length; i += batchSize) {
    batches++
    const name = `batch-${String(batches).padStart(3, "0")}.json`
    writeFileSync(join(dir, name), JSON.stringify(items.slice(i, i + batchSize), null, 2), "utf8")
  }
  console.log(`[judge:fetch] ${items.length} pending -> ${batches} batch files in ${dir}`)
  console.log(`DIR=${dir} BATCHES=${batches}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
