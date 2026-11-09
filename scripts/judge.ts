// JUDGE (deduped, single-process) — the efficient evaluator for large corpora.
// Stage 1: verify each DISTINCT pending employer ONCE (Claude web_search) -> employer.checks.web.
// Stage 2: judge each pending job's text with Jev (when TYPESAFE_API_KEY is set) and compose the
// score in code from the employer verdict + the posting's own flags/NOC (lib/scoring/verdict.ts).
// One process = one DB writer (no races). Run: npm run judge -- [--limit N] [--rejudge]
//   [--emp-concurrency 4] [--score-concurrency 8]
import pLimit from "p-limit"
import Anthropic from "@anthropic-ai/sdk"
import type { Prisma } from "@prisma/client"
import { prisma } from "../lib/db"
import { loadScrapeEnv } from "../lib/env"
import { parseFlags, type WebVerification } from "../lib/shared/json-schemas"
import { addressKey, addressUnchecked, mailEvidence, pickRepresentative } from "../lib/shared/mail-evidence"
import { presumedVerdict, verificationAction } from "../lib/signals/verification-plan"
import { verifyEmployerTiered } from "../lib/ai/verify-employer-web"
import { TIERED_VERIFIER } from "../lib/ai/verifier-models"
import { keepImpersonationVerdict, resolveApplyHost } from "../lib/ai/resolve-impersonation"
import { jevClientFromEnv } from "../lib/ai/jev-judgments"
import { buildVerdict } from "../lib/scoring/verdict"
import { writeComposedVerdict } from "../lib/scoring/write-verdict"
import { isAuthError, isFatalApiError } from "../lib/shared/anthropic-errors"
import { finishJudgeRun, startJudgeRun } from "../lib/shared/judge-run"
import { settleRequests } from "../lib/shared/judge-requests"
import { storeEmployerWeb } from "../lib/shared/employer-verdict"
import { requestRevalidation } from "../lib/shared/request-revalidation"

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


