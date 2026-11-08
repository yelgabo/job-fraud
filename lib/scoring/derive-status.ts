// What status and verdictKind a row's older fields imply. scripts/backfill-status.ts uses it to
// fill the columns and, run again, to prove nothing disagrees with them.
import type { JobStatus, VerdictKind } from "@prisma/client"
import { isImpersonationVerdict } from "../ai/resolve-impersonation"

export type LegacyVerdictFields = {
  scoredAt: Date | null
  scoringVersion: number | null
  fraudScore: number | null
  reasoning: string | null
}

export function deriveStatus(row: LegacyVerdictFields): { status: JobStatus; verdictKind: VerdictKind | null } {
  const status: JobStatus = row.scoredAt ? "PUBLISHED" : "PENDING"
  // Checked before scoringVersion: rows written before the impersonation write cleared
  // scoringVersion can carry both.
  if (isImpersonationVerdict(row.reasoning)) return { status, verdictKind: "IMPERSONATION" }
  if (row.scoringVersion !== null) return { status, verdictKind: "COMPOSED" }
  // A pending row sent back by a rerun keeps its old verdict, so this is not tied to scoredAt.
  if (row.fraudScore !== null) return { status, verdictKind: "MODEL" }
  return { status, verdictKind: null }
}
