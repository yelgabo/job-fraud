// JUDGE (phase 2), step 2 of 2 — APPLY.
// The SINGLE DB WRITER. Reads verdict JSON files produced by the fraud-detection agents, stores
// each agent's employer verdict, then scores the posting the same way `npm run judge` does:
// Jev text judgments (when TYPESAFE_API_KEY is set) plus the composer (lib/scoring/verdict.ts).
// Agents supply evidence; no agent chooses a number. Sequential writes, no races. Each verdict
// is zod-validated; a bad one is skipped, not fatal.
// Run: npm run judge:apply -- <verdicts.json | dir> [...]
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { prisma } from "../lib/db"
import { WebVerificationSchema } from "../lib/shared/json-schemas"
import { jevClientFromEnv } from "../lib/ai/jev-judgments"
import { buildVerdict } from "../lib/scoring/verdict"
import { requestRevalidation } from "../lib/shared/request-revalidation"

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

// Anything else an agent returns (a fraudScore, signals, prose) is dropped here: the score is
// composed, never copied. Older verdict files therefore still apply, minus their numbers.
export const VerdictSchema = z.object({
  workbcId: z.string(),
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
  const jev = jevClientFromEnv()
  console.log(`[judge:apply] ${verdicts.length} verdicts (${jev ? "Jev + composer" : "composer only, no TYPESAFE_API_KEY"})`)

  let applied = 0
  let skipped = 0
  let tokens = 0
  const bands: Record<string, number> = {}
  for (const v of verdicts) {
    const parsed = VerdictSchema.safeParse(v)
    if (!parsed.success) {
      skipped++
      console.error(`  skip (invalid): ${(v as { workbcId?: string })?.workbcId ?? "?"} — ${parsed.error.issues[0]?.message}`)
      continue
    }
    const d = parsed.data
    try {
      const job = await prisma.job.findUnique({ where: { workbcId: d.workbcId }, include: { employer: true } })
      if (!job) throw new Error("no such posting")
      let checks = (job.employer?.checks as Record<string, unknown> | null) ?? {}
      if (d.web && job.employerId) {
        checks = { ...checks, web: d.web }
        await prisma.employer.update({ where: { id: job.employerId }, data: { checks: checks as never, checkedAt: new Date() } })
      }
      const { usage, ...data } = await buildVerdict(jev, { ...job, employerName: job.employer?.nameDisplay ?? null }, checks)
      tokens += usage.inputTokens
      await prisma.job.update({ where: { workbcId: d.workbcId }, data })
      applied++
      bands[data.riskBand] = (bands[data.riskBand] ?? 0) + 1
    } catch (err) {
      skipped++
      console.error(`  skip: ${d.workbcId} — ${(err as Error).message.slice(0, 100)}`)
    }
  }
  console.log(`[judge:apply] applied ${applied}, skipped ${skipped} | bands: ${JSON.stringify(bands)} | Jev input tokens ${tokens}`)
  if (applied > 0) await requestRevalidation()
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
