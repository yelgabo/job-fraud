// Whether an employer needs a fresh web check, given its pending postings and cached verdict.
// Both judge paths act on this (judge.ts, and judge-keyless-fetch/-apply through planByEmployer),
// and compare-verifiers uses it so a model comparison runs on the employers a real run would check.

import type { WebVerification } from "../shared/json-schemas"
import { cachedVerdictMissedAnAddress, mailEvidence, pickRepresentative } from "../shared/mail-evidence"
import { tierViolation } from "../ai/verify-employer-web"
import { allApplyHostsMatch, matchedProvider } from "./apply-host"

export type VerificationAction = "web" | "presume" | "reuse"

export function verificationAction(
  employerName: string | null,
  postings: Array<{ externalApplyUrl: string | null; applicationFlags: unknown }>,
  cachedWeb: WebVerification | undefined,
  opts: { rejudge?: boolean } = {},
): VerificationAction {
  if (opts.rejudge) return "web"
  const allMatch = allApplyHostsMatch(employerName, postings.map((p) => p.externalApplyUrl))
  if (!cachedWeb) return allMatch ? "presume" : "web"
  const staleAts = cachedWeb.source === "ats-tenant-match" && !allMatch
  // A cached "none" only means the representative posting we sent last time carried no
  // mailing address. If any posting does, the address has never actually been looked at.
  const missedAddress = cachedVerdictMissedAnAddress(cachedWeb.applicationAddressType, postings)
  // Verdicts stored before the tiered check can raise a rating with no escalation
  // model behind them; on the first 73 re-checked, Opus overturned 47.
  const unconfirmed = tierViolation(cachedWeb, mailEvidence(pickRepresentative(postings).applicationFlags)) !== null
  return staleAts || missedAddress || unconfirmed ? "web" : "reuse"
}

/** The verdict written, without a web search, for an employer verificationAction() presumes. */
export function presumedVerdict(
  employerName: string | null,
  postings: Array<{ externalApplyUrl: string | null }>,
): WebVerification {
  const provider = matchedProvider(employerName, postings.map((p) => p.externalApplyUrl)) ?? "ATS"
  return {
    websiteUrl: null,
    websiteReachable: "unknown",
    businessMatch: "match",
    locationMatch: "uncertain",
    hasJobsListing: "unknown",
    applicationAddressType: "none",
    confidence: 0.8,
    summary: `Presumed legitimate without web search: all postings apply via the company's own matching ${provider} tenant.`,
    source: "ats-tenant-match",
  }
}

type PlannedJob = {
  workbcId: string
  employerId: string | null
  externalApplyUrl: string | null
  applicationFlags: unknown
  employer: { nameDisplay: string; checks: unknown } | null
}

export type EmployerPlan<J extends PlannedJob> = {
  employerId: string | null
  action: VerificationAction
  /** The posting the verifier is shown: one that carries a mailing address when any does. */
  representative: J
  postings: J[]
}

/**
 * Groups pending postings by employer and decides each employer once. A posting with no employer
 * is its own group and always needs a check, since there is no cached verdict to reuse.
 */
export function planByEmployer<J extends PlannedJob>(jobs: J[]): EmployerPlan<J>[] {
  const groups = new Map<string, J[]>()
  for (const j of jobs) {
    const key = j.employerId ?? `posting:${j.workbcId}`
    groups.set(key, [...(groups.get(key) ?? []), j])
  }
  return [...groups.values()].map((list) => {
    const emp = list[0].employer
    const cached = (emp?.checks as { web?: WebVerification } | null | undefined)?.web
    return {
      employerId: list[0].employerId,
      action: emp ? verificationAction(emp.nameDisplay, list, cached) : "web",
      representative: pickRepresentative(list),
      postings: list,
    }
  })
}

