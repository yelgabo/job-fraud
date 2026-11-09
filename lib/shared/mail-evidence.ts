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

/** A posting's mailing address in a form that compares equal across postings; "" for none. */
export function addressKey(flagsJson: unknown): string {
  return mailEvidence(flagsJson).toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * Whether a verdict leaves this posting's mailing address unchecked. The verdict's
 * applicationAddressType describes only the address it was shown (`addressChecked`), so a posting
 * that mails somewhere else is unchecked even when the employer is. A verdict stored before
 * addressChecked existed counts any address as unchecked, which re-checks it once and records one.
 */
export function addressUnchecked(web: { addressChecked?: string }, flagsJson: unknown): boolean {
  const key = addressKey(flagsJson)
  return key !== "" && web.addressChecked !== key
}

/**
 * Whether a cached verdict missed an address one of these postings gives. Without this the miss is
 * permanent: the verdict is reused on every later run, so an employer only ever gets one chance to
 * have its address looked at, and a second address never does.
 */
export function cachedVerdictMissedAnAddress(
  cachedWeb: { addressChecked?: string },
  postings: Array<{ applicationFlags: unknown }>,
): boolean {
  return postings.some((p) => addressUnchecked(cachedWeb, p.applicationFlags))
}
