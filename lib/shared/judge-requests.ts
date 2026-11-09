// Resolution of owner review requests, shared by both judge paths so neither leaves them open.
import { prisma } from "../db"

/**
 * A rerun is serviced by any pass that publishes its posting again after the request was filed.
 * scoredAt, not judgedAt: a kept impersonation is republished without a new judgment and must
 * still close the request. Recompute writes cannot publish a pending row
 * (lib/scoring/write-verdict.ts), so a newer scoredAt means a fresh judgment or a kept impersonation.
 */
export async function resolveRerunRequests(): Promise<number> {
  const open = await prisma.judgeRequest.findMany({ where: { kind: "rerun", resolvedAt: null } })
  if (open.length === 0) return 0
  const published = await prisma.job.findMany({
    where: { workbcId: { in: open.map((r) => r.workbcId) }, status: "PUBLISHED" },
    select: { workbcId: true, scoredAt: true },
  })
  const scoredAt = new Map(published.map((j) => [j.workbcId, j.scoredAt]))
  const done = open.filter((r) => (scoredAt.get(r.workbcId)?.getTime() ?? 0) > r.createdAt.getTime()).map((r) => r.id)
  if (done.length > 0) await prisma.judgeRequest.updateMany({ where: { id: { in: done } }, data: { resolvedAt: new Date() } })
  return done.length
}

/** Requests whose posting no longer exists can never be serviced; JudgeRequest has no foreign key. */
export async function closeOrphanRequests(): Promise<number> {
  const open = await prisma.judgeRequest.findMany({ where: { resolvedAt: null }, select: { id: true, workbcId: true } })
  if (open.length === 0) return 0
  const existing = await prisma.job.findMany({ where: { workbcId: { in: open.map((r) => r.workbcId) } }, select: { workbcId: true } })
  const present = new Set(existing.map((j) => j.workbcId))
  const orphans = open.filter((r) => !present.has(r.workbcId)).map((r) => r.id)
  if (orphans.length > 0) await prisma.judgeRequest.updateMany({ where: { id: { in: orphans } }, data: { resolvedAt: new Date() } })
  return orphans.length
}

/** Both resolutions, logged under the caller's prefix. */
export async function settleRequests(prefix: string): Promise<void> {
  const reruns = await resolveRerunRequests()
  const orphans = await closeOrphanRequests()
  if (reruns > 0) console.log(`${prefix} resolved ${reruns} rerun request(s)`)
  if (orphans > 0) console.log(`${prefix} closed ${orphans} request(s) whose posting no longer exists`)
}
