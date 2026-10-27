// Re-checks, with the escalation model, cached employer verdicts that today's tiered rule would
// have escalated but no escalation model ever confirmed: verdicts from before the tiers (Haiku 4.5,
// no verifiedBy) that call a business or location a mismatch, call a mailing address a home, P.O.
// box or mail drop, or left a mailing address uncertain.
//
// Employers with pending postings no longer need this: verificationAction() sends their
// unconfirmed verdicts back to the web on the next judge run. This script covers the published
// side: employers with judged postings, whose ratings were composed from the unconfirmed verdict.
// One Opus call per employer; the new verdict replaces checks.web (verifiedBy "opus-5.5") and every
// judged posting of that employer is re-scored, from its stored Jev judgments when it has them and
// with a fresh Jev call when it does not. Confirmed brand impersonations are left alone.
// Dry run by default.
// Run: ANTHROPIC_API_KEY=... npm run recheck-cached-verdicts -- [--apply] [--limit N] [--concurrency 4]
import Anthropic from "@anthropic-ai/sdk"
import pLimit from "p-limit"
import { prisma } from "../lib/db"
import type { WebVerification } from "../lib/shared/json-schemas"
import { mailEvidence, pickRepresentative } from "../lib/shared/mail-evidence"
import { tierViolation, verifyEmployerWeb } from "../lib/ai/verify-employer-web"
import { TIERED_VERIFIER, VERIFIER_PROFILES, verifierCostUsd } from "../lib/ai/verifier-models"
import { jevClientFromEnv } from "../lib/ai/jev-judgments"
import { isBillingError } from "../lib/shared/anthropic-errors"
import { rescoreVerdict } from "../lib/scoring/verdict"
import { isImpersonationVerdict } from "../lib/ai/resolve-impersonation"
import { requestRevalidation } from "../lib/shared/request-revalidation"

// Measured on the 2026-10-27 API comparison: Opus 5.5 averaged $0.193 per employer check.
const EST_USD_PER_CHECK = 0.19

