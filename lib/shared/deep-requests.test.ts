import { describe, expect, it } from "vitest"
import { scoreableWhere } from "./deep-requests"

describe("scoreableWhere", () => {
    it("keeps the pending-only filter when no listed posting has an open deep request", () => {
        expect(scoreableWhere(["1", "2"], new Set(["9"]))).toEqual({ workbcId: { in: ["1", "2"] }, scoredAt: null })
    })

    it("lets a judged posting with an open deep request be scored", () => {
        expect(scoreableWhere(["1", "2"], new Set(["2", "9"]))).toEqual({
            workbcId: { in: ["1", "2"] },
            OR: [{ scoredAt: null }, { workbcId: { in: ["2"] } }],
        })
    })
})
