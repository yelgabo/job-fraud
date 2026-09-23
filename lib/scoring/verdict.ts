// The one per-posting pipeline behind every database write of a score: Jev judgments (when a
// client is given), the composer, the prose. `npm run judge` and `judge:apply` both call this
// so a posting cannot score differently depending on which path drained the queue.

import type { TypeSafeClient } from "@typesafe-ai/sdk"
import { Prisma } from "@prisma/client"
import { parseChecks, parseFlags, type Checks } from "../shared/json-schemas"
import { categoryForNoc } from "../signals/job-category"
import { judgeText } from "../ai/jev-judgments"
import { composeScore, type Judgments } from "./compose"
import { explainVerdict } from "./explain"
import { SCORING_VERSION } from "./weights"

/** The Job columns the verdict needs. A Prisma Job row satisfies it. */
export type JobForVerdict = {
  title: string
  location: string | null
  salary: string | null
  descriptionMd: string
  applicationFlags: unknown
  nocCode: string | null
}

export type StoredVerdict = {
  fraudScore: number
  riskBand: string
  reasoning: string
  signals: Prisma.InputJsonValue
  judgments: Prisma.InputJsonValue | typeof Prisma.JsonNull
  scoringVersion: number
  scoredAt: Date
  usage: { inputTokens: number; outputTokens: number }
}

/** Compose from judgments already in hand. Pure apart from the clock on `scoredAt`. */
export function composeVerdict(job: JobForVerdict, checks: Checks, judgments: Judgments | null): StoredVerdict {
  const result = composeScore({ judgments, checks, flags: parseFlags(job.applicationFlags), category: categoryForNoc(job.nocCode) })
  return {
    fraudScore: result.fraudScore,
    riskBand: result.riskBand,
    reasoning: explainVerdict(result, judgments),
    signals: result.signals,
    judgments: judgments ?? Prisma.JsonNull,
    scoringVersion: SCORING_VERSION,
    scoredAt: new Date(),
    usage: { inputTokens: 0, outputTokens: 0 },
  }
}

/**
 * Ask Jev (when `jev` is set) and compose. A Jev failure propagates: the caller decides whether
 * the posting stays pending, which is the right default, since composing without judgments
 * would silently store a different kind of row.
 */
export async function buildVerdict(
  jev: TypeSafeClient | null,
  job: JobForVerdict & { employerName: string | null },
  employerChecks: unknown,
): Promise<StoredVerdict> {
  const checks = parseChecks(employerChecks)
  if (!jev) return composeVerdict(job, checks, null)
  const out = await judgeText(jev, {
    title: job.title,
    employer: job.employerName,
    location: job.location,
    salary: job.salary,
    description: job.descriptionMd,
  })
  return { ...composeVerdict(job, checks, out.judgments), usage: out.usage }
}
