// Re-checks cached employer verdicts with the escalation model (Opus 5.5), stores the new verdict
// on the employer and re-scores the employer's judged postings, from their stored Jev judgments
// when they have them and with a fresh Jev call when they do not. Confirmed brand impersonations
// are left alone. Two selections:
//
// - default: verdicts the tiered rule would have escalated but no escalation model confirmed
//   (from before the tiers), for employers with judged postings. Pending postings need no script:
//   verificationAction() sends those verdicts back to the web on the next judge run.
// - --residential: every cached "residential" verdict, so the verifier can tell a home the
//   employer publishes as its own address (home_business) from any other home. Run once when
//   home_business was introduced (docs/home-business-address-plan.md).
//
// Steps, so a person can review verdicts before they are published:
//   (no flag)          list the employers it would check; free
//   --propose          run Opus and write the proposed verdicts to logs/; no database writes
//   --apply --from F   store the verdicts in F and re-score; no model calls for the verdicts
//   --apply            run Opus and store in one go
// Run: ANTHROPIC_API_KEY=... npm run recheck-cached-verdicts -- [--residential] [--propose | --apply [--from F]] [--limit N] [--concurrency 4]
import Anthropic from "@anthropic-ai/sdk"
import pLimit from "p-limit"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { prisma } from "../lib/db"
import { WebVerificationSchema, type WebVerification } from "../lib/shared/json-schemas"
import { mailEvidence, pickRepresentative } from "../lib/shared/mail-evidence"
import { tierViolation, verifyEmployerWeb } from "../lib/ai/verify-employer-web"
import { TIERED_VERIFIER, VERIFIER_PROFILES, verifierCostUsd } from "../lib/ai/verifier-models"
import { jevClientFromEnv } from "../lib/ai/jev-judgments"
import { isBillingError } from "../lib/shared/anthropic-errors"
import { rescoreVerdict } from "../lib/scoring/verdict"
import { isImpersonationVerdict } from "../lib/ai/resolve-impersonation"
import { requestRevalidation } from "../lib/shared/request-revalidation"

// Measured on the 2026-10-27 published-side run: Opus 5.5 averaged $0.21 per employer check.
const EST_USD_PER_CHECK = 0.21

type Proposal = { employerId: string; name: string; before: WebVerification; web: WebVerification }

const arg = (argv: string[], name: string) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

