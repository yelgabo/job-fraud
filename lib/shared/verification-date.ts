import type { WebVerification } from "./json-schemas"

/**
 * The dated line under an employer's verdict. Employer.checkedAt is when a verdict was stored,
 * which for a presumed verdict, or a keyless file applied later, is not when anyone checked.
 * web.verifiedAt is the research time, recorded only on web checks stored from 2026-11-09.
 */
export function verificationDateText(
  web: Pick<WebVerification, "source" | "verifiedAt"> | null | undefined,
  checkedAt: Date | null | undefined,
  formatDate: (d: Date) => string,
): string | null {
  if (web?.source === "ats-tenant-match") {
    const on = checkedAt ? ` on ${formatDate(checkedAt)}` : ""
    return `Presumed real${on} because every posting applies through the employer's own account on a recognized hiring system; no web check was made`
  }
  const verifiedAt = web?.verifiedAt ? new Date(web.verifiedAt) : null
  if (verifiedAt && !Number.isNaN(verifiedAt.getTime())) return `Web-checked ${formatDate(verifiedAt)}`
  return checkedAt ? `Verdict recorded ${formatDate(checkedAt)}` : null
}
