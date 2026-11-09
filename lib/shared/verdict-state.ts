import type { Job } from "@prisma/client"

export type VerdictState = "published" | "withheld" | "unjudged"

/**
 * A PENDING row with a verdictKind was sent back (a rerun request or a WorkBC edit) or held by a
 * judge run. It keeps its old verdict, which must stay off the public site until a judge run
 * scores the row again, so it is "withheld", not "unjudged".
 */
export function verdictState(job: Pick<Job, "status" | "verdictKind">): VerdictState {
  if (job.status === "PUBLISHED") return "published"
  return job.verdictKind ? "withheld" : "unjudged"
}

export const PUBLIC_PENDING_TEXT: Record<Exclude<VerdictState, "published">, string> = {
  withheld: "This posting is being re-evaluated. Its rating is withheld until that finishes.",
  unjudged: "This posting hasn’t been evaluated yet.",
}
