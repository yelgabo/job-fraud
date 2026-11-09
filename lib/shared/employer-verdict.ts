// The one write of an employer's web verdict, shared by both judge paths and the re-check scripts.
import { prisma } from "../db"

export type EmployerSeen = { id: string; checks: unknown; checkedAt: Date | null }

/**
 * Stores `web` unless another writer stored a verdict on this employer after `seen` was read (a
 * check on checkedAt). The scheduler's judge and a local keyless apply can run at once, and each
 * used to merge into the checks it loaded at its start, so the later write silently replaced the
 * other's verdict. Returns the checks now in force, which callers score with.
 */
export async function storeEmployerWeb(
  seen: EmployerSeen,
  web: Record<string, unknown>,
): Promise<{ stored: boolean; checks: Record<string, unknown> }> {
  const checks = { ...((seen.checks as Record<string, unknown> | null) ?? {}), web }
  const { count } = await prisma.employer.updateMany({
    where: { id: seen.id, checkedAt: seen.checkedAt },
    data: { checks: checks as never, checkedAt: new Date() },
  })
  if (count === 1) return { stored: true, checks }
  const current = await prisma.employer.findUnique({ where: { id: seen.id }, select: { checks: true } })
  return { stored: false, checks: (current?.checks as Record<string, unknown> | null) ?? {} }
}
