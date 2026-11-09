// The JudgeRun record both judge paths keep, so a run's outcome survives the process.
import type { JudgePath, JudgeRunOutcome } from "@prisma/client"
import { prisma } from "../db"

export type RunCounts = { pendingAtStart: number; scored: number; held: number; failed: number }

export function runOutcome(c: RunCounts): Exclude<JudgeRunOutcome, "RUNNING" | "ABORTED"> {
  if (c.pendingAtStart > 0 && c.scored === 0) return "FAILED"
  return c.held + c.failed > 0 ? "PARTIAL" : "OK"
}

/**
 * `pendingAtStart` defaults to every pending posting, which is what the API judge takes on. Keyless
 * apply passes the count of its directory's postings still waiting: counting the whole table
 * recorded FAILED for a directory the cron had already judged while newer postings waited.
 */
export async function startJudgeRun(path: JudgePath, pendingAtStart?: number): Promise<{ id: string; pendingAtStart: number }> {
  const pending = pendingAtStart ?? (await prisma.job.count({ where: { status: "PENDING" } }))
  const run = await prisma.judgeRun.create({ data: { path, pendingAtStart: pending } })
  return { id: run.id, pendingAtStart: pending }
}

/**
 * Records how the run ended and returns the outcome. The caller exits nonzero on FAILED or
 * ABORTED, so the scheduler's cron shows the failure too. Only a RUNNING row is updated, so the
 * crash handler that runs after a recorded abort leaves the abort in place.
 */
export async function finishJudgeRun(
  id: string,
  counts: RunCounts,
  abort?: { note: string },
): Promise<JudgeRunOutcome> {
  const outcome: JudgeRunOutcome = abort ? "ABORTED" : runOutcome(counts)
  await prisma.judgeRun.updateMany({
    where: { id, outcome: "RUNNING" },
    data: {
      finishedAt: new Date(),
      outcome,
      scored: counts.scored,
      held: counts.held,
      failed: counts.failed,
      note: abort?.note ?? null,
    },
  })
  return outcome
}

/**
 * For a script's top-level catch: without it a thrown error left the row RUNNING forever, which the
 * audit page cannot tell from a live run. The run's counters die with the process, so the scored
 * count is read back from judgedAt, which also counts a concurrent run's judgments.
 */
export async function failJudgeRun(id: string, error: unknown): Promise<void> {
  const run = await prisma.judgeRun.findUnique({ where: { id }, select: { startedAt: true, outcome: true } })
  if (!run || run.outcome !== "RUNNING") return
  const scored = await prisma.job.count({ where: { judgedAt: { gte: run.startedAt } } })
  const message = error instanceof Error ? error.message : String(error)
  await prisma.judgeRun.updateMany({
    where: { id, outcome: "RUNNING" },
    data: {
      finishedAt: new Date(),
      outcome: "FAILED",
      scored,
      note: `threw: ${message.slice(0, 300)} (scored read from judgedAt; held and failed not known)`,
    },
  })
}
