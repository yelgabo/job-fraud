// Glue between the deterministic apply-host check and the Claude web-check, plus the DB side effects
// (re-attribution + deterministic high score) when a posting is confirmed to impersonate a brand.
// Shared by scripts/rescan-impersonation.ts (corpus sweep) and scripts/judge.ts (ongoing).
import type Anthropic from "@anthropic-ai/sdk"
import type { JobStatus, VerdictKind } from "@prisma/client"
import { prisma } from "../db"
import { normalizeEmployer } from "../signals/normalize-employer"
import { tenantEmployerMatch } from "../signals/apply-host"
import { impersonationKey } from "../signals/impersonation-plan"
import { checkImpersonation, ImpersonationSchema, type ImpersonationResult } from "./check-impersonation"
import { parseFlags } from "../shared/json-schemas"
import { bandFor } from "../shared/risk-band"
import { findOrCreateEmployer } from "../shared/find-or-create-employer"
import { republishVerdict, writeImpersonationVerdict } from "../scoring/write-verdict"

// Since 2026-11-08 the prefix only feeds the status backfill (lib/scoring/derive-status.ts);
// everything else reads Job.verdictKind.
const IMPERSONATION_PREFIX = "Brand impersonation:"
export const isImpersonationVerdict = (reasoning: string | null) => reasoning?.startsWith(IMPERSONATION_PREFIX) ?? false

/**
 * For the judges: true when the posting carries a confirmed impersonation and must not be
 * composed. After re-attribution the apply-host check compares the tenant with the real company
 * and stops firing, so composing would replace the 90 with an ordinary score. A rerun request
 * sends the posting back to pending, which takes it off the site; the claimed employer's name is not
 * stored, so the check cannot be redone, and the confirmed verdict is republished unchanged.
 */
export async function keepImpersonationVerdict(
  job: { workbcId: string; verdictKind: VerdictKind | null; status: JobStatus },
  dryRun = false,
): Promise<boolean> {
  if (job.verdictKind !== "IMPERSONATION") return false
  if (job.status === "PENDING" && !dryRun) await republishVerdict(job.workbcId)
  return true
}

export type JobForCheck = {
  workbcId: string
  title: string
  externalApplyUrl: string | null
  applicationFlags: unknown
}

export type ApplyHostOutcome =
  | { kind: "no-check" } // no recognized tenant, or tenant matches the employer
  | { kind: "cleared"; relationship: "same" | "affiliate"; realCompany: string | null }
  | { kind: "uncertain"; summary: string; applicationFlags: unknown }
  | { kind: "impersonation"; realCompany: string; newEmployerId: string; summary: string }

/** A saved answer for this claimed employer and tenant pair, or null (see ImpersonationAnswer). */
export async function savedImpersonationAnswer(key: string): Promise<ImpersonationResult | null> {
  const row = await prisma.impersonationAnswer.findUnique({ where: { key } })
  const parsed = row ? ImpersonationSchema.safeParse(row.verdict) : null
  return parsed?.success ? parsed.data : null
}

export async function saveImpersonationAnswer(key: string, verdict: ImpersonationResult): Promise<void> {
  await prisma.impersonationAnswer.upsert({
    where: { key },
    create: { key, verdict: verdict as never },
    update: { verdict: verdict as never, decidedAt: new Date() },
  })
}

// One check per pair at a time. Postings of the same pair run concurrently in the judge, and a
// cache filled only after the await let each of them pay for its own Opus call. The search log
// goes to the first posting that takes it, so it is stored once.
type Pending = { answer: Promise<{ verdict: ImpersonationResult; searchLog?: SearchLogRow }>; logTaken: boolean }
const inflight = new Map<string, Pending>()

function titleCaseSlug(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ")
}

async function mergeFlag(job: JobForCheck, flag: string, evidence: string): Promise<unknown> {
  const flags = parseFlags(job.applicationFlags)
  if (flags.some((f) => f.flag === flag)) return job.applicationFlags
  flags.push({ flag, evidence })
  await prisma.job.update({ where: { workbcId: job.workbcId }, data: { applicationFlags: flags as never } })
  return flags
}

