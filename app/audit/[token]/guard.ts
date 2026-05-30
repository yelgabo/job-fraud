import { notFound } from "next/navigation"
import { webEnv } from "@/lib/env"

// Gate for the unlinked /audit/<token> pages. Denies (404) unless AUDIT_TOKEN is configured AND
// the URL segment matches it exactly. Security-by-obscurity only — there is no auth beyond this.
export function requireAuditToken(token: string): void {
  if (!webEnv.AUDIT_TOKEN || token !== webEnv.AUDIT_TOKEN) notFound()
}