async function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes("--apply")
  const propose = argv.includes("--propose")
  const residential = argv.includes("--residential")
  const from = arg(argv, "--from")
  const limit = parseInt(arg(argv, "--limit") ?? "", 10) || Infinity
  const concurrency = Math.max(1, parseInt(arg(argv, "--concurrency") ?? "", 10) || 4)
  if (from && !apply) throw new Error("--from only makes sense with --apply")

  const jobs = await prisma.job.findMany({ where: { employerId: { not: null } }, include: { employer: true } })
  const byEmployer = new Map<string, typeof jobs>()
  for (const j of jobs) {
    if (isImpersonationVerdict(j.reasoning)) continue
    byEmployer.set(j.employerId!, [...(byEmployer.get(j.employerId!) ?? []), j])
  }

  type Candidate = { employerId: string; name: string; postings: typeof jobs; judged: typeof jobs; web: WebVerification; rep: (typeof jobs)[number] }
  const candidates: Candidate[] = []
  for (const [employerId, list] of byEmployer) {
    const web = (list[0].employer?.checks as { web?: WebVerification } | null)?.web
    if (!web || web.source === "ats-tenant-match") continue
    const judged = list.filter((j) => j.scoredAt)
    const rep = pickRepresentative(residential ? list : judged.length ? judged : list)
    const selected = residential
      ? web.applicationAddressType === "residential"
      : judged.length > 0 && tierViolation(web, mailEvidence(rep.applicationFlags)) !== null
    if (selected) candidates.push({ employerId, name: list[0].employer!.nameDisplay, postings: list, judged, web, rep })
  }
  candidates.sort((a, b) => b.judged.length - a.judged.length)
  const chosen = candidates.slice(0, limit)
  const affected = chosen.reduce((n, c) => n + c.judged.length, 0)
  console.log(
    `[recheck] ${residential ? "residential verdicts" : "unconfirmed alarming verdicts on judged employers"}: ${candidates.length}; ` +
      `${from ? "applying from file for" : "checking"} ${chosen.length}, covering ${affected} judged postings` +
      (from ? "" : `, about $${(chosen.length * EST_USD_PER_CHECK).toFixed(2)} of ${TIERED_VERIFIER.escalation}`),
  )

  if (!apply && !propose) {
    for (const c of chosen) {
      console.log(`  ${c.name} (${c.judged.length} judged): biz=${c.web.businessMatch} loc=${c.web.locationMatch} addr=${c.web.applicationAddressType} verifiedBy=${c.web.verifiedBy ?? "(before tiering)"}`)
    }
    console.log("Dry run. --propose runs Opus and saves the verdicts for review; --apply writes.")
    await prisma.$disconnect()
    return
  }

  const proposals = new Map<string, Proposal>()
  let cost = 0, failed = 0
  if (from) {
    for (const p of JSON.parse(readFileSync(from, "utf8")) as Proposal[]) {
      proposals.set(p.employerId, { ...p, web: WebVerificationSchema.parse(p.web) })
    }
  } else {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("ANTHROPIC_API_KEY must be set in the environment")
    const client = new Anthropic({ maxRetries: 5 })
    const profile = VERIFIER_PROFILES[TIERED_VERIFIER.escalation]
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
        proposals.set(c.employerId, { employerId: c.employerId, name: c.name, before: c.web, web: { ...out.result, verifiedBy: TIERED_VERIFIER.escalation } })
        if (apply) {
          await prisma.employerWebSearchLog.create({ data: { employerId: c.employerId, queries: out.searchLog.queries as never, blocks: out.searchLog.blocks as never } })
        }
      } catch (e) {
        if (isBillingError(e)) { billingAbort = true; return }
        failed++
        console.error(`  ${c.name}: check failed, cached verdict kept - ${(e as Error).message.slice(0, 120)}`)
      }
    })))
    if (billingAbort) console.error("Anthropic API credit exhausted; continuing with the verdicts already returned.")
    console.log(`[recheck] checked ${proposals.size}, ${failed} failed | $${cost.toFixed(2)} at list price`)
  }

  const moved = (p: Proposal) =>
    p.before.businessMatch !== p.web.businessMatch || p.before.locationMatch !== p.web.locationMatch || p.before.applicationAddressType !== p.web.applicationAddressType
  const addrMoves: Record<string, number> = {}
  for (const p of proposals.values()) {
    const k = `${p.before.applicationAddressType}->${p.web.applicationAddressType}`
    addrMoves[k] = (addrMoves[k] ?? 0) + 1
  }
  console.log(`[recheck] ${[...proposals.values()].filter(moved).length} of ${proposals.size} verdicts change; address moves: ${JSON.stringify(addrMoves)}`)

  if (propose && !apply) {
    mkdirSync("logs", { recursive: true })
    const file = `logs/recheck-${residential ? "residential" : "tier"}-proposals-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    writeFileSync(file, JSON.stringify([...proposals.values()], null, 2))
    for (const p of proposals.values()) {
      if (moved(p)) console.log(`  ${p.name}: ${p.before.applicationAddressType} -> ${p.web.applicationAddressType} (biz=${p.web.businessMatch} loc=${p.web.locationMatch}) | ${p.web.summary}`)
    }
    console.log(`Proposals saved to ${file}. Nothing written. Review, then: --apply --from ${file}`)
    await prisma.$disconnect()
    return
  }

  const jev = jevClientFromEnv()
  const bandMoves: Record<string, number> = {}
  let rescored = 0, rescoreFailed = 0
  for (const c of chosen) {
    const p = proposals.get(c.employerId)
    if (!p) continue
    const checks = { ...((c.rep.employer!.checks as Record<string, unknown>) ?? {}), web: p.web }
    await prisma.employer.update({ where: { id: c.employerId }, data: { checks: checks as never, checkedAt: new Date() } })
    const before: string[] = [], after: string[] = []
    for (const job of c.judged) {
      try {
        const { usage: _usage, ...data } = await rescoreVerdict(jev, { ...job, employerName: c.name }, checks)
        await prisma.job.update({ where: { workbcId: job.workbcId }, data })
        rescored++
        const key = `${job.riskBand ?? "?"}->${data.riskBand}`
        bandMoves[key] = (bandMoves[key] ?? 0) + 1
        before.push(`${job.riskBand}`)
        after.push(data.riskBand)
      } catch (e) {
        rescoreFailed++
        console.error(`  ${c.name} ${job.workbcId}: re-score failed, old score kept - ${(e as Error).message.slice(0, 120)}`)
      }
    }
    console.log(`  ${c.name}: ${moved(p) ? "CHANGED" : "confirmed"} -> biz=${p.web.businessMatch} loc=${p.web.locationMatch} addr=${p.web.applicationAddressType} | bands ${before.join(",")} -> ${after.join(",")}`)
  }
  if (rescored > 0) await requestRevalidation()
  console.log(`[recheck] re-scored ${rescored} postings (${rescoreFailed} failed); band moves: ${JSON.stringify(bandMoves)}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
