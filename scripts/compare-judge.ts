// READ-ONLY A/B: compare the deduped judge (verify employer once + scoreJob) against the
// already-stored agent (per-job) verdicts, for a few companies. Writes NOTHING to the DB.
// Run: npm run compare-judge
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "../lib/db"
import { loadScrapeEnv } from "../lib/env"
import { parseFlags } from "../lib/shared/json-schemas"
import { verifyEmployerWeb } from "../lib/verify-employer-web"
import { scoreJob, type ScoreInput } from "../lib/scoring"
import { bandFor } from "../lib/shared/risk-band"

const TARGETS = ["Microsoft", "Accenture", "Tajpur", "XEN AI", "Remitly", "Moment Energy"]

async function main() {
  const env = loadScrapeEnv()
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  for (const name of TARGETS) {
    const emp = await prisma.employer.findFirst({
      where: { nameDisplay: { contains: name }, jobs: { some: { scoredAt: { not: null } } } },
      include: { jobs: { where: { scoredAt: { not: null } }, take: 2 } },
    })
    if (!emp || emp.jobs.length === 0) {
      console.log(`\n### ${name}: no agent-judged job found`)
      continue
    }
    const rep = emp.jobs[0]
    // Stage 1 (fresh): verify the employer once
    let web
    try {
      const v = await verifyEmployerWeb(client, {
        employerName: emp.nameDisplay,
        jobTitle: rep.title,
        location: rep.location,
        descriptionExcerpt: rep.descriptionMd.slice(0, 800),
        applicationText: parseFlags(rep.applicationFlags).find((f) => f.flag === "mail_physical_resume")?.evidence ?? "",
      })
      web = v.result
    } catch (e) {
      console.log(`\n### ${emp.nameDisplay}: verify failed (${(e as Error).message.slice(0, 60)})`)
      continue
    }
    console.log(`\n### ${emp.nameDisplay} — dedup web: businessMatch=${web.businessMatch}, appAddr=${web.applicationAddressType}`)
    for (const job of emp.jobs) {
      const input: ScoreInput = {
        title: job.title,
        employerDisplay: emp.nameDisplay,
        location: job.location,
        salary: job.salary,
        postedAt: job.postedAt,
        descriptionMd: job.descriptionMd,
        employerChecks: { ...((emp.checks as Record<string, unknown>) ?? {}), web },
        applicationFlags: parseFlags(job.applicationFlags),
        atsProvider: job.atsProvider,
        externalApplyOk: job.externalApplyOk,
      }
      let dedup = "ERR"
      try {
        const out = await scoreJob(client, input)
        dedup = `${bandFor(out.result.fraudScore)} ${out.result.fraudScore}`
      } catch {
        /* keep ERR */
      }
      console.log(`   "${job.title}" — AGENT: ${job.riskBand} ${job.fraudScore}  |  DEDUP: ${dedup}`)
    }
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
