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
// a dir that was already applied or has no manifest.json.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { prisma } from "../lib/db"
import { ImpersonationResultSchema, VerdictSchema } from "../lib/shared/keyless-verdict"
import { jevClientFromEnv } from "../lib/ai/jev-judgments"
import { tierViolation } from "../lib/ai/verify-employer-web"
import { addressKey, addressUnchecked, mailEvidence } from "../lib/shared/mail-evidence"
import { finishJudgeRun, startJudgeRun } from "../lib/shared/judge-run"
import { settleRequests } from "../lib/shared/judge-requests"
import { buildVerdict } from "../lib/scoring/verdict"
import { writeComposedVerdict } from "../lib/scoring/write-verdict"
import type { JobStatus, VerdictKind } from "@prisma/client"
import { planByEmployer, presumedVerdict } from "../lib/signals/verification-plan"
import { requestRevalidation } from "../lib/shared/request-revalidation"
import { scoreableWhere } from "../lib/shared/deep-requests"
import { agentSearchLogRow } from "../lib/shared/agent-search-log"
import { applyImpersonationVerdict, keepImpersonationVerdict } from "../lib/ai/resolve-impersonation"
import { impersonationCheckFor, type ImpersonationItem } from "../lib/signals/impersonation-plan"

/**
 * A dir contributes its verdicts*.json, cached.json, batch-NNN.json (for the posting lists),
 * impersonation-NNN.json (the check items) and impersonation-result*.json (the helpers' answers),
 * in numeric order (verdicts-2 before verdicts-10). Any other file is ignored. A file named on the
 * command line that matches none of those is read as verdicts.
 */
function resolveFiles(args: string[]) {
  const verdictFiles: string[] = []
  const cachedFiles: string[] = []
  const batchFiles: string[] = []
  const impersonationItemFiles: string[] = []
  const impersonationResultFiles: string[] = []
  const dirs = new Set<string>()
  const add = (f: string, explicit: boolean) => {
    const b = basename(f)
    if (b === "cached.json") cachedFiles.push(f)
    else if (/^batch-\d+\.json$/i.test(b)) batchFiles.push(f)
    else if (/^impersonation-result.*\.json$/i.test(b)) impersonationResultFiles.push(f)
    else if (/^impersonation-\d+\.json$/i.test(b)) impersonationItemFiles.push(f)
    else if (explicit || /^verdicts.*\.json$/i.test(b)) verdictFiles.push(f)
  }
  for (const a of args) {
    if (statSync(a).isDirectory()) {
      dirs.add(a)
      const names = readdirSync(a).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
      for (const f of names) add(join(a, f), false)
    } else {
      dirs.add(dirname(a))
      add(a, true)
    }
  }
  return { verdictFiles, cachedFiles, batchFiles, impersonationItemFiles, impersonationResultFiles, dirs: [...dirs] }
}

/**
 * The fetch time the run's verdicts were researched against, from each dir's manifest.json. A dir
 * already applied, or one with no manifest, is refused unless --force: applying twice duplicated
 * every search log, and an old dir overwrote verdicts written since.
 */
function fetchedAtOf(dirs: string[], force: boolean): Date | null {
  let earliest: Date | null = null
  for (const d of dirs) {
    const applied = join(d, "applied.json")
    if (existsSync(applied) && !force) {
      throw new Error(`${d} was already applied (${applied}); pass --force to apply it again`)
    }
    const manifest = join(d, "manifest.json")
    if (!existsSync(manifest)) {
      if (force) continue
      throw new Error(`${d} has no manifest.json (fetched before 2026-11-08?); pass --force to apply it anyway`)
    }
    const at = new Date((JSON.parse(readFileSync(manifest, "utf8")) as { fetchedAt: string }).fetchedAt)
    if (!earliest || at < earliest) earliest = at
  }
  return earliest
}

const readJsonArray = (f: string): unknown[] => {
  const raw = JSON.parse(readFileSync(f, "utf8"))
  return Array.isArray(raw) ? raw : [raw]
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const force = process.argv.includes("--force")
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run" && a !== "--force")
  if (args.length === 0) {
    console.error("usage: npm run judge-keyless:apply -- [--dry-run] [--force] <logs/judge-<ts>/ | verdicts.json | cached.json> [...]")
    process.exit(1)
  }
  const { verdictFiles, cachedFiles, batchFiles, impersonationItemFiles, impersonationResultFiles, dirs } = resolveFiles(args)
  const fetchedAt = fetchedAtOf(dirs, force)
  const verdicts = verdictFiles.flatMap(readJsonArray)
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

  const run = dryRun ? null : await startJudgeRun("KEYLESS")
  const openDeep = await prisma.judgeRequest.findMany({ where: { kind: "deep", resolvedAt: null }, select: { workbcId: true } })
  const openDeepIds = new Set(openDeep.map((r) => r.workbcId))
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
      if (!heldForImpersonation.has(job.workbcId)) {
        heldForImpersonation.add(job.workbcId)
        console.error(`  held (no impersonation result): ${job.workbcId} checkKey=${check.checkKey}`)
      }
      return
    }
    scored.add(job.workbcId)
    if (dryRun) {
      applied++
      return
    }
    const { usage, ...data } = await buildVerdict(jev, job, checks)
    tokens += usage.inputTokens
    if (!(await writeComposedVerdict(job.workbcId, data, "judgment"))) {
      keptImpostors++
      return
    }
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

  for (const v of verdicts) {
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
        checks = { ...checks, web: { ...d.web, addressChecked: addressKey(job.applicationFlags) } }
        if (!dryRun) await prisma.employer.update({ where: { id: employer.id }, data: { checks: checks as never, checkedAt: new Date() } })
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
      // for, so it services the request once that posting has been scored.
      if (openDeepIds.has(d.workbcId) && scored.has(d.workbcId)) {
        if (!dryRun) {
          await prisma.judgeRequest.updateMany({
            where: { kind: "deep", workbcId: d.workbcId, resolvedAt: null },
            data: { resolvedAt: new Date() },
          })
        }
        deepResolved++
      }
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
        checks = { ...checks, web: presumedVerdict(employer?.nameDisplay ?? null, pending) }
        if (!dryRun) await prisma.employer.update({ where: { id: employerId }, data: { checks: checks as never, checkedAt: new Date() } })
      }
      await scorePostings(workbcIds, checks)
    } catch (err) {
      skipped++
      console.error(`  skip (cached): employer ${employerId} - ${(err as Error).message.slice(0, 100)}`)
    }
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
    for (const d of dirs) writeFileSync(join(d, "applied.json"), JSON.stringify({ appliedAt: new Date().toISOString(), run: run.id }, null, 2), "utf8")
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

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
