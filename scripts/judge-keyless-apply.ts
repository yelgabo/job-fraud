// KEYLESS JUDGE, step 2 of 2: APPLY. The SINGLE DB WRITER for the keyless path.
// Reads the helper agents' verdict files plus the fetch step's batch-*.json and cached.json, stores
// each employer verdict once, then scores exactly the postings the fetch grouped under that
// employer, the same way the API judge does: Jev text judgments (when TYPESAFE_API_KEY is set)
// plus the composer (lib/scoring/verdict.ts). Agents supply evidence; no agent chooses a number.
// Sequential writes, no races.
//
// A verdict is skipped, and its employer's postings stay pending, when it fails zod validation or
// breaks the tiered rule (tierViolation: a verdict needing escalation, see needsEscalation, that
// the escalation model did not confirm). On the API path code escalates; here nothing else would catch a missed step 3b.
//
// Impersonation: the fetch writes impersonation-NNN.json items for postings whose apply link goes
// to another company's ATS tenant; Opus helpers answer them in impersonation-result-NNN.json. Those
// results are applied first, through the same write the API judge uses, and a posting that needs
// the check is not scored until a result clears it. A helper's searchLog is stored in
// EmployerWebSearchLog so /audit shows the searches behind the verdict.
// Run: npm run judge-keyless:apply -- [--dry-run] [--force] <logs/judge-<ts>/ | verdicts.json | cached.json> [...]
// --dry-run validates and plans everything, then writes nothing and asks Jev nothing. --force applies
// files applied.json lists as applied, and a dir with no manifest.json.
import { readFileSync, statSync } from "node:fs"
import { prisma } from "../lib/db"
import { ImpersonationResultSchema, VerdictSchema } from "../lib/shared/keyless-verdict"
import { jevClientFromEnv } from "../lib/ai/jev-judgments"
import { tierViolation } from "../lib/ai/verify-employer-web"
import { addressKey, addressUnchecked, mailEvidence } from "../lib/shared/mail-evidence"
import { failJudgeRun, finishJudgeRun, startJudgeRun } from "../lib/shared/judge-run"
import { settleRequests } from "../lib/shared/judge-requests"
import { buildVerdict } from "../lib/scoring/verdict"
import { writeComposedVerdict } from "../lib/scoring/write-verdict"
import type { JobStatus, VerdictKind } from "@prisma/client"
import { planByEmployer, presumedVerdict } from "../lib/signals/verification-plan"
import { requestRevalidation } from "../lib/shared/request-revalidation"
import { scoreableWhere } from "../lib/shared/deep-requests"
import { agentSearchLogRow } from "../lib/shared/agent-search-log"
import {
  applyImpersonationVerdict,
  keepImpersonationVerdict,
  saveImpersonationAnswer,
  savedImpersonationAnswer,
} from "../lib/ai/resolve-impersonation"
import { storeEmployerWeb } from "../lib/shared/employer-verdict"
import { alreadyApplied, fetchedAtOf, recordApplied, resolveFiles } from "../lib/shared/keyless-files"
import { impersonationCheckFor, type ImpersonationItem } from "../lib/signals/impersonation-plan"

const readJsonArray = (f: string): unknown[] => {
  const raw = JSON.parse(readFileSync(f, "utf8"))
  return Array.isArray(raw) ? raw : [raw]
}

