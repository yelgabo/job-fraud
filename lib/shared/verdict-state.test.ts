import { describe, expect, it } from "vitest"
import { PUBLIC_PENDING_TEXT, verdictState } from "./verdict-state"

describe("verdictState", () => {
  it("is published whenever the row is published", () => {
    expect(verdictState({ status: "PUBLISHED", verdictKind: "COMPOSED" })).toBe("published")
  })

  it("calls a pending row with a kept verdict withheld, whatever produced the verdict", () => {
    for (const verdictKind of ["MODEL", "COMPOSED", "IMPERSONATION"] as const) {
      expect(verdictState({ status: "PENDING", verdictKind })).toBe("withheld")
    }
  })

  it("calls a pending row with no verdict unjudged", () => {
    expect(verdictState({ status: "PENDING", verdictKind: null })).toBe("unjudged")
  })

  it("never tells the public a re-evaluated posting was not evaluated, nor names a score", () => {
    expect(PUBLIC_PENDING_TEXT.withheld).not.toMatch(/hasn.t been evaluated/)
    expect(PUBLIC_PENDING_TEXT.withheld).not.toMatch(/\d/)
  })
})
