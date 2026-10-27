// Whether an employer needs a fresh web check, given its pending postings and cached verdict.
// judge.ts acts on this; compare-verifiers uses it so a model comparison runs on exactly the
// employers a real judge run would send to the verifier.

import type { WebVerification } from "../shared/json-schemas"
import { cachedVerdictMissedAnAddress } from "../shared/mail-evidence"
import { allApplyHostsMatch } from "./apply-host"

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
  return staleAts || missedAddress ? "web" : "reuse"
}
