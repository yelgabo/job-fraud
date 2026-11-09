// Re-classifies each stored apply host with the current ATS registry and adds the
// `ats_known_provider` flag scrape would now add. Needed after a registry change because both
// are written once at scrape time and `--skip-existing` never re-fetches a row.
// Dry run by default. Run: npm run backfill-ats -- [--apply] [--include-judged]
//
// Default scope is pending rows only: no API calls, and it publishes nothing. --include-judged also
// updates judged rows and re-scores each one it changes, from its stored Jev judgments or, when it
// has none (most rows since the 2026-10-23 column drop), with a fresh Jev call. That rewrites
// published ratings. Confirmed brand impersonations get the new flag but keep their score.
import { prisma } from "../lib/db"
import { parseFlags } from "../lib/shared/json-schemas"
import { classifyHost, isKnownAts } from "../lib/signals/ats-registry"
import { jevClientFromEnv } from "../lib/ai/jev-judgments"
import { rescoreVerdict } from "../lib/scoring/verdict"
import { writeComposedVerdict } from "../lib/scoring/write-verdict"
import { requestRevalidation } from "../lib/shared/request-revalidation"

async function main() {
  const apply = process.argv.includes("--apply")
  const includeJudged = process.argv.includes("--include-judged")
  const jobs = await prisma.job.findMany({
    where: { externalApplyHost: { not: null }, ...(includeJudged ? {} : { status: "PENDING" }) },
    include: { employer: true },
  })

  const jev = apply && includeJudged ? jevClientFromEnv() : null
  const byProvider: Record<string, { pending: number; judged: number }> = {}
  const moves: Record<string, number> = {}
  let changed = 0, rescored = 0, rescoreFailed = 0, fromStored = 0
  for (const j of jobs) {
    const provider = classifyHost(j.externalApplyHost!)
    const flags = parseFlags(j.applicationFlags)
    const needsFlag = isKnownAts(provider) && !flags.some((f) => f.flag === "ats_known_provider")
    if (provider === j.atsProvider && !needsFlag) continue
    changed++
    const t = (byProvider[provider] ??= { pending: 0, judged: 0 })
    if (j.status === "PUBLISHED") t.judged++
    else t.pending++
    const rescore = j.status === "PUBLISHED" && j.verdictKind !== "IMPERSONATION"
    if (rescore && j.judgments) fromStored++
    if (!apply) continue
    const applicationFlags = needsFlag ? [...flags, { flag: "ats_known_provider", evidence: j.externalApplyHost! }] : flags
    // The new score is computed before anything is written: when the evidence was written first
    // and the re-score then failed, the old score stayed published on inputs it never saw.
    let verdict
    if (rescore) {
      try {
        const { usage: _usage, ...data } = await rescoreVerdict(
          jev,
          { ...j, applicationFlags, employerName: j.employer?.nameDisplay ?? null },
          j.employer?.checks ?? null,
        )
        verdict = data
      } catch (e) {
        rescoreFailed++
        console.error(`  ${j.workbcId}: re-score failed, row left unchanged - ${(e as Error).message.slice(0, 120)}`)
        continue
      }
    }
    await prisma.job.update({
      where: { workbcId: j.workbcId },
      data: { atsProvider: provider, ...(needsFlag ? { applicationFlags } : {}) },
    })
    if (!verdict || !(await writeComposedVerdict(j.workbcId, verdict, "recompute"))) continue
    rescored++
    const key = `${j.riskBand ?? "?"}->${verdict.riskBand}`
    moves[key] = (moves[key] ?? 0) + 1
  }

  console.log(`[backfill-ats] ${jobs.length} rows with an apply host; ${changed} ${apply ? "updated" : "would change"}`)
  for (const [p, t] of Object.entries(byProvider)) console.log(`  ${p}: ${t.pending} pending, ${t.judged} judged`)
  if (includeJudged) {
    const judged = Object.values(byProvider).reduce((n, t) => n + t.judged, 0)
    console.log(`  judged rows to re-score: ${fromStored} from stored judgments, the rest of ${judged} (minus impersonations) with a fresh Jev call`)
  }
  if (apply && includeJudged) {
    console.log(`[backfill-ats] re-scored ${rescored} (${rescoreFailed} failed); band moves: ${JSON.stringify(moves)}`)
    if (rescored > 0) await requestRevalidation()
  }
  if (!apply && changed) console.log("Dry run. Re-run with --apply to write.")
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
