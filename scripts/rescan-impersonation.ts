// One-time corpus sweep: find postings whose apply URL routes to a DIFFERENT company than the
// employer they claim, web-check each distinct (employer, tenant) pair, and for confirmed brand
// impersonation re-attribute the posting to the real company + score it HIGH. Legit affiliates
// (subsidiary on a parent's ATS) are cleared; unclear cases get a review flag.
// Run: npm run rescan-impersonation [-- --dry-run]
import pLimit from "p-limit"
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "../lib/db"
import { loadScrapeEnv } from "../lib/env"
import { normalizeEmployer } from "../lib/signals/normalize-employer"
import { tenantEmployerMatch } from "../lib/signals/apply-host"
import { resolveApplyHost } from "../lib/resolve-impersonation"

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const env = loadScrapeEnv()
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const t0 = Date.now()

  const jobs = await prisma.job.findMany({
    where: { externalApplyUrl: { not: null } },
    include: { employer: true },
  })

  // Deterministic pre-filter: only postings whose tenant ≠ claimed employer.
  const candidates = jobs
    .map((j) => ({ job: j, m: tenantEmployerMatch(j.employer?.nameDisplay ?? null, j.externalApplyUrl) }))
    .filter((c) => c.m.result === "mismatch")
  console.log(`[rescan] ${jobs.length} jobs with an apply URL → ${candidates.length} tenant≠employer mismatches`)
  for (const c of candidates) {
    console.log(`  • "${c.job.employer?.nameDisplay}" applies via "${c.m.tenant}" (${c.m.provider}) — ${c.job.title}`)
  }
  if (dryRun) {
    console.log("[rescan] --dry-run: no web-checks, no writes.")
    await prisma.$disconnect()
    return
  }
  if (candidates.length === 0) {
    await prisma.$disconnect()
    return
  }

  // Group by (normalized employer, tenant) so each distinct pair is web-checked once; jobs in a
  // group run in series (later ones hit the verdict cache), groups run concurrently.
  const groups = new Map<string, typeof candidates>()
  for (const c of candidates) {
    const key = `${normalizeEmployer(c.job.employer!.nameDisplay)}|${c.m.tenant}`
    const list = groups.get(key) ?? []
    list.push(c)
    groups.set(key, list)
  }

  const tally = { impersonation: 0, cleared: 0, uncertain: 0, error: 0 }
  const limit = pLimit(3)
  await Promise.all(
    [...groups.values()].map((group) =>
      limit(async () => {
        for (const c of group) {
          try {
            const outcome = await resolveApplyHost(client, c.job, c.job.employer?.nameDisplay ?? null)
            if (outcome.kind === "impersonation") {
              tally.impersonation++
              console.log(`  🎭 IMPERSONATION: "${c.job.employer?.nameDisplay}" → re-attributed to "${outcome.realCompany}" + HIGH | ${c.job.title}`)
            } else if (outcome.kind === "cleared") {
              tally.cleared++
              console.log(`  ✓ cleared (${outcome.relationship}): "${c.job.employer?.nameDisplay}" ~ "${outcome.realCompany}" | ${c.job.title}`)
            } else if (outcome.kind === "uncertain") {
              tally.uncertain++
              console.log(`  ? uncertain: "${c.job.employer?.nameDisplay}" via "${c.m.tenant}" | ${c.job.title}`)
            }
          } catch (e) {
            tally.error++
            console.log(`  ✗ error on ${c.job.title}: ${(e as Error).message.slice(0, 100)}`)
          }
        }
      }),
    ),
  )

  console.log(`\n=== RESCAN SUMMARY (${((Date.now() - t0) / 1000).toFixed(0)}s) ===`)
  console.log(`mismatches checked: ${candidates.length} across ${groups.size} distinct pairs`)
  console.log(`impersonation (re-attributed + HIGH): ${tally.impersonation}`)
  console.log(`cleared (same/affiliate): ${tally.cleared} | uncertain (flagged): ${tally.uncertain} | errors: ${tally.error}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
