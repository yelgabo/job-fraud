import { describe, expect, it } from "vitest"
import { impersonationCheckFor, impersonationKey, planImpersonationChecks } from "./impersonation-plan"

const RELX = "https://relx.wd3.myworkdayjobs.com/x"

describe("impersonationCheckFor", () => {
    it("needs a check when the tenant is a different company", () => {
        expect(impersonationCheckFor("Remitly", RELX)).toEqual({
            checkKey: impersonationKey("Remitly", "relx"),
            tenant: "relx",
            provider: "workday",
        })
    })

    it("needs none without a tenant or without an employer name", () => {
        expect(impersonationCheckFor("Remitly", "https://remitly.com/careers")).toBeNull()
        expect(impersonationCheckFor(null, RELX)).toBeNull()
    })
})

describe("planImpersonationChecks", () => {
    it("groups postings by employer and tenant and skips the ones that need no check", () => {
        const emp = (nameDisplay: string) => ({ nameDisplay })
        const items = planImpersonationChecks([
            { workbcId: "1", title: "Dev", externalApplyUrl: RELX, employer: emp("Remitly") },
            { workbcId: "2", title: "QA", externalApplyUrl: RELX, employer: emp("Remitly Inc.") },
            { workbcId: "3", title: "Ops", externalApplyUrl: RELX, employer: emp("Renishaw") },
            { workbcId: "4", title: "Ops", externalApplyUrl: null, employer: emp("Renishaw") },
        ])
        expect(items.map((i) => [i.claimedEmployer, i.postings])).toEqual([
            ["Remitly", ["1", "2"]],
            ["Renishaw", ["3"]],
        ])
    })
})
