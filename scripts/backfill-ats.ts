// Re-classifies each stored apply host with the current ATS registry and adds the
// `ats_known_provider` flag scrape would now add. Needed after a registry change because both
// are written once at scrape time and `--skip-existing` never re-fetches a row.
// No API calls. Dry run by default. Run: npm run backfill-ats -- [--apply] [--include-judged]
//
// Default scope is pending rows only, which publishes nothing. --include-judged also updates
// judged rows; their published score does not move until `npm run recompose -- --apply`.
import { prisma } from "../lib/db"
import { parseFlags } from "../lib/shared/json-schemas"
import { classifyHost, isKnownAts } from "../lib/signals/ats-registry"

async function main() {
  const apply = process.argv.includes("--apply")
  const includeJudged = process.argv.includes("--include-judged")
  const jobs = await prisma.job.findMany({
    where: { externalApplyHost: { not: null }, ...(includeJudged ? {} : { scoredAt: null }) },
    select: { workbcId: true, externalApplyHost: true, atsProvider: true, applicationFlags: true, scoredAt: true },
  })

  const byProvider: Record<string, { pending: number; judged: number }> = {}
  let changed = 0
  for (const j of jobs) {
    const provider = classifyHost(j.externalApplyHost!)
    const flags = parseFlags(j.applicationFlags)
    const needsFlag = isKnownAts(provider) && !flags.some((f) => f.flag === "ats_known_provider")
    if (provider === j.atsProvider && !needsFlag) continue
    changed++
    const t = (byProvider[provider] ??= { pending: 0, judged: 0 })
    if (j.scoredAt) t.judged++
    else t.pending++
    if (!apply) continue
    await prisma.job.update({
      where: { workbcId: j.workbcId },
      data: {
        atsProvider: provider,
        ...(needsFlag ? { applicationFlags: [...flags, { flag: "ats_known_provider", evidence: j.externalApplyHost! }] } : {}),
      },
    })
  }

  console.log(`[backfill-ats] ${jobs.length} rows with an apply host; ${changed} ${apply ? "updated" : "would change"}`)
  for (const [p, t] of Object.entries(byProvider)) console.log(`  ${p}: ${t.pending} pending, ${t.judged} judged`)
  if (!apply && changed) console.log("Dry run. Re-run with --apply to write.")
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
