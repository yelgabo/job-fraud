import type { Prisma } from "@prisma/client"

/**
 * Which of the listed postings a keyless verdict may score: the pending ones, plus judged ones
 * with an open "deep" review request. A deep request deliberately leaves `scoredAt` set so the
 * posting stays on the public site while the agent investigates; filtering on pending alone made
 * the agent's verdict update the employer but never the posting the owner flagged.
 */
export function scoreableWhere(workbcIds: string[], openDeepIds: ReadonlySet<string>): Prisma.JobWhereInput {
    const deep = workbcIds.filter((id) => openDeepIds.has(id))
    if (deep.length === 0) {
        return { workbcId: { in: workbcIds }, scoredAt: null }
    }
    return {
        workbcId: { in: workbcIds },
        OR: [{ scoredAt: null }, { workbcId: { in: deep } }],
    }
}
