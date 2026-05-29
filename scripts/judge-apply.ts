// JUDGE (phase 2), step 2 of 2 — APPLY.
// The SINGLE DB WRITER. Reads a verdicts JSON file produced from the fraud-detection agents and
// updates jobs + employers sequentially (no concurrent writers -> no races/deadlocks). Each
// verdict is zod-validated; a bad one is skipped, not fatal.
// Run: npm run judge:apply -- <verdicts.json>
import { readFileSync } from "node:fs"
import { z } from "zod"
import { prisma } from "../lib/db"
import { SignalsSchema, WebVerificationSchema } from "../lib/json-schemas"
import { bandFor } from "../lib/risk-band"

const VerdictSchema = z.object({
  workbcId: z.string(),
  fraudScore: z.number().int().min(0).max(100),
  reasoning: z.string().min(1),
  signals: SignalsSchema,
  web: WebVerificationSchema.optional(),
})

async function main() {
  const path = process.argv[2]
  if (!path) {
    console.error("usage: npm run judge:apply -- <verdicts.json>")
    process.exit(1)
  }
  const raw = JSON.parse(readFileSync(path, "utf8"))
  const verdicts: unknown[] = Array.isArray(raw) ? raw : [raw]
  console.log(`[judge:apply] ${verdicts.length} verdicts from ${path}`)

  let applied = 0
  let skipped = 0
  const bands: Record<string, number> = {}
  for (const v of verdicts) {
    const parsed = VerdictSchema.safeParse(v)
    if (!parsed.success) {
      skipped++
      console.error(`  skip (invalid): ${(v as { workbcId?: string })?.workbcId ?? "?"} — ${parsed.error.issues[0]?.message}`)
      continue
    }
    const d = parsed.data
    const band = bandFor(d.fraudScore)
    try {
      const updated = await prisma.job.update({
        where: { workbcId: d.workbcId },
        data: { fraudScore: d.fraudScore, riskBand: band, reasoning: d.reasoning, signals: d.signals as never, scoredAt: new Date() },
      })
      if (d.web && updated.employerId) {
        const emp = await prisma.employer.findUnique({ where: { id: updated.employerId } })
        const checks = { ...((emp?.checks as Record<string, unknown>) ?? {}), web: d.web }
        await prisma.employer.update({ where: { id: updated.employerId }, data: { checks: checks as never, checkedAt: new Date() } })
      }
      applied++
      bands[band] = (bands[band] ?? 0) + 1
    } catch (err) {
      skipped++
      console.error(`  skip (db): ${d.workbcId} — ${(err as Error).message.slice(0, 100)}`)
    }
  }
  console.log(`[judge:apply] applied ${applied}, skipped ${skipped} | bands: ${JSON.stringify(bands)}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
