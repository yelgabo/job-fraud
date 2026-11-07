import { normalizeEmployer } from "./normalize-employer"
import { tenantEmployerMatch } from "./apply-host"

export type ImpersonationCheck = { checkKey: string; tenant: string; provider: string }

/** One check per claimed employer and ATS tenant pair, as the API judge caches it within a run. */
export const impersonationKey = (employerName: string, tenant: string): string =>
    `${normalizeEmployer(employerName)}|${tenant}`

/**
 * The impersonation check a posting needs, or null: needed when its apply link goes to an ATS
 * tenant that does not look like the employer the posting names.
 */
export function impersonationCheckFor(employerName: string | null, applyUrl: string | null): ImpersonationCheck | null {
    const m = tenantEmployerMatch(employerName, applyUrl)
    if (m.result !== "mismatch" || !m.tenant || !employerName) {
        return null
    }
    return { checkKey: impersonationKey(employerName, m.tenant), tenant: m.tenant, provider: m.provider ?? "" }
}

export type ImpersonationItem = {
    checkKey: string
    claimedEmployer: string
    tenant: string
    provider: string
    applyUrl: string
    jobTitle: string
    /** Not for the helper: the apply step applies the result to exactly these postings. */
    postings: string[]
}

type PlannedPosting = {
    workbcId: string
    title: string
    externalApplyUrl: string | null
    employer: { nameDisplay: string } | null
}

/** Groups the postings that need an impersonation check into one item per employer-tenant pair. */
export function planImpersonationChecks(jobs: PlannedPosting[]): ImpersonationItem[] {
    const items = new Map<string, ImpersonationItem>()
    for (const j of jobs) {
        const name = j.employer?.nameDisplay ?? null
        const check = impersonationCheckFor(name, j.externalApplyUrl)
        if (!check || !name || !j.externalApplyUrl) {
            continue
        }
        const item = items.get(check.checkKey)
        if (item) {
            item.postings.push(j.workbcId)
        } else {
            items.set(check.checkKey, {
                ...check,
                claimedEmployer: name,
                applyUrl: j.externalApplyUrl,
                jobTitle: j.title,
                postings: [j.workbcId],
            })
        }
    }
    return [...items.values()]
}