/** Set once the run row exists, so the top-level catch can close it. */
let runId: string | null = null

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const force = process.argv.includes("--force")
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run" && a !== "--force")
  if (args.length === 0) {
    console.error("usage: npm run judge-keyless:apply -- [--dry-run] [--force] <logs/judge-<ts>/ | verdicts.json | cached.json> [...]")
    process.exit(1)
  }
  const resolved = resolveFiles(args)
  const { batchFiles, impersonationItemFiles, dirs } = resolved
  const fetchedAt = fetchedAtOf(dirs, force)
  const fresh = (files: string[]) =>
    files.filter((f) => {
      if (force || !alreadyApplied(f)) return true
      console.log(`  skip (already applied, see applied.json; --force applies it again): ${f}`)
      return false
    })
  const verdictFiles = fresh(resolved.verdictFiles)
  const cachedFiles = fresh(resolved.cachedFiles)
  const impersonationResultFiles = fresh(resolved.impersonationResultFiles)
  const workFiles = [...verdictFiles, ...cachedFiles, ...impersonationResultFiles]
  if (workFiles.length === 0) {
    console.log("[judge-keyless:apply] nothing left to apply")
    return
  }
  // A verdict's research happened shortly before the orchestrator wrote its file, so the file's
  // modification time stands in for web.verifiedAt.
  const verdicts = verdictFiles.flatMap((f) => {
    const at = statSync(f).mtime.toISOString()
    return readJsonArray(f).map((v) => ({ v, at }))
  })
  const cachedEntries = cachedFiles.flatMap(readJsonArray) as Array<{ workbcId: string }>
  // The fetch's posting list per employer, keyed by the representative posting the verdict names.
  // Without the batch files a verdict scores only the posting it names.
  const postingsFor = new Map<string, string[]>()
  const employerFor = new Map<string, string>()
  for (const item of batchFiles.flatMap(readJsonArray) as Array<{ workbcId: string; employerId?: string | null; employerPostings?: string[] }>) {
    postingsFor.set(item.workbcId, item.employerPostings ?? [item.workbcId])
    if (item.employerId) employerFor.set(item.workbcId, item.employerId)
  }
  const jev = jevClientFromEnv()
  console.log(
    `[judge-keyless:apply]${dryRun ? " DRY RUN:" : ""} ${verdicts.length} verdicts, ${cachedEntries.length} cached-verdict postings ` +
      `(${jev ? "Jev + composer" : "composer only, no TYPESAFE_API_KEY"})`,
  )

  const openDeep = await prisma.judgeRequest.findMany({ where: { kind: "deep", resolvedAt: null }, select: { workbcId: true } })
  const openDeepIds = new Set(openDeep.map((r) => r.workbcId))
  // What this apply can score: the postings its own verdict, result and cached files reach that are
  // still waiting. The dir's other batches belong to waves not applied yet.
  const items = new Map((impersonationItemFiles.flatMap(readJsonArray) as ImpersonationItem[]).map((it) => [it.checkKey, it]))
  const named = new Set<string>([
    ...verdicts.flatMap(({ v }) => {
      const id = (v as { workbcId?: unknown })?.workbcId
      return typeof id === "string" ? (postingsFor.get(id) ?? [id]) : []
    }),
    ...impersonationResultFiles.flatMap(readJsonArray).flatMap((r) => items.get((r as { checkKey?: string })?.checkKey ?? "")?.postings ?? []),
    ...cachedEntries.map((e) => e.workbcId),
  ])
  const run = dryRun
    ? null
    : await startJudgeRun("KEYLESS", await prisma.job.count({ where: scoreableWhere([...named], openDeepIds) }))
  if (run) runId = run.id
  const noDeep = new Set<string>()

  let applied = 0
  let skipped = 0
  let tierRejected = 0
  let deepResolved = 0
  let tokens = 0
  let impostors = 0
  let keptImpostors = 0
  let withoutSearchLog = 0
  let newerKept = 0
  const bands: Record<string, number> = {}
  const scored = new Set<string>()
  /** Postings whose impersonation check came back same, affiliate or uncertain. */
  const cleared = new Set<string>()
  const heldForImpersonation = new Set<string>()
  /** Postings whose mailing address the employer's verdict was not shown; checked on a later fetch. */
  const heldForAddress = new Set<string>()
  /** Postings whose new verdict was written; a deep request is serviced only by one of these. */
  const rescored = new Set<string>()
  const deepNamed = new Set<string>()

  const impItems = new Map<string, ImpersonationItem>()
  for (const it of impersonationItemFiles.flatMap(readJsonArray) as ImpersonationItem[]) impItems.set(it.checkKey, it)
  for (const r of impersonationResultFiles.flatMap(readJsonArray)) {
    const parsed = ImpersonationResultSchema.safeParse(r)
    const item = parsed.success ? impItems.get(parsed.data.checkKey) : undefined
    if (!parsed.success || !item) {
      skipped++
      const why = parsed.success ? "no impersonation item with that checkKey" : parsed.error.issues[0]?.message
      console.error(`  skip (impersonation): ${(r as { checkKey?: string })?.checkKey ?? "?"} - ${why}`)
      continue
    }
    const { checkKey, searchLog, ...verdict } = parsed.data
    if (!dryRun) await saveImpersonationAnswer(checkKey, verdict)
    let logRow = searchLog ? agentSearchLogRow(searchLog, "opus-5.5") : undefined
    if (!searchLog) withoutSearchLog++
    const rows = await prisma.job.findMany({ where: scoreableWhere(item.postings, openDeepIds), include: { employer: true } })
    for (const job of rows) {
      const name = job.employer?.nameDisplay ?? null
      const check = impersonationCheckFor(name, job.externalApplyUrl)
      // The posting no longer needs this check (re-attributed, or its apply link changed).
      if (!check || check.checkKey !== checkKey || !name) continue
      if (dryRun) {
        if (verdict.relationship === "impersonation") {
          scored.add(job.workbcId)
          applied++
          impostors++
        } else cleared.add(job.workbcId)
        continue
      }
      try {
        const outcome = await applyImpersonationVerdict(job, name, check, verdict, logRow)
        if (outcome.kind === "impersonation") {
          logRow = undefined
          scored.add(job.workbcId)
          applied++
          impostors++
          bands.high = (bands.high ?? 0) + 1
        } else cleared.add(job.workbcId)
      } catch (err) {
        skipped++
        console.error(`  skip (impersonation): ${job.workbcId} - ${(err as Error).message.slice(0, 100)}`)
      }
    }
  }

  async function score(
    job: Parameters<typeof buildVerdict>[1] & {
      workbcId: string
      externalApplyUrl: string | null
      verdictKind: VerdictKind | null
      status: JobStatus
    },
    checks: unknown,
  ) {
    let toScore = job
    if (await keepImpersonationVerdict(job, dryRun)) {
      scored.add(job.workbcId)
      keptImpostors++
      return
    }
    const web = (checks as { web?: { addressChecked?: string } } | null)?.web
    if (web && addressUnchecked(web, job.applicationFlags)) {
      heldForAddress.add(job.workbcId)
      return
    }
    const check = impersonationCheckFor(job.employerName, job.externalApplyUrl)
    if (check && !cleared.has(job.workbcId)) {
      // A pair decided by an earlier run (either path) needs no helper this time.
      const saved = await savedImpersonationAnswer(check.checkKey)
      if (!saved) {
        if (!heldForImpersonation.has(job.workbcId)) {
          heldForImpersonation.add(job.workbcId)
          console.error(`  held (no impersonation result): ${job.workbcId} checkKey=${check.checkKey}`)
        }
        return
      }
      if (saved.relationship === "impersonation") {
        if (!dryRun) await applyImpersonationVerdict(job, job.employerName!, check, saved)
        scored.add(job.workbcId)
        applied++
        impostors++
        bands.high = (bands.high ?? 0) + 1
        return
      }
      cleared.add(job.workbcId)
      if (!dryRun) {
        const outcome = await applyImpersonationVerdict(job, job.employerName!, check, saved)
        if (outcome.kind === "uncertain") toScore = { ...job, applicationFlags: outcome.applicationFlags as never }
      }
    }
    scored.add(job.workbcId)
    if (dryRun) {
      applied++
      return
    }
    const { usage, ...data } = await buildVerdict(jev, toScore, checks)
    tokens += usage.inputTokens
    if (!(await writeComposedVerdict(job.workbcId, data, "judgment"))) {
      keptImpostors++
      return
    }
    rescored.add(job.workbcId)
    applied++
    bands[data.riskBand] = (bands[data.riskBand] ?? 0) + 1
  }

  /**
   * Scores the listed postings not yet scored in this run: the pending ones, plus, when `deepIds`
   * names them, judged ones with an open deep review request.
   */
  async function scorePostings(workbcIds: string[], checks: unknown, deepIds: ReadonlySet<string> = noDeep) {
    const ids = workbcIds.filter((id) => !scored.has(id))
    const rows = await prisma.job.findMany({ where: scoreableWhere(ids, deepIds), include: { employer: true } })
    for (const j of rows) await score({ ...j, employerName: j.employer?.nameDisplay ?? null }, checks)
  }

  for (const { v, at } of verdicts) {
    const parsed = VerdictSchema.safeParse(v)
    if (!parsed.success) {
      skipped++
      console.error(`  skip (invalid): ${(v as { workbcId?: string })?.workbcId ?? "?"} - ${parsed.error.issues[0]?.message}`)
      continue
    }
    const d = parsed.data
    try {
      const job = await prisma.job.findUnique({ where: { workbcId: d.workbcId }, include: { employer: true } })
      if (!job) throw new Error("no such posting")
      const violation = d.web ? tierViolation(d.web, mailEvidence(job.applicationFlags)) : null
      if (violation) {
        tierRejected++
        console.error(`  skip (tier): ${d.workbcId} - ${violation}`)
        continue
      }
      // The employer the fetch grouped these postings under: an impersonation result applied above
      // may have moved the representative posting to another company since.
      const employerId = employerFor.get(d.workbcId) ?? job.employerId
      const employer = employerId ? await prisma.employer.findUnique({ where: { id: employerId } }) : null
      let checks = (employer?.checks as Record<string, unknown> | null) ?? {}
      const newer = fetchedAt && employer?.checkedAt && employer.checkedAt > fetchedAt
      if (d.web && employer && newer) {
        // Written after this dir was fetched (another run, or an earlier verdict for the same
        // employer in this one): it stands, and these postings are scored on it.
        newerKept++
      } else if (d.web && employer) {
        const web = { ...d.web, addressChecked: addressKey(job.applicationFlags), verifiedAt: at }
        if (dryRun) checks = { ...checks, web }
        else {
          const stored = await storeEmployerWeb(employer, web)
          checks = stored.checks
          if (!stored.stored) newerKept++
        }
        if (!d.searchLog) withoutSearchLog++
        else if (!dryRun) {
          const row = agentSearchLogRow(d.searchLog, d.web.verifiedBy)
          await prisma.employerWebSearchLog.create({
            data: { employerId: employer.id, queries: row.queries as never, blocks: row.blocks as never },
          })
        }
      }
      await scorePostings(d.web ? (postingsFor.get(d.workbcId) ?? [d.workbcId]) : [d.workbcId], checks, openDeepIds)
      // A verdict that names a deep-flagged posting is the agent investigation that request asked
      // for. It is resolved after all writes, and only if that posting's new verdict was written:
      // a later posting of the same employer failing must not leave it open, nor a failed write close it.
      if (openDeepIds.has(d.workbcId)) deepNamed.add(d.workbcId)
    } catch (err) {
      skipped++
      console.error(`  skip: ${d.workbcId} - ${(err as Error).message.slice(0, 100)}`)
    }
  }

  // Re-decided from the DB at apply time, against every pending posting of the employer: if one
  // has appeared since the fetch that the cached verdict never saw (a mailing address, say), the
  // employer now needs a web check and its postings stay pending for the next fetch.
  const cachedJobs = await prisma.job.findMany({
    where: { workbcId: { in: cachedEntries.map((e) => e.workbcId) } },
    select: { workbcId: true, employerId: true },
  })
  const cachedByEmployer = new Map<string, string[]>()
  const withoutEmployer: string[] = []
  for (const j of cachedJobs) {
    if (j.employerId) cachedByEmployer.set(j.employerId, [...(cachedByEmployer.get(j.employerId) ?? []), j.workbcId])
    else withoutEmployer.push(j.workbcId)
  }
  // No Employer row to hold a verdict, so these are scored with no employer check, as judge.ts does.
  if (withoutEmployer.length > 0) await scorePostings(withoutEmployer, {})
  for (const [employerId, workbcIds] of cachedByEmployer) {
    try {
      const pending = await prisma.job.findMany({ where: { employerId, status: "PENDING" }, include: { employer: true } })
      const [plan] = planByEmployer(pending)
      if (!plan || plan.action === "web") continue
      const employer = pending[0].employer
      let checks = (employer?.checks as Record<string, unknown> | null) ?? {}
      if (plan.action === "presume") {
        const web = presumedVerdict(employer?.nameDisplay ?? null, pending)
        checks = dryRun || !employer ? { ...checks, web } : (await storeEmployerWeb(employer, web)).checks
      }
      await scorePostings(workbcIds, checks)
    } catch (err) {
      skipped++
      console.error(`  skip (cached): employer ${employerId} - ${(err as Error).message.slice(0, 100)}`)
    }
  }

  const deepServiced = [...deepNamed].filter((id) => (dryRun ? scored : rescored).has(id))
  deepResolved = deepServiced.length
  if (!dryRun && deepServiced.length > 0) {
    await prisma.judgeRequest.updateMany({
      where: { kind: "deep", workbcId: { in: deepServiced }, resolvedAt: null },
      data: { resolvedAt: new Date() },
    })
  }

  console.log(
    `[judge-keyless:apply]${dryRun ? " DRY RUN, nothing written:" : ""} ${dryRun ? "would score" : "scored"} ${applied} postings, ` +
      `skipped ${skipped}, rejected by the tier rule ${tierRejected}, ` +
      `deep requests ${dryRun ? "it would resolve" : "resolved"} ${deepResolved} | ` +
      `bands: ${JSON.stringify(bands)} | Jev input tokens ${tokens}`,
  )
  console.log(
    `[judge-keyless:apply] impersonation: ${impostors} postings${dryRun ? " would be" : ""} re-attributed and written high, ` +
      `${keptImpostors} confirmed impersonations kept, ${cleared.size} cleared, ${heldForImpersonation.size} held pending for a missing impersonation result, ` +
      `${heldForAddress.size} held for a mailing address their employer's verdict was not shown | ` +
      `${withoutSearchLog} verdicts arrived without a searchLog, ${newerKept} not stored because the employer has a newer verdict`,
  )
  if ((applied > 0 || keptImpostors > 0) && !dryRun) await requestRevalidation()
  if (run) {
    await settleRequests("[judge-keyless:apply]")
    recordApplied(workFiles, run.id)
    const outcome = await finishJudgeRun(run.id, {
      pendingAtStart: run.pendingAtStart,
      scored: applied + keptImpostors,
      held: heldForImpersonation.size + heldForAddress.size,
      failed: skipped + tierRejected,
    })
    console.log(`[judge-keyless:apply] run ${run.id}: ${outcome}`)
    if (outcome === "FAILED") process.exitCode = 1
  }
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error("FATAL:", e)
  if (runId) await failJudgeRun(runId, e).catch((err) => console.error(`[judge-keyless:apply] could not record the failure: ${(err as Error).message}`))
  process.exit(1)
})
