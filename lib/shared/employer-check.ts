import type { WebVerification } from "./json-schemas"

type Sourced = Pick<WebVerification, "source"> | null | undefined

/**
 * A presumption (lib/signals/verification-plan.ts presumedVerdict) always says businessMatch
 * "match", but no web search ran, so a reader that shows or counts that "match" as a check
 * overstates what was done. Every reader of checks.web asks this first.
 */
export function isPresumed(web: Sourced): boolean {
  return web?.source === "ats-tenant-match"
}

export type EmployerCheckKind = "none" | "presumed" | "web"

export function employerCheckKind(web: Sourced): EmployerCheckKind {
  if (!web) return "none"
  return isPresumed(web) ? "presumed" : "web"
}

export const PRESUMED_LABEL = "presumed real (own hiring system)"

/** The one-cell summary on /companies; null when the employer has no verdict. */
export function employerCheckLabel(web: Pick<WebVerification, "source" | "businessMatch"> | null | undefined): string | null {
  if (!web) return null
  if (isPresumed(web)) return PRESUMED_LABEL
  if (web.businessMatch === "mismatch") return "⚠ business mismatch"
  if (web.businessMatch === "match") return "✓ verified"
  return "uncertain"
}

export type EmployerCheckTally = { webChecked: number; webMismatch: number; presumed: number }

export function tallyEmployerChecks(
  webs: Iterable<Pick<WebVerification, "source" | "businessMatch"> | null | undefined>,
): EmployerCheckTally {
  const t: EmployerCheckTally = { webChecked: 0, webMismatch: 0, presumed: 0 }
  for (const web of webs) {
    if (!web) continue
    if (isPresumed(web)) {
      t.presumed++
      continue
    }
    t.webChecked++
    if (web.businessMatch === "mismatch") t.webMismatch++
  }
  return t
}
