// LOCAL JUDGE, step 2 — apply employer web verdicts. The SINGLE DB WRITER for verification.
// Reads web-verdicts*.json files produced by the web-search agents (each an array of
// { employerId, web: <WebVerificationSchema> }), zod-validates each, and writes
// employer.checks.web + checkedAt sequentially. A bad verdict is skipped, not fatal.
// Run: npx tsx --env-file=.env scripts/local-verify-apply.ts <dir | file> [...]
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { prisma } from "../lib/db"
import { WebVerificationSchema } from "../lib/shared/json-schemas"

const EmployerVerdictSchema = z.object({
  employerId: z.string().min(1),
  web: WebVerificationSchema,
})

function resolveFiles(args: string[]): string[] {
  const files: string[] = []
  for (const a of args) {
    if (statSync(a).isDirectory()) {
      for (const f of readdirSync(a)) if (/web-verdicts.*\.json$/i.test(f)) files.push(join(a, f))
    } else {
      files.push(a)
    }
  }
  return files
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error("usage: npx tsx --env-file=.env scripts/local-verify-apply.ts <dir | web-verdicts.json> [...]")
    process.exit(1)
  }
  const verdicts: unknown[] = []
  for (const f of resolveFiles(args)) {
    const raw = JSON.parse(readFileSync(f, "utf8"))
    if (Array.isArray(raw)) verdicts.push(...raw)
    else verdicts.push(raw)
  }
  console.log(`[local-verify:apply] ${verdicts.length} employer verdicts`)

  let applied = 0
  let skipped = 0
  for (const v of verdicts) {
    const parsed = EmployerVerdictSchema.safeParse(v)
    if (!parsed.success) {
      skipped++
      console.error(`  skip (invalid): ${(v as { employerId?: string })?.employerId ?? "?"} — ${parsed.error.issues[0]?.message}`)
      continue
    }
    const d = parsed.data
    try {
      const emp = await prisma.employer.findUnique({ where: { id: d.employerId } })
      if (!emp) {
        skipped++
        console.error(`  skip (no such employer): ${d.employerId}`)
        continue
      }
      const checks = { ...((emp.checks as Record<string, unknown>) ?? {}), web: { ...d.web, source: "web" } }
      await prisma.employer.update({ where: { id: d.employerId }, data: { checks: checks as never, checkedAt: new Date() } })
      applied++
    } catch (err) {
      skipped++
      console.error(`  skip (db): ${d.employerId} — ${(err as Error).message.slice(0, 100)}`)
    }
  }
  console.log(`[local-verify:apply] applied ${applied}, skipped ${skipped}`)
}

main()
  .catch((e) => {
    console.error("FATAL:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