// Runs the full apply-host resolution for one job. On "impersonation" it performs the DB writes
// (re-attribute to the real company, write a deterministic HIGH score + flag, log the search trail)
// and the caller should NOT score the job again. Other outcomes leave scoring to the caller.
export async function resolveApplyHost(
  client: Anthropic,
  job: JobForCheck,
  employerName: string | null,
): Promise<ApplyHostOutcome> {
  const m = tenantEmployerMatch(employerName, job.externalApplyUrl)
  if (m.result !== "mismatch" || !m.tenant || !employerName) return { kind: "no-check" }

  const key = impersonationKey(employerName, m.tenant)
  let pending = inflight.get(key)
  if (!pending) {
    const tenant = m.tenant
    const entry: Pending = {
      logTaken: false,
      answer: (async () => {
        const saved = await savedImpersonationAnswer(key)
        if (saved) return { verdict: saved }
        const out = await checkImpersonation(client, {
          claimedEmployer: employerName,
          tenant,
          provider: m.provider ?? "",
          applyUrl: job.externalApplyUrl!,
          jobTitle: job.title,
        })
        await saveImpersonationAnswer(key, out.result)
        return { verdict: out.result, searchLog: out.searchLog }
      })(),
    }
    // A failed check is retried by the next posting of the pair, not cached as a failure.
    entry.answer.catch(() => inflight.delete(key))
    inflight.set(key, entry)
    pending = entry
  }
  const { verdict, searchLog: log } = await pending.answer
  const searchLog = pending.logTaken ? undefined : log
  pending.logTaken = true
  return applyImpersonationVerdict(job, employerName, { tenant: m.tenant, provider: m.provider }, verdict, searchLog)
}

export type SearchLogRow = { queries: unknown[]; blocks: unknown[] }

/**
 * The DB side of an impersonation verdict, whoever produced it: the API check above, or an Opus
 * helper agent on the keyless path (scripts/judge-keyless-apply.ts). `searchLog` is stored on the
 * real company when the posting is re-attributed.
 */
export async function applyImpersonationVerdict(
  job: JobForCheck,
  employerName: string,
  m: { tenant: string; provider?: string },
  verdict: ImpersonationResult,
  searchLog?: SearchLogRow,
): Promise<ApplyHostOutcome> {
  if (verdict.relationship === "same" || verdict.relationship === "affiliate") {
    return { kind: "cleared", relationship: verdict.relationship, realCompany: verdict.realCompany }
  }
  if (verdict.relationship === "uncertain") {
    const applicationFlags = await mergeFlag(
      job,
      "apply_host_mismatch_review",
      `Applies via "${m.tenant}" (${m.provider}); relationship to "${employerName}" uncertain — needs review`,
    )
    return { kind: "uncertain", summary: verdict.summary, applicationFlags }
  }

  // relationship === "impersonation". Guard against the model contradicting itself
  // (realCompany resolving back to the claimed employer).
  if (verdict.realCompany && normalizeEmployer(verdict.realCompany) === normalizeEmployer(employerName)) {
    return { kind: "cleared", relationship: "same", realCompany: verdict.realCompany }
  }

  const displayName = verdict.realCompany || titleCaseSlug(m.tenant)
  const realEmployerId = await findOrCreateEmployer(displayName)
  if (!realEmployerId) throw new Error(`real company "${displayName}" has no usable name`)

  if (searchLog) {
    await prisma.employerWebSearchLog.create({
      data: { employerId: realEmployerId, queries: searchLog.queries as never, blocks: searchLog.blocks as never },
    })
  }

  const flags = parseFlags(job.applicationFlags)
  if (!flags.some((f) => f.flag === "apply_host_mismatch")) {
    flags.push({
      flag: "apply_host_mismatch",
      evidence: `Posting names "${employerName}" but applies via "${m.tenant}" (${displayName})'s ${m.provider} ATS`,
    })
  }
  const score = 90
  const reasoning = `${IMPERSONATION_PREFIX} this posting presents as "${employerName}" but its application link routes to ${displayName}'s ${m.provider} hiring system (tenant "${m.tenant}"), an unrelated company. Re-attributed to ${displayName}. ${verdict.summary}`
  const signals = [
    {
      label: "apply_host_mismatch",
      weight: 35,
      evidence: `Claims "${employerName}" but applies via "${m.tenant}" (${displayName})'s ${m.provider} ATS — brand misuse`,
    },
  ]
  await writeImpersonationVerdict(job.workbcId, {
    employerId: realEmployerId,
    applicationFlags: flags as never,
    fraudScore: score,
    riskBand: bandFor(score),
    reasoning,
    signals: signals as never,
  })

  return { kind: "impersonation", realCompany: displayName, newEmployerId: realEmployerId, summary: verdict.summary }
}
