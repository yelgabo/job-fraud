// Re-score jobs whose scoring failed in a prior run (riskBand = "unknown"), reusing the employer
// verdict already in the DB. No web verification: Jev text judgments (when TYPESAFE_API_KEY is
// set) plus the composer. No ANTHROPIC_API_KEY needed. Run: npm run rescore-failed
import { prisma } from "../lib/db"
import { jevClientFromEnv } from "../lib/ai/jev-judgments"
import { buildVerdict } from "../lib/scoring/verdict"
import { requestRevalidation } from "../lib/shared/request-revalidation"

async function main() {
  const jev = jevClientFromEnv()
  const failed = await prisma.job.findMany({ where: { riskBand: "unknown" }, include: { employer: true } })
  console.log(`[rescore] ${failed.length} jobs with riskBand="unknown" (${jev ? "Jev + composer" : "composer only"})`)

  let fixed = 0
  let stillFailed = 0
  for (const job of failed) {
    try {
      const { usage: _usage, ...data } = await buildVerdict(jev, { ...job, employerName: job.employer?.nameDisplay ?? null }, job.employer?.checks ?? null)
      await prisma.job.update({ where: { workbcId: job.workbcId }, data })
      fixed++
      console.log(`  ✓ ${job.workbcId} ${job.title} → ${data.riskBand} ${data.fraudScore}`)
    } catch (err) {
      stillFailed++
      console.error(`  ✗ ${job.workbcId} still failing: ${(err as Error).message.slice(0, 120)}`)
    }
  }
  console.log(`[rescore] fixed ${fixed}, still failing ${stillFailed}`)
  if (fixed > 0) await requestRevalidation()
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
