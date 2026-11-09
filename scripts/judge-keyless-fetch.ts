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
import { planImpersonationChecks } from "../lib/signals/impersonation-plan"

async function main() {
  const argv = process.argv.slice(2)
  let limit: number | undefined
  let batchSize = 15
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") limit = parseInt(argv[++i] ?? "", 10) || undefined
    else if (argv[i] === "--batch-size") batchSize = parseInt(argv[++i] ?? "", 10) || 15
  }

  const jobs = await prisma.job.findMany({
    where: { status: "PENDING" },
    orderBy: { scrapedAt: "asc" },
    take: limit,
    include: { employer: true },
  })
  const plans = planByEmployer(jobs)

  const items = plans
    .filter((p) => p.action === "web")
    .map(({ representative: j, postings, employerId }) => ({
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
      // Not for the helper: the apply step stores the verdict on this employer and scores exactly
      // these postings with it. Recorded here because an impersonation result applied first can
      // re-attribute the representative posting to another company.
      employerId,
      employerPostings: postings.map((p) => p.workbcId),
    }))
  const cached = plans
    .filter((p) => p.action !== "web")
    .flatMap((p) => p.postings.map((j) => ({ workbcId: j.workbcId, action: p.action })))

  const fetchedAt = new Date()
  const stamp = fetchedAt.toISOString().replace(/[:.]/g, "-")
  const dir = join("logs", `judge-${stamp}`)
  mkdirSync(dir, { recursive: true })
  // Apply compares employer verdicts against fetchedAt, and refuses a dir without this file.
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ fetchedAt: fetchedAt.toISOString(), pending: jobs.length }, null, 2), "utf8")
  let batches = 0
  for (let i = 0; i < items.length; i += batchSize) {
    batches++
    const name = `batch-${String(batches).padStart(3, "0")}.json`
    writeFileSync(join(dir, name), JSON.stringify(items.slice(i, i + batchSize), null, 2), "utf8")
  }
  writeFileSync(join(dir, "cached.json"), JSON.stringify(cached, null, 2), "utf8")

  // The API judge runs this check per posting with an Opus API call; here Opus helper agents run
  // it, and apply holds back any posting it covers until a result for its item is in the dir.
  const impersonation = planImpersonationChecks(jobs)
  let impersonationFiles = 0
  for (let i = 0; i < impersonation.length; i += 10) {
    impersonationFiles++
    const name = `impersonation-${String(impersonationFiles).padStart(3, "0")}.json`
    writeFileSync(join(dir, name), JSON.stringify(impersonation.slice(i, i + 10), null, 2), "utf8")
  }

  console.log(
    `[judge-keyless:fetch] ${jobs.length} pending postings from ${plans.length} employers: ` +
      `${items.length} employers to investigate in ${batches} batch files, ` +
      `${cached.length} postings scored from a cached or presumed verdict (cached.json) -> ${dir}`,
  )
  console.log(
    `[judge-keyless:fetch] ${impersonation.length} employer-tenant pairs need an impersonation check ` +
      `(${impersonation.reduce((n, i) => n + i.postings.length, 0)} postings) in ${impersonationFiles} impersonation files`,
  )
  console.log(`DIR=${dir} BATCHES=${batches} IMPERSONATION=${impersonationFiles}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
