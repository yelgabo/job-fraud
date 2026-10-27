// Runs the employer web check on the same employers with several models and reports what each
// cost and how far its verdicts agree with a reference. READ-ONLY against the DB: verdicts go to
// logs/compare-verifiers-<ts>/, never to an Employer row. Spends Anthropic credit (tokens plus
// $10 per 1,000 searches), so bound it with --employers.
//
// Run: ANTHROPIC_API_KEY=... npm run compare-verifiers -- [--pending 1000] [--employers 20]
//        [--models haiku-4.5,haiku-5.5,opus-5.5] [--reference opus-5.5]
//        [--hybrid haiku-5.5:opus-5.5] [--concurrency 4]
//
// Employers are chosen the way `npm run judge` chooses them: the next --pending postings by
// scrape date, grouped by employer, keeping only those verificationAction() sends to the web.
// The key is passed in the environment rather than .env so this machine stays on the keyless
// judge path (see AGENTS.md).
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import pLimit from "p-limit"
import { prisma } from "../lib/db"
import type { WebVerification } from "../lib/shared/json-schemas"
import { mailEvidence, pickRepresentative } from "../lib/shared/mail-evidence"
import { verificationAction } from "../lib/signals/verification-plan"
import { isAlarmingVerdict, needsEscalation, verifyEmployerWeb, type WebVerifyInput } from "../lib/ai/verify-employer-web"
import { VERIFIER_PROFILES, verifierCostUsd, type VerifierName, type VerifierUsage } from "../lib/ai/verifier-models"
import { isBillingError } from "../lib/shared/anthropic-errors"

const FIELDS = ["businessMatch", "locationMatch", "hasJobsListing", "applicationAddressType", "websiteReachable"] as const

type Row = { employerId: string; workbcId: string; employer: string; model: VerifierName; ok: boolean; error?: string; result?: WebVerification; usage?: VerifierUsage; costUsd?: number; ms: number }

function parseArgs() {
  const a = { pending: 1000, employers: Infinity, models: ["haiku-4.5", "haiku-5.5", "opus-5.5"] as VerifierName[], reference: "opus-5.5" as VerifierName, hybrid: "haiku-5.5:opus-5.5", concurrency: 4 }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const v = () => argv[++i] ?? ""
    if (argv[i] === "--pending") a.pending = parseInt(v(), 10) || a.pending
    else if (argv[i] === "--employers") a.employers = parseInt(v(), 10) || a.employers
    else if (argv[i] === "--models") a.models = v().split(",") as VerifierName[]
    else if (argv[i] === "--reference") a.reference = v() as VerifierName
    else if (argv[i] === "--hybrid") a.hybrid = v()
    else if (argv[i] === "--concurrency") a.concurrency = Math.max(1, parseInt(v(), 10) || 4)
  }
  for (const m of a.models) if (!(m in VERIFIER_PROFILES)) throw new Error(`unknown model ${m}; known: ${Object.keys(VERIFIER_PROFILES).join(", ")}`)
  return a
}


