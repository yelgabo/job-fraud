// LOCAL JUDGE (agent-orchestrated, no API credits), step 1 — employer VERIFY batches.
// The deduped analogue of judge.ts Stage 1 for when the Anthropic API is unavailable: dump each
// DISTINCT pending-job employer that still lacks checks.web into batch files, one per web-search
// agent. Read-only. Only employers where the risk actually lives are batched: at least one posting
// with a fraud-prone flag, a non-ATS apply path, or an apply-tenant mismatch. Quiet remainder
// (all postings via a known ATS, zero flags) is skipped — their jobs score text-only, checks null
// = neutral. Pair with local-verify-apply.ts (the single DB writer for these verdicts).
// Run: npx tsx --env-file=.env scripts/local-verify-fetch.ts [--batch-size 15] [--all]
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { prisma } from "../lib/db"
import { parseFlags, type WebVerification } from "../lib/shared/json-schemas"
import { tenantEmployerMatch } from "../lib/signals/apply-host"

const RISK_FLAGS = new Set([
  "generic_email_domain",
  "mail_physical_resume",
  "whatsapp_telegram_only",
  "fee_to_apply",
  "id_upfront",
  "crypto_payment",
  "banking_info_upfront",
])

async function main() {
  const argv = process.argv.slice(2)
  let batchSize = 15
  let all = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--batch-size") batchSize = parseInt(argv[++i] ?? "", 10) || 15
    else if (argv[i] === "--all") all = true // include the quiet ATS-only employers too
  }

  const jobs = await prisma.job.findMany({ where: { scoredAt: null }, include: { employer: true } })
  const byEmp = new Map<string, typeof jobs>()
  for (const j of jobs) {
    if (!j.employerId) continue
    const l = byEmp.get(j.employerId) ?? []
    l.push(j)
    byEmp.set(j.employerId, l)
  }

  type Item = {
    employerId: string
    employerName: string
    postings: number
    // representative posting context (the one with the most flags — richest evidence)
    jobTitle: string
    location: string | null
    descriptionExcerpt: string
    applicationFlags: Array<{ flag: string; evidence: string }>
    // apply-tenant mismatches to investigate (posting claims employer X, applies via tenant Y)
    tenantMismatches: Array<{ provider: string; tenant: string; applyUrl: string }>
  }
  const items: Item[] = []
  let skippedQuiet = 0
  let haveWeb = 0
  for (const [employerId, list] of byEmp) {
    const web = (list[0].employer?.checks as { web?: WebVerification } | undefined)?.web
    if (web) {
      haveWeb++
      continue
    }
    const mismatches = new Map<string, { provider: string; tenant: string; applyUrl: string }>()
    for (const j of list) {
      const m = tenantEmployerMatch(j.employer?.nameDisplay ?? null, j.externalApplyUrl)
      if (m.result === "mismatch" && m.tenant) mismatches.set(m.tenant, { provider: m.provider ?? "?", tenant: m.tenant, applyUrl: j.externalApplyUrl! })
    }
    const risky = list.some((j) => parseFlags(j.applicationFlags).some((f) => RISK_FLAGS.has(f.flag)) || !j.atsProvider) || mismatches.size > 0
    if (!risky && !all) {
      skippedQuiet++
      continue
    }
    const rep = [...list].sort((a, b) => parseFlags(b.applicationFlags).length - parseFlags(a.applicationFlags).length)[0]
    items.push({
      employerId,
      employerName: rep.employer!.nameDisplay,
      postings: list.length,
      jobTitle: rep.title,
      location: rep.location,
      descriptionExcerpt: rep.descriptionMd.slice(0, 900),
      applicationFlags: parseFlags(rep.applicationFlags),
      tenantMismatches: [...mismatches.values()],
    })
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const dir = join("logs", `local-verify-${stamp}`)
  mkdirSync(dir, { recursive: true })
  let batches = 0
  for (let i = 0; i < items.length; i += batchSize) {
    batches++
    writeFileSync(join(dir, `batch-${String(batches).padStart(3, "0")}.json`), JSON.stringify(items.slice(i, i + batchSize), null, 2), "utf8")
  }
  console.log(
    `[local-verify:fetch] ${items.length} employers to verify -> ${batches} batch files in ${dir} | already verified ${haveWeb} | skipped quiet ${skippedQuiet}`,
  )
  console.log(`DIR=${dir} BATCHES=${batches}`)
}

main()
  .catch((e) => {
    console.error("FATAL:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
