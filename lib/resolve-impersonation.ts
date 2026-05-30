// Glue between the deterministic apply-host check and the Claude web-check, plus the DB side effects
// (re-attribution + deterministic high score) when a posting is confirmed to impersonate a brand.
// Shared by scripts/rescan-impersonation.ts (corpus sweep) and scripts/judge.ts (ongoing).
import type Anthropic from "@anthropic-ai/sdk"
import { prisma } from "./db"
import { normalizeEmployer } from "./normalize-employer"
import { tenantEmployerMatch } from "./apply-host"
import { checkImpersonation, type ImpersonationResult } from "./check-impersonation"
import { parseFlags } from "./json-schemas"
import { bandFor } from "./risk-band"

export type JobForCheck = {
  workbcId: string
  title: string
  externalApplyUrl: string | null
  applicationFlags: unknown
}

export type ApplyHostOutcome =
  | { kind: "no-check" } // no recognized tenant, or tenant matches the employer
  | { kind: "cleared"; relationship: "same" | "affiliate"; realCompany: string | null }
  | { kind: "uncertain"; summary: string }
  | { kind: "impersonation"; realCompany: string; newEmployerId: string; summary: string }

// Cache web-check verdicts per (employer, tenant) pair so a repeated impersonation pattern across
// many postings costs one search, not N. Process-scoped (judge/rescan are single-process runs).
const verdictCache = new Map<string, ImpersonationResult>()

function titleCaseSlug(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ")
}

async function mergeFlag(job: JobForCheck, flag: string, evidence: string): Promise<void> {
  const flags = parseFlags(job.applicationFlags)
  if (flags.some((f) => f.flag === flag)) return
  flags.push({ flag, evidence })
  await prisma.job.update({ where: { workbcId: job.workbcId }, data: { applicationFlags: flags as never } })
}

// Find-or-create an employer by normalized name, tolerant of a concurrent creator (unique race).
async function upsertEmployer(displayName: string): Promise<string> {
  const nameNormalized = normalizeEmployer(displayName)
  const existing = await prisma.employer.findUnique({ where: { nameNormalized } })
  if (existing) return existing.id
  try {
    const created = await prisma.employer.create({ data: { nameNormalized, nameDisplay: displayName } })
    return created.id
  } catch {
    const again = await prisma.employer.findUnique({ where: { nameNormalized } })
    if (again) return again.id
    throw new Error(`could not upsert employer "${displayName}"`)
  }
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

  const key = `${normalizeEmployer(employerName)}|${m.tenant}`
  let verdict = verdictCache.get(key)
  let searchLog: { queries: string[]; blocks: unknown[] } | undefined
  if (!verdict) {
    const out = await checkImpersonation(client, {
      claimedEmployer: employerName,
      tenant: m.tenant,
      provider: m.provider ?? "",
      applyUrl: job.externalApplyUrl!,
      jobTitle: job.title,
    })
    verdict = out.result
    searchLog = out.searchLog
    verdictCache.set(key, verdict)
  }

  if (verdict.relationship === "same" || verdict.relationship === "affiliate") {
    return { kind: "cleared", relationship: verdict.relationship, realCompany: verdict.realCompany }
  }
  if (verdict.relationship === "uncertain") {
    await mergeFlag(
      job,
      "apply_host_mismatch_review",
      `Applies via "${m.tenant}" (${m.provider}); relationship to "${employerName}" uncertain — needs review`,
    )
    return { kind: "uncertain", summary: verdict.summary }
  }

  // relationship === "impersonation". Guard against the model contradicting itself
  // (realCompany resolving back to the claimed employer).
  if (verdict.realCompany && normalizeEmployer(verdict.realCompany) === normalizeEmployer(employerName)) {
    return { kind: "cleared", relationship: "same", realCompany: verdict.realCompany }
  }

  const displayName = verdict.realCompany || titleCaseSlug(m.tenant)
  const realEmployerId = await upsertEmployer(displayName)

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
  const reasoning = `Brand impersonation: this posting presents as "${employerName}" but its application link routes to ${displayName}'s ${m.provider} hiring system (tenant "${m.tenant}"), an unrelated company. Re-attributed to ${displayName}. ${verdict.summary}`
  const signals = [
    {
      label: "apply_host_mismatch",
      weight: 35,
      evidence: `Claims "${employerName}" but applies via "${m.tenant}" (${displayName})'s ${m.provider} ATS — brand misuse`,
    },
  ]
  await prisma.job.update({
    where: { workbcId: job.workbcId },
    data: {
      employerId: realEmployerId,
      applicationFlags: flags as never,
      fraudScore: score,
      riskBand: bandFor(score),
      reasoning,
      signals: signals as never,
      scoredAt: new Date(),
    },
  })

  return { kind: "impersonation", realCompany: displayName, newEmployerId: realEmployerId, summary: verdict.summary }
}
