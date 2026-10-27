// Re-checks, with the escalation model, cached employer verdicts that today's tiered rule would
// have escalated but no escalation model ever confirmed: verdicts from before the tiers (Haiku 4.5,
// no verifiedBy) that call a business or location a mismatch, call a mailing address a home, P.O.
// box or mail drop, or left a mailing address uncertain. Without this they are reused unchecked
// by every later judge run, because a cached verdict is never re-verified.
//
// Scope: employers that still have pending postings, so the corrected verdict is what judges them.
// Already-published postings keep their scores until re-scored. One Opus call per employer; the
// new verdict replaces checks.web and is marked verifiedBy "opus-5.5". Dry run by default.
// Run: ANTHROPIC_API_KEY=... npm run recheck-cached-verdicts -- [--apply] [--limit N] [--concurrency 4]
import Anthropic from "@anthropic-ai/sdk"
import pLimit from "p-limit"
import { prisma } from "../lib/db"
import type { WebVerification } from "../lib/shared/json-schemas"
import { mailEvidence, pickRepresentative } from "../lib/shared/mail-evidence"
import { tierViolation, verifyEmployerWeb } from "../lib/ai/verify-employer-web"
import { TIERED_VERIFIER, VERIFIER_PROFILES, verifierCostUsd } from "../lib/ai/verifier-models"
import { isBillingError } from "../lib/shared/anthropic-errors"

// Measured on the 2026-10-27 API comparison: Opus 5.5 averaged $0.193 per employer check.
const EST_USD_PER_CHECK = 0.19

async function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes("--apply")
  const limitArg = argv.indexOf("--limit")
  const limit = limitArg >= 0 ? parseInt(argv[limitArg + 1] ?? "", 10) || Infinity : Infinity
  const concArg = argv.indexOf("--concurrency")
  const concurrency = concArg >= 0 ? Math.max(1, parseInt(argv[concArg + 1] ?? "", 10) || 4) : 4

  const pending = await prisma.job.findMany({ where: { scoredAt: null, employerId: { not: null } }, include: { employer: true } })
  const byEmployer = new Map<string, typeof pending>()
  for (const j of pending) byEmployer.set(j.employerId!, [...(byEmployer.get(j.employerId!) ?? []), j])

  const candidates: Array<{ employerId: string; name: string; postings: number; web: WebVerification; rep: (typeof pending)[number]; why: string }> = []
  for (const [employerId, list] of byEmployer) {
    const web = (list[0].employer?.checks as { web?: WebVerification } | null)?.web
    if (!web || web.source === "ats-tenant-match") continue
    const rep = pickRepresentative(list)
    const why = tierViolation(web, mailEvidence(rep.applicationFlags))
    if (why) candidates.push({ employerId, name: list[0].employer!.nameDisplay, postings: list.length, web, rep, why })
  }
  candidates.sort((a, b) => b.postings - a.postings)
  const chosen = candidates.slice(0, limit)
  const affected = chosen.reduce((n, c) => n + c.postings, 0)
  console.log(
    `[recheck] ${byEmployer.size} employers with pending postings; ${candidates.length} cached verdicts need an ${TIERED_VERIFIER.escalation} re-check; ` +
      `${apply ? "re-checking" : "would re-check"} ${chosen.length}, covering ${affected} pending postings, about $${(chosen.length * EST_USD_PER_CHECK).toFixed(2)}`,
  )
  for (const c of chosen) {
    console.log(`  ${c.name} (${c.postings} pending): biz=${c.web.businessMatch} loc=${c.web.locationMatch} addr=${c.web.applicationAddressType} verifiedBy=${c.web.verifiedBy ?? "(before tiering)"}`)
  }
  if (!apply) {
    console.log("Dry run. Re-run with --apply (and ANTHROPIC_API_KEY set) to re-check.")
    await prisma.$disconnect()
    return
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("ANTHROPIC_API_KEY must be set in the environment")

  const client = new Anthropic({ maxRetries: 5 })
  const profile = VERIFIER_PROFILES[TIERED_VERIFIER.escalation]
  let done = 0, failed = 0, changedBand = 0, cost = 0
  let billingAbort = false
  const run = pLimit(concurrency)
  await Promise.all(chosen.map((c) => run(async () => {
    if (billingAbort) return
    try {
      const out = await verifyEmployerWeb(client, {
        employerName: c.name,
        jobTitle: c.rep.title,
        location: c.rep.location,
        descriptionExcerpt: c.rep.descriptionMd.slice(0, 800),
        applicationText: mailEvidence(c.rep.applicationFlags),
      }, { profile })
      cost += verifierCostUsd(profile, out.usage)
      const web = { ...out.result, verifiedBy: TIERED_VERIFIER.escalation }
      const checks = { ...((c.rep.employer!.checks as Record<string, unknown>) ?? {}), web }
      await prisma.employer.update({ where: { id: c.employerId }, data: { checks: checks as never, checkedAt: new Date() } })
      await prisma.employerWebSearchLog.create({ data: { employerId: c.employerId, queries: out.searchLog.queries as never, blocks: out.searchLog.blocks as never } })
      const moved = c.web.businessMatch !== web.businessMatch || c.web.locationMatch !== web.locationMatch || c.web.applicationAddressType !== web.applicationAddressType
      if (moved) changedBand++
      done++
      console.log(`  ${c.name}: ${moved ? "CHANGED" : "confirmed"} -> biz=${web.businessMatch} loc=${web.locationMatch} addr=${web.applicationAddressType}`)
    } catch (e) {
      if (isBillingError(e)) { billingAbort = true; return }
      failed++
      console.error(`  ${c.name}: re-check failed, cached verdict kept - ${(e as Error).message.slice(0, 120)}`)
    }
  })))
  if (billingAbort) throw new Error("Anthropic API credit exhausted; verdicts re-checked so far are saved.")
  console.log(`[recheck] re-checked ${done} (${changedBand} changed, ${done - changedBand} confirmed), ${failed} failed | $${cost.toFixed(2)} at list price`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