async function main() {
  const args = parseArgs()
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("ANTHROPIC_API_KEY must be set in the environment")
  const client = new Anthropic({ maxRetries: 5 })

  const jobs = await prisma.job.findMany({ where: { scoredAt: null }, orderBy: { scrapedAt: "asc" }, take: args.pending, include: { employer: true } })
  const byEmp = new Map<string, typeof jobs>()
  for (const j of jobs) if (j.employerId) byEmp.set(j.employerId, [...(byEmp.get(j.employerId) ?? []), j])
  const targets: Array<{ employerId: string; workbcId: string; employer: string; input: WebVerifyInput }> = []
  for (const [id, list] of byEmp) {
    const emp = list[0].employer!
    const cached = (emp.checks as { web?: WebVerification } | null)?.web
    if (verificationAction(emp.nameDisplay, list, cached) !== "web") continue
    const rep = pickRepresentative(list)
    targets.push({
      employerId: id,
      workbcId: rep.workbcId,
      employer: emp.nameDisplay,
      input: { employerName: emp.nameDisplay, jobTitle: rep.title, location: rep.location, descriptionExcerpt: rep.descriptionMd.slice(0, 800), applicationText: mailEvidence(rep.applicationFlags) },
    })
  }
  await prisma.$disconnect()
  const chosen = targets.slice(0, args.employers)
  const dir = join("logs", `compare-verifiers-${new Date().toISOString().replace(/[:.]/g, "-")}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "employers.json"), JSON.stringify(chosen, null, 1))
  console.log(`[compare] ${jobs.length} pending postings, ${byEmp.size} employers, ${targets.length} need a web check; running ${chosen.length} x ${args.models.join(", ")} -> ${dir}`)

  // Each model has its own rate-limit pool, so the models run side by side, each capped at
  // --concurrency calls. One billing error stops all of them.
  const rows = new Map<VerifierName, Map<string, Row>>()
  let billingAbort = false
  await Promise.all(args.models.map(async (model) => {
    const profile = VERIFIER_PROFILES[model]
    const out = new Map<string, Row>()
    rows.set(model, out)
    const limit = pLimit(args.concurrency)
    await Promise.all(chosen.map((t) => limit(async () => {
      if (billingAbort) return
      const t0 = Date.now()
      let row: Row
      try {
        const r = await verifyEmployerWeb(client, t.input, { profile })
        row = { employerId: t.employerId, workbcId: t.workbcId, employer: t.employer, model, ok: true, result: r.result, usage: r.usage, costUsd: verifierCostUsd(profile, r.usage), ms: Date.now() - t0 }
      } catch (e) {
        if (isBillingError(e)) billingAbort = true
        row = { employerId: t.employerId, workbcId: t.workbcId, employer: t.employer, model, ok: false, error: (e as Error).message.slice(0, 300), ms: Date.now() - t0 }
      }
      out.set(t.employerId, row)
      appendFileSync(join(dir, `${model}.jsonl`), JSON.stringify(row) + "\n")
    })))
  }))
  if (billingAbort) throw new Error(`billing error: out of credit. Partial results are in ${dir}.`)

  const summary: Record<string, unknown> = {}
  const ref = rows.get(args.reference)
  const agree = (a: Map<string, WebVerification | undefined>) => {
    const counts: Record<string, number> = {}
    let both = 0, alarmSame = 0
    for (const [id, r] of ref ?? []) {
      const v = a.get(id)
      if (!r.ok || !v) continue
      both++
      if (isAlarmingVerdict(v) === isAlarmingVerdict(r.result!)) alarmSame++
      for (const f of FIELDS) if (v[f] === r.result![f]) counts[f] = (counts[f] ?? 0) + 1
    }
    return { both, alarmSame, counts }
  }
  for (const [model, out] of rows) {
    const ok = [...out.values()].filter((r) => r.ok)
    const tot = ok.reduce((s, r) => ({ cost: s.cost + r.costUsd!, in: s.in + r.usage!.inputTokens, out: s.out + r.usage!.outputTokens, searches: s.searches + r.usage!.webSearchRequests }), { cost: 0, in: 0, out: 0, searches: 0 })
    const a = agree(new Map(ok.map((r) => [r.employerId, r.result])))
    summary[model] = { ok: ok.length, failed: out.size - ok.length, ...tot, costPerEmployer: tot.cost / Math.max(1, ok.length), vsReference: a }
    console.log(`\n== ${model}: ${ok.length} ok, ${out.size - ok.length} failed | $${tot.cost.toFixed(3)} total, $${(tot.cost / Math.max(1, ok.length)).toFixed(4)}/employer | tokens in ${tot.in} out ${tot.out} | searches ${tot.searches}`)
    if (ref && model !== args.reference) console.log(`   vs ${args.reference}: same alarm call ${a.alarmSame}/${a.both}; ` + FIELDS.map((f) => `${f} ${a.counts[f] ?? 0}/${a.both}`).join(", "))
  }

  const [cheap, strong] = args.hybrid.split(":") as VerifierName[]
  const inputs = new Map(chosen.map((t) => [t.employerId, t.input]))
  const c = rows.get(cheap), s = rows.get(strong)
  if (c && s) {
    let cost = 0, escalated = 0
    const verdicts = new Map<string, WebVerification | undefined>()
    for (const [id, r] of c) {
      if (!r.ok) continue
      cost += r.costUsd!
      if (needsEscalation(r.result!, inputs.get(id)?.applicationText ?? "")) {
        escalated++
        const sr = s.get(id)
        cost += sr?.costUsd ?? 0
        verdicts.set(id, sr?.ok ? sr.result : undefined)
      } else verdicts.set(id, r.result)
    }
    const a = agree(verdicts)
    summary.hybrid = { cheap, strong, escalated, cost, vsReference: a }
    console.log(`\n== hybrid ${cheap} -> ${strong}: escalated ${escalated}/${c.size} | $${cost.toFixed(3)} total | vs ${args.reference}: same alarm call ${a.alarmSame}/${a.both}; ` + FIELDS.map((f) => `${f} ${a.counts[f] ?? 0}/${a.both}`).join(", "))
  }
  writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 1))
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
