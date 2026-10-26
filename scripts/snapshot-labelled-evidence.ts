// Freezes the evidence behind every posting on the label worksheet into a fixture the label
// harness (lib/eval/) reads, so the eval runs in CI with no database. READ-ONLY against the DB.
// Run: npm run eval:snapshot -- [--ask-jev]
//
// --ask-jev asks Jev for any posting whose row has no stored judgments (one TypeSafe call each).
// Without it those cases carry judgments = null and are composed the way a keyless run would be.
//
// Re-snapshotting changes the evidence under every label, so the baseline in lib/eval/baseline.ts
// has to be re-measured in the same commit.
import { readFileSync, writeFileSync } from "node:fs"
import { prisma } from "../lib/db"
import { parseChecks, parseFlags } from "../lib/shared/json-schemas"
import { mailEvidence } from "../lib/shared/mail-evidence"
import { categoryForNoc } from "../lib/signals/job-category"
import { jevClientFromEnv, judgeText } from "../lib/ai/jev-judgments"
import type { Judgments } from "../lib/scoring/compose"
import { FIXTURE_PATH, type Fixture, type FixtureCase } from "../lib/eval/fixture"

type KeyEntry = { index: number; workbcId: string; title: string }

async function main() {
  const askJev = process.argv.includes("--ask-jev")
  const jev = askJev ? jevClientFromEnv() : null
  if (askJev && !jev) throw new Error("--ask-jev needs TYPESAFE_API_KEY")

  const key = JSON.parse(readFileSync("docs/labelset.key.json", "utf8")) as KeyEntry[]
  const jobs = await prisma.job.findMany({
    where: { workbcId: { in: key.map((k) => k.workbcId) } },
    include: { employer: true },
  })
  const byId = new Map(jobs.map((j) => [j.workbcId, j]))

  const cases: FixtureCase[] = []
  let asked = 0
  for (const k of key) {
    const job = byId.get(k.workbcId)
    if (!job) {
      console.warn(`[snapshot] ${k.index}. ${k.workbcId} is no longer in the database; skipped`)
      continue
    }
    let judgments = (job.judgments as Judgments | null) ?? null
    let judgmentsSource: FixtureCase["judgmentsSource"] = judgments ? "stored" : null
    if (!judgments && jev) {
      const out = await judgeText(jev, {
        title: job.title,
        employer: job.employer?.nameDisplay ?? null,
        location: job.location,
        salary: job.salary,
        description: job.descriptionMd,
      })
      judgments = out.judgments
      judgmentsSource = "jev"
      asked++
    }
    cases.push({
      index: k.index,
      workbcId: job.workbcId,
      title: job.title,
      employer: job.employer?.nameDisplay ?? null,
      checks: job.employer ? parseChecks(job.employer.checks) : {},
      flags: parseFlags(job.applicationFlags),
      category: categoryForNoc(job.nocCode),
      judgments,
      judgmentsSource,
      verifyInput: job.employer
        ? {
            employerName: job.employer.nameDisplay,
            jobTitle: job.title,
            location: job.location,
            descriptionExcerpt: job.descriptionMd.slice(0, 800),
            applicationText: mailEvidence(job.applicationFlags),
          }
        : null,
    })
  }

  const fixture: Fixture = { snapshotAt: new Date().toISOString(), cases }
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 1) + "\n")
  console.log(`[snapshot] ${cases.length}/${key.length} cases -> ${FIXTURE_PATH} (Jev asked for ${asked})`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
