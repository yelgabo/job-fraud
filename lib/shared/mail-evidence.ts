// Which of an employer's postings should stand in for it at web-verification time.
//
// The employer web check runs once per employer on one representative posting, and
// `applicationAddressType` is the heaviest signal it produces. That verdict can only be as good
// as the address the representative happens to carry: a posting with no mailing address tells
// the verifier "(none given)", and it correctly answers "none" for the whole employer, including
// the sibling posting that does mail applicants to a house.

import { parseFlags } from "./json-schemas"

/** The mailing address a posting asks applicants to use, or "" when it asks for none. */
export function mailEvidence(flagsJson: unknown): string {
  return parseFlags(flagsJson).find((f) => f.flag === "mail_physical_resume")?.evidence ?? ""
}

export function hasMailAddress(flagsJson: unknown): boolean {
  return mailEvidence(flagsJson) !== ""
}

/**
 * Pick the posting to verify the employer with: the first that carries a mailing address,
 * otherwise the first overall. Order is otherwise preserved, so an employer whose postings all
 * apply online is unaffected.
 */
export function pickRepresentative<T extends { applicationFlags: unknown }>(postings: T[]): T {
  return postings.find((p) => hasMailAddress(p.applicationFlags)) ?? postings[0]
}

/**
 * Whether a cached verdict of "none" is contradicted by a posting that does give an address.
 * Without this the miss is permanent: the verdict is reused on every later run, so an employer
 * only ever gets one chance to have its address looked at.
 */
export function cachedVerdictMissedAnAddress(
  cachedAddressType: string | undefined,
  postings: Array<{ applicationFlags: unknown }>,
): boolean {
  return cachedAddressType === "none" && postings.some((p) => hasMailAddress(p.applicationFlags))
}
