// The only code that writes a Job's verdict, so status, verdictKind and scoredAt always move
// together and every scorer gets the same guards. Writers elsewhere update evidence (flags,
// description, employer) and must not touch these columns.
import type { Prisma } from "@prisma/client"
import { prisma } from "../db"
import type { StoredVerdict } from "./verdict"

export type ComposedVerdict = Omit<StoredVerdict, "usage">

/**
 * "judgment" is a fresh evaluation (judge, keyless apply, reverify-mail, rescore-failed) and may
 * publish a pending row. "recompute" re-derives a published verdict from evidence already stored
 * (recompose, recheck-cached-verdicts, backfill-ats) and is refused on a pending row, because a
 * pending row with an old verdict is waiting on a rerun, and recomputing it would republish the
 * verdict the owner sent back.
 */
export type ComposedWriteKind = "judgment" | "recompute"

// Prisma's `not` drops NULL rows, so the never-judged case is spelled out.
const NOT_IMPERSONATION: Prisma.JobWhereInput = {
  OR: [{ verdictKind: null }, { verdictKind: { not: "IMPERSONATION" } }],
}

export function composedWriteWhere(workbcId: string, kind: ComposedWriteKind): Prisma.JobWhereInput {
  return { workbcId, ...NOT_IMPERSONATION, ...(kind === "recompute" ? { status: "PUBLISHED" } : {}) }
}

/**
 * Writes a composed verdict. Never replaces a confirmed impersonation: after re-attribution the
 * apply-host check compares the tenant with the real company and stops firing, so composing would
 * replace the 90 with an ordinary score. Returns false when a guard refused the write.
 */
export async function writeComposedVerdict(
  workbcId: string,
  verdict: ComposedVerdict,
  kind: ComposedWriteKind,
): Promise<boolean> {
  const { count } = await prisma.job.updateMany({
    where: composedWriteWhere(workbcId, kind),
    data: { ...verdict, status: "PUBLISHED", verdictKind: "COMPOSED" },
  })
  return count === 1
}

export type ImpersonationVerdict = {
  employerId: string
  applicationFlags: Prisma.InputJsonValue
  fraudScore: number
  riskBand: string
  reasoning: string
  signals: Prisma.InputJsonValue
}

export async function writeImpersonationVerdict(workbcId: string, verdict: ImpersonationVerdict): Promise<void> {
  await prisma.job.update({
    where: { workbcId },
    data: {
      ...verdict,
      // recompose selects rows by a non-null scoringVersion; null keeps this row out of it.
      scoringVersion: null,
      scoredAt: new Date(),
      status: "PUBLISHED",
      verdictKind: "IMPERSONATION",
    },
  })
}

/** Republishes the verdict a row already holds, unchanged. */
export async function republishVerdict(workbcId: string): Promise<void> {
  await prisma.job.update({ where: { workbcId }, data: { scoredAt: new Date(), status: "PUBLISHED" } })
}

/** A rerun request: off the site now, re-judged on the next update. The old verdict is kept. */
export async function sendBackToPending(workbcId: string): Promise<void> {
  await prisma.job.update({ where: { workbcId }, data: { scoredAt: null, status: "PENDING" } })
}
