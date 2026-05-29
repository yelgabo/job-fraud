// One-off backfill: re-run web verification (now classifying the application mailing-address
// type) for employers whose postings tell applicants to MAIL materials somewhere, then re-score
// those jobs so the new applicationAddressType signal flows into the fraud score.
// Run: npm run reverify-mail
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "../lib/db"
import { loadScrapeEnv } from "../lib/env"
import { parseFlags } from "../lib/json-schemas"
import { verifyEmployerWeb } from "../lib/verify-employer-web"
import { scoreJob, type ScoreInput } from "../lib/scoring"
import { bandFor } from "../lib/risk-band"

async function main() {
  const env = loadScrapeEnv()
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const jobs = await prisma.job.findMany({ include: { employer: true } })
  const mailJobs = jobs.filter((j) =>
    parseFlags(j.applicationFlags).some((f) => f.flag === "mail_physical_resume"),
  )
  // group by employer (skip hidden employers — can't web-verify without a name)
  const byEmployer = new Map<string, typeof mailJobs>()
  for (const j of mailJobs) {
    if (!j.employerId) continue
    const list = byEmployer.get(j.employerId) ?? []
    list.push(j)
    byEmployer.set(j.employerId, list)
  }
  console.log(`[reverify-mail] ${mailJobs.length} mail jobs across ${byEmployer.size} named employers`)

  for (const [employerId, group] of byEmployer) {
    const rep = group[0]
    const mailEvidence =
      parseFlags(rep.applicationFlags).find((f) => f.flag === "mail_physical_resume")?.evidence ?? ""
    try {
      const out = await verifyEmployerWeb(client, {
        employerName: rep.employer!.nameDisplay,
        jobTitle: rep.title,
        location: rep.location,
        descriptionExcerpt: rep.descriptionMd.slice(0, 800),
        applicationText: mailEvidence,
      })
      const checks = { ...((rep.employer!.checks as Record<string, unknown>) ?? {}), web: out.result }
      await prisma.employer.update({ where: { id: employerId }, data: { checks: checks as never } })
      console.log(
        `\n${rep.employer!.nameDisplay}: applicationAddressType=${out.result.applicationAddressType} | ${out.result.summary.slice(0, 120)}`,
      )
      // re-score every job for this employer
      for (const job of group) {
        const input: ScoreInput = {
          title: job.title,
          employerDisplay: rep.employer!.nameDisplay,
          location: job.location,
          salary: job.salary,
          postedAt: job.postedAt,
          descriptionMd: job.descriptionMd,
          employerChecks: checks,
          applicationFlags: parseFlags(job.applicationFlags),
          atsProvider: job.atsProvider,
          externalApplyOk: job.externalApplyOk,
        }
        const s = await scoreJob(client, input)
        await prisma.job.update({
          where: { workbcId: job.workbcId },
          data: {
            fraudScore: s.result.fraudScore,
            riskBand: bandFor(s.result.fraudScore),
            reasoning: s.result.reasoning,
            signals: s.result.signals as never,
          },
        })
        console.log(`   ${job.workbcId} ${job.title} → ${bandFor(s.result.fraudScore)} ${s.result.fraudScore}`)
      }
    } catch (err) {
      console.error(`  ✗ ${rep.employer!.nameDisplay}: ${(err as Error).message.slice(0, 120)}`)
    }
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
