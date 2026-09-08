// LOCAL JUDGE, step 3 — SCORE batches. The deduped analogue of judge.ts Stage 2: dump pending
// jobs into batch files for no-web scoring agents, each job carrying its employer's checks (as
// written by local-verify-apply / earlier judge runs) plus deterministic flags and apply-tenant
// info, so the agent needs no tools beyond reading its batch file. Read-only. Verdicts are
// applied by the existing scripts/judge-apply.ts (single DB writer).
// Run: npx tsx --env-file=.env scripts/local-score-fetch.ts [--limit N] [--batch-size 50]
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { prisma } from "../lib/db"
import { parseFlags } from "../lib/shared/json-schemas"
import { tenantEmployerMatch } from "../lib/signals/apply-host"

async function main() {
  const argv = process.argv.slice(2)
  let limit: number | undefined
  let batchSize = 50
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") limit = parseInt(argv[++i] ?? "", 10) || undefined
    else if (argv[i] === "--batch-size") batchSize = parseInt(argv[++i] ?? "", 10) || 50
  }

  const jobs = await prisma.job.findMany({
    where: { scoredAt: null },
    orderBy: { scrapedAt: "asc" },
    take: limit,
    include: { employer: true },
  })

  const items = jobs.map((j) => {
    const m = tenantEmployerMatch(j.employer?.nameDisplay ?? null, j.externalApplyUrl)
    return {
      workbcId: j.workbcId,
      title: j.title,
      employer: j.employer?.nameDisplay ?? null,
      location: j.location,
      salary: j.salary,
      postedAt: j.postedAt,
      atsProvider: j.atsProvider,
      // "the posting claims employer X but applies via a different company's ATS tenant"
      applyTenantMismatch: m.result === "mismatch" ? { provider: m.provider, tenant: m.tenant } : null,
      flags: parseFlags(j.applicationFlags),
      employerChecks: (j.employer?.checks as Record<string, unknown> | undefined) ?? null,
      descriptionExcerpt: j.descriptionMd.slice(0, 1500),
    }
  })

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const dir = join("logs", `local-score-${stamp}`)
  mkdirSync(dir, { recursive: true })
  let batches = 0
  for (let i = 0; i < items.length; i += batchSize) {
    batches++
    writeFileSync(join(dir, `batch-${String(batches).padStart(3, "0")}.json`), JSON.stringify(items.slice(i, i + batchSize), null, 2), "utf8")
  }
  console.log(`[local-score:fetch] ${items.length} pending -> ${batches} batch files in ${dir}`)
  console.log(`DIR=${dir} BATCHES=${batches}`)
}

main()
  .catch((e) => {
    console.error("FATAL:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
