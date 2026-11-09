// Fills Job.status and Job.verdictKind from scoredAt, scoringVersion, fraudScore and the
// impersonation reasoning prefix, and Job.judgedAt from scoredAt on published rows that predate it
// (the best date left: a row recomposed before 2026-11-08 gets the recompose date). A dry run (the default) lists every row that disagrees with its
// derived values, so after --apply a second dry run reporting 0 is the consistency check.
// Run while no judge is writing: rows are read once, then updated in groups.
// Run: npm run backfill-status [-- --apply]
import type { JobStatus, VerdictKind } from "@prisma/client"
import { prisma } from "../lib/db"
import { deriveStatus } from "../lib/scoring/derive-status"

const CHUNK = 1000

async function main() {
  const apply = process.argv.includes("--apply")
  const rows = await prisma.job.findMany({
    select: { workbcId: true, scoredAt: true, judgedAt: true, scoringVersion: true, fraudScore: true, reasoning: true, status: true, verdictKind: true },
  })

  const groups = new Map<string, { status: JobStatus; verdictKind: VerdictKind | null; ids: string[] }>()
  const totals: Record<string, number> = {}
  for (const r of rows) {
    const want = deriveStatus(r)
    const key = `${want.status}/${want.verdictKind ?? "none"}`
    totals[key] = (totals[key] ?? 0) + 1
    if (r.status === want.status && r.verdictKind === want.verdictKind) continue
    const g = groups.get(key) ?? { ...want, ids: [] }
    g.ids.push(r.workbcId)
    groups.set(key, g)
  }

  // Every judge writer sets judgedAt, so a published row without one predates the column.
  const noJudgedAt = rows.filter((r) => r.scoredAt && !r.judgedAt).length
  const mismatched = [...groups.values()].reduce((n, g) => n + g.ids.length, 0) + noJudgedAt
  console.log(`[backfill-status] ${rows.length} rows; derived ${JSON.stringify(totals)}`)
  console.log(`[backfill-status] ${mismatched} disagree with their derived values${apply ? "" : " (dry run, pass --apply to write)"}`)
  for (const [key, g] of groups) console.log(`  -> ${key}: ${g.ids.length}`)
  if (noJudgedAt > 0) console.log(`  -> judgedAt from scoredAt: ${noJudgedAt}`)

  if (apply) {
    for (const g of groups.values()) {
      for (let i = 0; i < g.ids.length; i += CHUNK) {
        await prisma.job.updateMany({
          where: { workbcId: { in: g.ids.slice(i, i + CHUNK) } },
          data: { status: g.status, verdictKind: g.verdictKind },
        })
      }
    }
    await prisma.$executeRaw`UPDATE "Job" SET "judgedAt" = "scoredAt" WHERE "judgedAt" IS NULL AND "scoredAt" IS NOT NULL`
    console.log(`[backfill-status] wrote ${mismatched} rows; run again without --apply to confirm 0`)
  }
  await prisma.$disconnect()
  if (!apply && mismatched > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
