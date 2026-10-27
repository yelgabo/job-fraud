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
// Run: npm run judge-keyless:apply -- [--dry-run] <logs/judge-<ts>/ | verdicts.json | cached.json> [...]
// --dry-run validates and plans everything, then writes nothing and asks Jev nothing.
import { readFileSync, readdirSync, statSync } from "node:fs"
import { basename, join } from "node:path"
import { z } from "zod"
import { prisma } from "../lib/db"
import { WebVerificationSchema } from "../lib/shared/json-schemas"
import { jevClientFromEnv } from "../lib/ai/jev-judgments"
import { tierViolation } from "../lib/ai/verify-employer-web"
import { mailEvidence } from "../lib/shared/mail-evidence"
import { buildVerdict } from "../lib/scoring/verdict"
import { planByEmployer, presumedVerdict } from "../lib/signals/verification-plan"
import { requestRevalidation } from "../lib/shared/request-revalidation"

/** A dir contributes its verdicts*.json, its cached.json, and its batch-*.json (for the posting lists). */
function resolveFiles(args: string[]) {
  const verdictFiles: string[] = []
  const cachedFiles: string[] = []
  const batchFiles: string[] = []
  const add = (f: string) => {
    const b = basename(f)
    if (b === "cached.json") cachedFiles.push(f)
    else if (/^batch-.*\.json$/i.test(b)) batchFiles.push(f)
    else verdictFiles.push(f)
  }
  for (const a of args) {
    if (statSync(a).isDirectory()) {
      for (const f of readdirSync(a)) if (/verdicts.*\.json$|^batch-.*\.json$|^cached\.json$/i.test(f)) add(join(a, f))
    } else add(a)
  }
  return { verdictFiles, cachedFiles, batchFiles }
}

// Anything else an agent returns (a fraudScore, signals, prose) is dropped here: the score is
// composed, never copied. Older verdict files therefore still apply, minus their numbers.
export const VerdictSchema = z.object({
  workbcId: z.string(),
  web: WebVerificationSchema.optional(),
})

const readJsonArray = (f: string): unknown[] => {
  const raw = JSON.parse(readFileSync(f, "utf8"))
  return Array.isArray(raw) ? raw : [raw]
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run")
  if (args.length === 0) {
    console.error("usage: npm run judge-keyless:apply -- [--dry-run] <logs/judge-<ts>/ | verdicts.json | cached.json> [...]")
    process.exit(1)
  }
  const { verdictFiles, cachedFiles, batchFiles } = resolveFiles(args)
  const verdicts = verdictFiles.flatMap(readJsonArray)
  const cachedEntries = cachedFiles.flatMap(readJsonArray) as Array<{ workbcId: string }>
  // The fetch's posting list per employer, keyed by the representative posting the verdict names.
  // Without the batch files a verdict scores only the posting it names.
  const postingsFor = new Map<string, string[]>()
  for (const item of batchFiles.flatMap(readJsonArray) as Array<{ workbcId: string; employerPostings?: string[] }>) {
    postingsFor.set(item.workbcId, item.employerPostings ?? [item.workbcId])
  }
  const jev = jevClientFromEnv()
  console.log(
    `[judge-keyless:apply]${dryRun ? " DRY RUN:" : ""} ${verdicts.length} verdicts, ${cachedEntries.length} cached-verdict postings ` +
      `(${jev ? "Jev + composer" : "composer only, no TYPESAFE_API_KEY"})`,
  )

  let applied = 0
  let skipped = 0
  let tierRejected = 0
  let tokens = 0
  const bands: Record<string, number> = {}
  const scored = new Set<string>()

  async function score(job: Parameters<typeof buildVerdict>[1] & { workbcId: string }, checks: unknown) {
    scored.add(job.workbcId)
    if (dryRun) {
      applied++
      return
    }
    const { usage, ...data } = await buildVerdict(jev, job, checks)
    tokens += usage.inputTokens
    await prisma.job.update({ where: { workbcId: job.workbcId }, data })
    applied++
    bands[data.riskBand] = (bands[data.riskBand] ?? 0) + 1
  }

  /** Scores the listed postings that are still pending and not yet scored in this run. */
  async function scorePostings(workbcIds: string[], checks: unknown) {
    const ids = workbcIds.filter((id) => !scored.has(id))
    const pending = await prisma.job.findMany({ where: { workbcId: { in: ids }, scoredAt: null }, include: { employer: true } })
    for (const j of pending) await score({ ...j, employerName: j.employer?.nameDisplay ?? null }, checks)
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
      let checks = (job.employer?.checks as Record<string, unknown> | null) ?? {}
      if (d.web && job.employerId) {
        checks = { ...checks, web: d.web }
        if (!dryRun) await prisma.employer.update({ where: { id: job.employerId }, data: { checks: checks as never, checkedAt: new Date() } })
      }
      await scorePostings(d.web ? (postingsFor.get(d.workbcId) ?? [d.workbcId]) : [d.workbcId], checks)
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
  for (const j of cachedJobs) {
    if (j.employerId) cachedByEmployer.set(j.employerId, [...(cachedByEmployer.get(j.employerId) ?? []), j.workbcId])
  }
  for (const [employerId, workbcIds] of cachedByEmployer) {
    try {
      const pending = await prisma.job.findMany({ where: { employerId, scoredAt: null }, include: { employer: true } })
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
      `skipped ${skipped}, rejected by the tier rule ${tierRejected} | bands: ${JSON.stringify(bands)} | Jev input tokens ${tokens}`,
  )
  if (applied > 0 && !dryRun) await requestRevalidation()
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
