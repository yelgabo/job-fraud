// One-off: re-score jobs whose scoring failed in a prior run (riskBand = "unknown"),
// reusing the data already in the DB. No Playwright, no web verification — just the
// scoring call. Run: npm run rescore-failed
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "../lib/db"
import { loadScrapeEnv } from "../lib/env"
import { parseFlags } from "../lib/shared/json-schemas"
import { scoreJob, type ScoreInput } from "../lib/ai/scoring"
import { bandFor } from "../lib/shared/risk-band"

async function main() {
  const env = loadScrapeEnv()
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const failed = await prisma.job.findMany({
    where: { riskBand: "unknown" },
    include: { employer: true },
  })
  console.log(`[rescore] ${failed.length} jobs with riskBand="unknown"`)

  let fixed = 0
  let stillFailed = 0
  for (const job of failed) {
    const input: ScoreInput = {
      title: job.title,
      employerDisplay: job.employer?.nameDisplay ?? null,
      location: job.location,
      salary: job.salary,
      postedAt: job.postedAt,
      descriptionMd: job.descriptionMd,
      employerChecks: (job.employer?.checks as Record<string, unknown> | undefined) ?? null,
      applicationFlags: parseFlags(job.applicationFlags),
      atsProvider: job.atsProvider,
      externalApplyOk: job.externalApplyOk,
    }
    try {
      const out = await scoreJob(client, input)
      await prisma.job.update({
        where: { workbcId: job.workbcId },
        data: {
          fraudScore: out.result.fraudScore,
          riskBand: bandFor(out.result.fraudScore),
          reasoning: out.result.reasoning,
          signals: out.result.signals as never,
        },
      })
      fixed++
      console.log(`  ✓ ${job.workbcId} ${job.title} → ${bandFor(out.result.fraudScore)} ${out.result.fraudScore}`)
    } catch (err) {
      stillFailed++
      console.error(`  ✗ ${job.workbcId} still failing: ${(err as Error).message.slice(0, 120)}`)
    }
  }
  console.log(`[rescore] fixed ${fixed}, still failing ${stillFailed}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
