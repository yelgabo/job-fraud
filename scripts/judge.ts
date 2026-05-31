// JUDGE (deduped, single-process) — the efficient evaluator for large corpora.
// Stage 1: verify each DISTINCT pending employer ONCE (Claude web_search) -> employer.checks.web.
// Stage 2: score each pending job (cheap Claude call, no web) reusing the employer verdict + the
// posting's own flags/NOC/apply fields. One process = one DB writer (no races). Reuses
// verifyEmployerWeb + scoreJob. Run: npm run judge -- [--limit N] [--rejudge]
//   [--emp-concurrency 4] [--score-concurrency 8]
import pLimit from "p-limit"
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "../lib/db"
import { loadScrapeEnv } from "../lib/env"
import { parseFlags, type WebVerification } from "../lib/shared/json-schemas"
import { allApplyHostsMatch, matchedProvider } from "../lib/signals/apply-host"
import { verifyEmployerWeb } from "../lib/ai/verify-employer-web"
import { scoreJob, makeFailedResult, type ScoreInput } from "../lib/ai/scoring"
import { resolveApplyHost } from "../lib/ai/resolve-impersonation"
import { isBillingError } from "../lib/shared/anthropic-errors"
import { bandFor } from "../lib/shared/risk-band"

type Args = { limit: number | null; rejudge: boolean; empConcurrency: number; scoreConcurrency: number }
function parseArgs(): Args {
  const a: Args = { limit: null, rejudge: false, empConcurrency: 4, scoreConcurrency: 8 }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === "--limit") a.limit = parseInt(argv[++i] ?? "0", 10) || null
    else if (t === "--rejudge") a.rejudge = true
    else if (t === "--emp-concurrency") a.empConcurrency = Math.max(1, parseInt(argv[++i] ?? "4", 10) || 4)
    else if (t === "--score-concurrency") a.scoreConcurrency = Math.max(1, parseInt(argv[++i] ?? "8", 10) || 8)
  }
  return a
}

const mailEvidence = (flagsJson: unknown) =>
  parseFlags(flagsJson).find((f) => f.flag === "mail_physical_resume")?.evidence ?? ""

