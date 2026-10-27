// KEYLESS JUDGE, step 1 of 2: FETCH + BATCH. Read-only. Pair with judge-keyless-apply.ts.
// Takes the next pending postings, groups them by employer, and writes one batch item per
// employer that needs a web check (verificationAction, the rule the API judge uses), so helper
// agents investigate each employer once however many postings it has. Postings whose employer
// needs no check go to cached.json; the apply step scores them from the cached verdict.
// Run: npm run judge-keyless:fetch -- [--limit N] [--batch-size B]
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { prisma } from "../lib/db"
import { parseFlags } from "../lib/shared/json-schemas"
import { planByEmployer } from "../lib/signals/verification-plan"

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
  const plans = planByEmployer(jobs)

  const items = plans
    .filter((p) => p.action === "web")
    .map(({ representative: j, postings }) => ({
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
      // Not for the helper: the apply step scores exactly these postings with this employer's verdict.
      employerPostings: postings.map((p) => p.workbcId),
    }))
  const cached = plans
    .filter((p) => p.action !== "web")
    .flatMap((p) => p.postings.map((j) => ({ workbcId: j.workbcId, action: p.action })))

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const dir = join("logs", `judge-${stamp}`)
  mkdirSync(dir, { recursive: true })
  let batches = 0
  for (let i = 0; i < items.length; i += batchSize) {
    batches++
    const name = `batch-${String(batches).padStart(3, "0")}.json`
    writeFileSync(join(dir, name), JSON.stringify(items.slice(i, i + batchSize), null, 2), "utf8")
  }
  writeFileSync(join(dir, "cached.json"), JSON.stringify(cached, null, 2), "utf8")

  console.log(
    `[judge-keyless:fetch] ${jobs.length} pending postings from ${plans.length} employers: ` +
      `${items.length} employers to investigate in ${batches} batch files, ` +
      `${cached.length} postings scored from a cached or presumed verdict (cached.json) -> ${dir}`,
  )
  console.log(`DIR=${dir} BATCHES=${batches}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