async function main() {
  const args = parseArgs()
  const env = loadScrapeEnv()
  // maxRetries 5 (SDK default 2): long runs must ride out 429/529 bursts with the SDK's own
  // exponential backoff; concurrency caps below are the primary rate limiter.
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 5 })
  const jev = jevClientFromEnv()
  console.log(jev ? "[judge] stage 2: Jev text judgments + composer" : "[judge] stage 2: composer only (no TYPESAFE_API_KEY, route judged by flags)")
  const t0 = Date.now()
  const run = await startJudgeRun("API")

  const jobs = await prisma.job.findMany({
    where: args.rejudge ? {} : { status: "PENDING" },
    // Oldest first, as the keyless fetch does: without an order, --limit took whatever Postgres
    // returned first, so the same postings could be passed over run after run.
    orderBy: { scrapedAt: "asc" },
    take: args.limit ?? undefined,
    include: { employer: true },
  })
  console.log(`[judge] ${jobs.length} jobs to evaluate`)
  if (jobs.length === 0) {
    await settleRequests("[judge]")
    await finishJudgeRun(run.id, { pendingAtStart: run.pendingAtStart, scored: 0, held: 0, failed: 0 })
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
    const web = (list[0].employer?.checks as { web?: WebVerification } | undefined)?.web
    const action = verificationAction(list[0].employer?.nameDisplay ?? null, list, web, { rejudge: args.rejudge })
    return { id, list, action }
  })
  const toWebVerify = decisions.filter((d) => d.action === "web")
  const toPresume = decisions.filter((d) => d.action === "presume")
  console.log(
    `[judge] employers: ${byEmployer.size} distinct | web-verify ${toWebVerify.length} | presume-legit (ATS match) ${toPresume.length} | reuse cached ${decisions.length - toWebVerify.length - toPresume.length}`,
  )

  // Presumed-legit employers: deterministic verdict, no API call, no audit-log row.
  for (const d of toPresume) {
    const verdict = presumedVerdict(d.list[0].employer?.nameDisplay ?? null, d.list)
    const { checks } = await storeEmployerWeb(d.list[0].employer!, verdict)
    empChecks.set(d.id, checks)
  }

  // Tripped by an out-of-credit billing error (a 400, not a retryable 429) or a bad key (401/403).
  // Once set, queued tasks no-op and the run aborts after the stage, leaving the rest pending.
  let billingAbort = false
  let abortCause = ""
  const tripAbort = (e: unknown) => {
    billingAbort = true
    abortCause ||= isAuthError(e)
      ? "Anthropic API key rejected (401/403). Jobs scored so far are saved; the rest remain pending. Fix ANTHROPIC_API_KEY, then re-run `npm run judge`."
      : "Anthropic API credit exhausted (billing error). Jobs scored so far are saved; the rest remain pending. Top up at console.anthropic.com → Billing, then re-run `npm run judge`."
  }
  const abortRun = async (counts: { scored: number; held: number; failed: number }) => {
    await finishJudgeRun(run.id, { pendingAtStart: run.pendingAtStart, ...counts }, { note: abortCause })
    throw new Error(abortCause)
  }

  let vDone = 0
  let vFail = 0
  const failedEmployers = new Set<string>()
  let webIn = 0
  let webOut = 0
  let webSearches = 0
  let webCost = 0
  let escalated = 0
  const vLimit = pLimit(args.empConcurrency)
  await Promise.all(
    toWebVerify.map((d) =>
      vLimit(async () => {
        if (billingAbort) return
        // Verify on a posting that carries a mailing address when one exists: applicationAddressType
        // is the heaviest signal the check produces and it can only judge an address it is given.
        const rep = pickRepresentative(d.list)
        try {
          const out = await verifyEmployerTiered(client, {
            employerName: rep.employer!.nameDisplay,
            jobTitle: rep.title,
            location: rep.location,
            descriptionExcerpt: rep.descriptionMd.slice(0, 800),
            applicationText: mailEvidence(rep.applicationFlags),
          })
          webIn += out.usage.inputTokens
          webOut += out.usage.outputTokens
          webSearches += out.usage.webSearchRequests
          webCost += out.costUsd
          if (out.escalated) escalated++
          const stored = await storeEmployerWeb(rep.employer!, {
            ...out.result,
            addressChecked: addressKey(rep.applicationFlags),
            verifiedAt: new Date().toISOString(),
          })
          // The search happened either way, so its audit trail is kept (not read by prod pages).
          await prisma.employerWebSearchLog.create({
            data: { employerId: d.id, queries: out.searchLog.queries as never, blocks: out.searchLog.blocks as never },
          })
          if (!stored.stored) console.log(`  [verify] ${rep.employer!.nameDisplay}: another run stored a verdict meanwhile; scoring on it`)
          empChecks.set(d.id, stored.checks)
        } catch (e) {
          if (isFatalApiError(e)) { tripAbort(e); return }
          vFail++
          failedEmployers.add(d.id)
          console.error(`  [verify] ${rep.employer!.nameDisplay}: ${(e as Error).message.slice(0, 120)}`)
        }
        if (++vDone % 50 === 0) console.log(`[verify] ${vDone}/${toWebVerify.length} employers`)
      }),
    ),
  )
  if (billingAbort) await abortRun({ scored: 0, held: 0, failed: vFail })
  console.log(`[judge] employer verify done: ${toWebVerify.length - vFail} ok, ${vFail} failed | ${toPresume.length} presumed legit (no web search)`)

  // --- Stage 2: judge text (Jev) + compose (code); reuses employer verdict + job fields ---
  let sDone = 0
  let sFail = 0
  let heldBack = 0
  let heldForAddress = 0
  let heldForImpersonation = 0
  let impostors = 0
  let keptImpostors = 0
  let totalIn = 0
  let totalOut = 0
  const bands: Record<string, number> = {}
  const sLimit = pLimit(args.scoreConcurrency)
  await Promise.all(
    jobs.map((job) =>
      sLimit(async () => {
        if (billingAbort) return
        if (await keepImpersonationVerdict(job)) {
          keptImpostors++
          return
        }
        // The employer was due a fresh check because its cached verdict could not be reused, and
        // that check failed, so scoring now would publish the posting on the stale or missing
        // verdict. Leave it untouched: still pending on a normal run, its old score on --rejudge.
        if (job.employerId && failedEmployers.has(job.employerId)) {
          heldBack++
          return
        }
        // The employer's verdict was shown another posting's mailing address and says nothing
        // about this one. The next run sees an unchecked address and verifies with this posting.
        const web = (job.employerId ? empChecks.get(job.employerId) : undefined)?.web as { addressChecked?: string } | undefined
        if (web && addressUnchecked(web, job.applicationFlags)) {
          heldForAddress++
          return
        }
        // Brand-impersonation pre-check: if the apply URL routes to a different company than the
        // claimed employer and a web-check confirms it, this re-attributes the posting + writes a
        // HIGH score itself — so skip normal scoring for that job.
        let applicationFlags: Prisma.JsonValue = job.applicationFlags
        try {
          const outcome = await resolveApplyHost(client, job, job.employer?.nameDisplay ?? null)
          // An uncertain answer adds a review flag in the database; score with it, not the row as loaded.
          if (outcome.kind === "uncertain") applicationFlags = outcome.applicationFlags as Prisma.JsonValue
          if (outcome.kind === "impersonation") {
            impostors++
            bands["high"] = (bands["high"] ?? 0) + 1
            if (++sDone % 200 === 0) console.log(`[score] ${sDone}/${jobs.length}`)
            return
          }
        } catch (e) {
          if (isFatalApiError(e)) { tripAbort(e); return }
          // The posting's apply link names another company and the check that would clear or
          // confirm it failed. Publishing it as ordinary could hide an impersonation, so it stays
          // pending, as the keyless path does with a missing answer.
          heldForImpersonation++
          console.error(`  [impersonation] ${job.workbcId} held: ${(e as Error).message.slice(0, 120)}`)
          return
        }
        let verdict
        try {
          verdict = await buildVerdict(
            jev,
            { ...job, applicationFlags, employerName: job.employer?.nameDisplay ?? null },
            job.employerId ? empChecks.get(job.employerId) ?? null : null,
          )
        } catch (err) {
          // A Jev failure leaves the posting pending rather than storing a row of a different
          // kind (composed without judgments) under the same scoringVersion.
          sFail++
          console.error(`  [score] ${job.workbcId} left pending: ${(err as Error).message.slice(0, 120)}`)
          return
        }
        const { usage, ...data } = verdict
        totalIn += usage.inputTokens
        totalOut += usage.outputTokens
        if (!(await writeComposedVerdict(job.workbcId, data, "judgment"))) {
          keptImpostors++
          return
        }
        bands[data.riskBand] = (bands[data.riskBand] ?? 0) + 1
        if (++sDone % 200 === 0) console.log(`[score] ${sDone}/${jobs.length} jobs`)
      }),
    ),
  )
  const held = heldBack + heldForAddress + heldForImpersonation
  const scored = jobs.length - sFail - held
  if (billingAbort) await abortRun({ scored: sDone + keptImpostors, held, failed: sFail })

  console.log(`\n=== JUDGE SUMMARY ===`)
  console.log(`Wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`Employers: web-verified ${toWebVerify.length - vFail}/${toWebVerify.length} (${vFail} failed), presumed-legit ${toPresume.length} | jobs scored: ${scored - keptImpostors} (${sFail} left pending on a Jev error, ${heldBack} held back because their employer's check failed, ${heldForAddress} held for a mailing address their employer's verdict was not shown, ${heldForImpersonation} held because their impersonation check failed) | brand-impersonation re-attributed: ${impostors}, confirmed impersonations kept: ${keptImpostors}`)
  console.log(`Bands: ${JSON.stringify(bands)}`)
  console.log(
    `Web-verify (${TIERED_VERIFIER.primary}, alarming verdicts re-checked by ${TIERED_VERIFIER.escalation}): ${escalated} escalated | tokens in=${webIn} out=${webOut} | searches ${webSearches} | ~$${webCost.toFixed(2)} at list price`,
  )
  console.log(`Jev tokens: in=${totalIn} out=${totalOut}`)
  await settleRequests("[judge]")
  if (jobs.length > 0 || toWebVerify.length > 0) await requestRevalidation()
  const outcome = await finishJudgeRun(run.id, {
    pendingAtStart: run.pendingAtStart,
    scored,
    held,
    failed: sFail,
  })
  console.log(`[judge] run ${run.id}: ${outcome}`)
  if (outcome === "FAILED") process.exitCode = 1
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
