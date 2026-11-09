// The JudgeRun record both judge paths keep, so a run's outcome survives the process.
import type { JudgePath, JudgeRunOutcome } from "@prisma/client"
import { prisma } from "../db"

export type RunCounts = { pendingAtStart: number; scored: number; held: number; failed: number }

export function runOutcome(c: RunCounts): Exclude<JudgeRunOutcome, "RUNNING" | "ABORTED"> {
  if (c.pendingAtStart > 0 && c.scored === 0) return "FAILED"
  return c.held + c.failed > 0 ? "PARTIAL" : "OK"
}

export async function startJudgeRun(path: JudgePath): Promise<{ id: string; pendingAtStart: number }> {
  const pendingAtStart = await prisma.job.count({ where: { status: "PENDING" } })
  const run = await prisma.judgeRun.create({ data: { path, pendingAtStart } })
  return { id: run.id, pendingAtStart }
}

/**
 * Records how the run ended and returns the outcome. The caller exits nonzero on FAILED or
 * ABORTED, so the scheduler's cron shows the failure too.
 */
export async function finishJudgeRun(
  id: string,
  counts: RunCounts,
  abort?: { note: string },
): Promise<JudgeRunOutcome> {
  const outcome: JudgeRunOutcome = abort ? "ABORTED" : runOutcome(counts)
  await prisma.judgeRun.update({
    where: { id },
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
