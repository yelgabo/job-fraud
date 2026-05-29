// JUDGE (phase 2), step 2 of 2 — APPLY.
// The SINGLE DB WRITER. Reads a verdicts JSON file produced from the fraud-detection agents and
// updates jobs + employers sequentially (no concurrent writers -> no races/deadlocks). Each
// verdict is zod-validated; a bad one is skipped, not fatal.
// Run: npm run judge:apply -- <verdicts.json>
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { prisma } from "../lib/db"
import { SignalsSchema, WebVerificationSchema } from "../lib/json-schemas"
import { bandFor } from "../lib/risk-band"

/** Expand args into verdict-file paths: a dir contributes its verdicts*.json files. */
function resolveFiles(args: string[]): string[] {
  const files: string[] = []
  for (const a of args) {
    if (statSync(a).isDirectory()) {
      for (const f of readdirSync(a)) if (/verdicts.*\.json$/i.test(f)) files.push(join(a, f))
    } else {
      files.push(a)
    }
  }
  return files
}

const VerdictSchema = z.object({
  workbcId: z.string(),
  fraudScore: z.number().int().min(0).max(100),
  reasoning: z.string().min(1),
  signals: SignalsSchema,
  web: WebVerificationSchema.optional(),
})

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error("usage: npm run judge:apply -- <verdicts.json | dir> [...]")
    process.exit(1)
  }
  const verdicts: unknown[] = []
  for (const f of resolveFiles(args)) {
    const raw = JSON.parse(readFileSync(f, "utf8"))
    if (Array.isArray(raw)) verdicts.push(...raw)
    else verdicts.push(raw)
  }
  console.log(`[judge:apply] ${verdicts.length} verdicts`)

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