async function main() {
  const args = parseArgs()
  const env = loadScrapeEnv()
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const t0 = Date.now()

  const jobs = await prisma.job.findMany({
    where: args.rejudge ? {} : { scoredAt: null },
    take: args.limit ?? undefined,
    include: { employer: true },
  })
  console.log(`[judge] ${jobs.length} jobs to evaluate`)
  if (jobs.length === 0) {
    await prisma.$disconnect()
    return
  }

  // --- Stage 1: verify each distinct employer once ---
  const byEmployer = new Map<string, typeof jobs>()
  for (const j of jobs) {
    if (!j.employerId) continue
    const list = byEmployer.get(j.employerId) ?? []
    list.push(j)
    byEmployer.set(j.employerId, list)
  }
  // employerId -> checks object (used by scoring). Seed with existing checks.
  const empChecks = new Map<string, Record<string, unknown>>()
  for (const [id, list] of byEmployer) empChecks.set(id, (list[0].employer?.checks as Record<string, unknown>) ?? {})

  // --- Tiered verification ---
  // An employer whose pending postings ALL apply via its OWN matching ATS tenant is self-evidently a
  // real company (it applies through its own hiring system) — presume legit with a deterministic
  // verdict and skip the (expensive) web search. Everyone else (email/mail/phone/no-ATS, or a
  // tenant≠employer mismatch) gets web-verified, since that's where the risk lives. A cached
  // "ats-tenant-match" verdict is upgraded to a real web-verify if a NEW non-matching posting appears.
  type Decision = { id: string; list: typeof jobs; action: "web" | "presume" | "reuse" }
  const decisions: Decision[] = [...byEmployer.entries()].map(([id, list]) => {
    const employerName = list[0].employer?.nameDisplay ?? null
    const allMatch = allApplyHostsMatch(employerName, list.map((j) => j.externalApplyUrl))
    const web = (list[0].employer?.checks as { web?: WebVerification } | undefined)?.web
    let action: Decision["action"]
    if (args.rejudge) action = "web"
    else if (web) action = web.source === "ats-tenant-match" && !allMatch ? "web" : "reuse"
    else action = allMatch ? "presume" : "web"
    return { id, list, action }
  })
  const toWebVerify = decisions.filter((d) => d.action === "web")
  const toPresume = decisions.filter((d) => d.action === "presume")
  console.log(
    `[judge] employers: ${byEmployer.size} distinct | web-verify ${toWebVerify.length} | presume-legit (ATS match) ${toPresume.length} | reuse cached ${decisions.length - toWebVerify.length - toPresume.length}`,
  )

  // Presumed-legit employers: deterministic verdict, no API call, no audit-log row.
  for (const d of toPresume) {
    const employerName = d.list[0].employer?.nameDisplay ?? null
    const provider = matchedProvider(employerName, d.list.map((j) => j.externalApplyUrl)) ?? "ATS"
    const verdict: WebVerification = {
      websiteUrl: null,
      websiteReachable: "unknown",
      businessMatch: "match",
      locationMatch: "uncertain",
      hasJobsListing: "unknown",
      applicationAddressType: "none",
      confidence: 0.8,
      summary: `Presumed legitimate without web search: all postings apply via the company's own matching ${provider} tenant.`,
      source: "ats-tenant-match",
    }
    const checks = { ...((d.list[0].employer?.checks as Record<string, unknown>) ?? {}), web: verdict }
    await prisma.employer.update({ where: { id: d.id }, data: { checks: checks as never, checkedAt: new Date() } })
    empChecks.set(d.id, checks)
  }

  // Tripped by an out-of-credit billing error (a 400, not a retryable 429). Once set, queued tasks
  // no-op and the run aborts after the stage — so we never mass-write "unknown" on an empty wallet.
  let billingAbort = false
  const ABORT_MSG =
    "Anthropic API credit exhausted (billing error). Jobs scored so far are saved; the rest remain pending. Top up at console.anthropic.com → Billing, then re-run `npm run judge`."

  let vDone = 0
  let vFail = 0
  let webIn = 0
  let webOut = 0
  const vLimit = pLimit(args.empConcurrency)
  await Promise.all(
    toWebVerify.map((d) =>
      vLimit(async () => {
        if (billingAbort) return
        const rep = d.list[0]
        try {
          const out = await verifyEmployerWeb(client, {
            employerName: rep.employer!.nameDisplay,
            jobTitle: rep.title,
            location: rep.location,
            descriptionExcerpt: rep.descriptionMd.slice(0, 800),
            applicationText: mailEvidence(rep.applicationFlags),
          })
          webIn += out.usage.inputTokens
          webOut += out.usage.outputTokens
          const checks = { ...((rep.employer!.checks as Record<string, unknown>) ?? {}), web: out.result }
          await prisma.employer.update({ where: { id: d.id }, data: { checks: checks as never, checkedAt: new Date() } })
          // Append the raw web_search audit trail (separate table; not read by prod pages).
          await prisma.employerWebSearchLog.create({
            data: { employerId: d.id, queries: out.searchLog.queries as never, blocks: out.searchLog.blocks as never },
          })
          empChecks.set(d.id, checks)
        } catch (e) {
          if (isBillingError(e)) { billingAbort = true; return }
          vFail++
        }
        if (++vDone % 50 === 0) console.log(`[verify] ${vDone}/${toWebVerify.length} employers`)
      }),
    ),
  )
  if (billingAbort) throw new Error(ABORT_MSG)
  console.log(`[judge] employer verify done: ${toWebVerify.length - vFail} ok, ${vFail} failed | ${toPresume.length} presumed legit (no web search)`)

  // --- Stage 2: score each job (no web; reuses employer verdict + job fields) ---
  let sDone = 0
  let sFail = 0
  let impostors = 0
  let totalIn = 0
  let totalOut = 0
  const bands: Record<string, number> = {}
  const sLimit = pLimit(args.scoreConcurrency)
  await Promise.all(
    jobs.map((job) =>
      sLimit(async () => {
        if (billingAbort) return
        // Brand-impersonation pre-check: if the apply URL routes to a different company than the
        // claimed employer and a web-check confirms it, this re-attributes the posting + writes a
        // HIGH score itself — so skip normal scoring for that job.
        try {
          const outcome = await resolveApplyHost(client, job, job.employer?.nameDisplay ?? null)
          if (outcome.kind === "impersonation") {
            impostors++
            bands["high"] = (bands["high"] ?? 0) + 1
            if (++sDone % 200 === 0) console.log(`[score] ${sDone}/${jobs.length}`)
            return
          }
        } catch (e) {
          if (isBillingError(e)) { billingAbort = true; return }
          // other web-check failure — fall through to normal scoring
        }
        const input: ScoreInput = {
          title: job.title,
          employerDisplay: job.employer?.nameDisplay ?? null,
          location: job.location,
          salary: job.salary,
          postedAt: job.postedAt,
          descriptionMd: job.descriptionMd,
          employerChecks: job.employerId ? empChecks.get(job.employerId) ?? null : null,
          applicationFlags: parseFlags(job.applicationFlags),
          atsProvider: job.atsProvider,
          externalApplyOk: job.externalApplyOk,
        }
        let result
        try {
          const out = await scoreJob(client, input)
          totalIn += out.usage.inputTokens
          totalOut += out.usage.outputTokens
          result = out.result
        } catch (err) {
          if (isBillingError(err)) { billingAbort = true; return } // leave pending, don't mark unknown
          sFail++
          result = makeFailedResult((err as Error).message)
        }
        const band = bandFor(result.fraudScore)
        bands[band] = (bands[band] ?? 0) + 1
        await prisma.job.update({
          where: { workbcId: job.workbcId },
          data: { fraudScore: result.fraudScore, riskBand: band, reasoning: result.reasoning, signals: result.signals as never, scoredAt: new Date() },
        })
        if (++sDone % 200 === 0) console.log(`[score] ${sDone}/${jobs.length} jobs`)
      }),
    ),
  )
  if (billingAbort) throw new Error(ABORT_MSG)

  console.log(`\n=== JUDGE SUMMARY ===`)
  console.log(`Wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`Employers: web-verified ${toWebVerify.length - vFail}/${toWebVerify.length} (${vFail} failed), presumed-legit ${toPresume.length} | jobs scored: ${jobs.length - sFail} (${sFail} failed) | brand-impersonation re-attributed: ${impostors}`)
  console.log(`Bands: ${JSON.stringify(bands)}`)
  console.log(`Web-verify tokens: in=${webIn} out=${webOut} | scoring tokens: in=${totalIn} out=${totalOut}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