async function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes("--apply")
  const limitArg = argv.indexOf("--limit")
  const limit = limitArg >= 0 ? parseInt(argv[limitArg + 1] ?? "", 10) || Infinity : Infinity
  const concArg = argv.indexOf("--concurrency")
  const concurrency = concArg >= 0 ? Math.max(1, parseInt(argv[concArg + 1] ?? "", 10) || 4) : 4

  const judged = await prisma.job.findMany({ where: { scoredAt: { not: null }, employerId: { not: null } }, include: { employer: true } })
  const byEmployer = new Map<string, typeof judged>()
  for (const j of judged) {
    if (isImpersonationVerdict(j.reasoning)) continue
    byEmployer.set(j.employerId!, [...(byEmployer.get(j.employerId!) ?? []), j])
  }

  const candidates: Array<{ employerId: string; name: string; postings: typeof judged; web: WebVerification; rep: (typeof judged)[number] }> = []
  for (const [employerId, list] of byEmployer) {
    const web = (list[0].employer?.checks as { web?: WebVerification } | null)?.web
    if (!web || web.source === "ats-tenant-match") continue
    const rep = pickRepresentative(list)
    if (tierViolation(web, mailEvidence(rep.applicationFlags))) candidates.push({ employerId, name: list[0].employer!.nameDisplay, postings: list, web, rep })
  }
  candidates.sort((a, b) => b.postings.length - a.postings.length)
  const chosen = candidates.slice(0, limit)
  const affected = chosen.reduce((n, c) => n + c.postings.length, 0)
  console.log(
    `[recheck] ${byEmployer.size} employers with judged postings; ${candidates.length} cached verdicts need an ${TIERED_VERIFIER.escalation} re-check; ` +
      `${apply ? "re-checking" : "would re-check"} ${chosen.length}, covering ${affected} judged postings, about $${(chosen.length * EST_USD_PER_CHECK).toFixed(2)}`,
  )
  for (const c of chosen) {
    console.log(`  ${c.name} (${c.postings.length} judged): biz=${c.web.businessMatch} loc=${c.web.locationMatch} addr=${c.web.applicationAddressType} verifiedBy=${c.web.verifiedBy ?? "(before tiering)"}`)
  }
  if (!apply) {
    console.log("Dry run. Re-run with --apply (and ANTHROPIC_API_KEY set) to re-check and re-score.")
    await prisma.$disconnect()
    return
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("ANTHROPIC_API_KEY must be set in the environment")

  const client = new Anthropic({ maxRetries: 5 })
  const jev = jevClientFromEnv()
  const profile = VERIFIER_PROFILES[TIERED_VERIFIER.escalation]
  let done = 0, failed = 0, changedVerdict = 0, cost = 0, rescored = 0, rescoreFailed = 0
  const moves: Record<string, number> = {}
  let billingAbort = false
  const run = pLimit(concurrency)
  await Promise.all(chosen.map((c) => run(async () => {
    if (billingAbort) return
    let web: WebVerification
    try {
      const out = await verifyEmployerWeb(client, {
        employerName: c.name,
        jobTitle: c.rep.title,
        location: c.rep.location,
        descriptionExcerpt: c.rep.descriptionMd.slice(0, 800),
        applicationText: mailEvidence(c.rep.applicationFlags),
      }, { profile })
      cost += verifierCostUsd(profile, out.usage)
      web = { ...out.result, verifiedBy: TIERED_VERIFIER.escalation }
      const checks = { ...((c.rep.employer!.checks as Record<string, unknown>) ?? {}), web }
      await prisma.employer.update({ where: { id: c.employerId }, data: { checks: checks as never, checkedAt: new Date() } })
      await prisma.employerWebSearchLog.create({ data: { employerId: c.employerId, queries: out.searchLog.queries as never, blocks: out.searchLog.blocks as never } })
    } catch (e) {
      if (isBillingError(e)) { billingAbort = true; return }
      failed++
      console.error(`  ${c.name}: re-check failed, cached verdict and scores kept - ${(e as Error).message.slice(0, 120)}`)
      return
    }
    const moved = c.web.businessMatch !== web.businessMatch || c.web.locationMatch !== web.locationMatch || c.web.applicationAddressType !== web.applicationAddressType
    if (moved) changedVerdict++
    done++

    const checks = { ...((c.rep.employer!.checks as Record<string, unknown>) ?? {}), web }
    const bandsBefore: string[] = [], bandsAfter: string[] = []
    for (const job of c.postings) {
      try {
        const { usage: _usage, ...data } = await rescoreVerdict(jev, { ...job, employerName: c.name }, checks)
        await prisma.job.update({ where: { workbcId: job.workbcId }, data })
        rescored++
        const key = `${job.riskBand ?? "?"}->${data.riskBand}`
        moves[key] = (moves[key] ?? 0) + 1
        bandsBefore.push(`${job.riskBand}`)
        bandsAfter.push(data.riskBand)
      } catch (e) {
        rescoreFailed++
        console.error(`  ${c.name} ${job.workbcId}: re-score failed, old score kept - ${(e as Error).message.slice(0, 120)}`)
      }
    }
    console.log(`  ${c.name}: ${moved ? "CHANGED" : "confirmed"} -> biz=${web.businessMatch} loc=${web.locationMatch} addr=${web.applicationAddressType} | bands ${bandsBefore.join(",")} -> ${bandsAfter.join(",")}`)
  })))
  if (rescored > 0) await requestRevalidation()
  if (billingAbort) throw new Error("Anthropic API credit exhausted; verdicts re-checked and postings re-scored so far are saved.")
  console.log(`[recheck] re-checked ${done} (${changedVerdict} changed, ${done - changedVerdict} confirmed), ${failed} failed | $${cost.toFixed(2)} at list price`)
  console.log(`[recheck] re-scored ${rescored} postings (${rescoreFailed} failed); band moves: ${JSON.stringify(moves)}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
