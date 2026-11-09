import { describe, expect, it } from "vitest"
import type { WebVerification } from "./json-schemas"
import { PRESUMED_LABEL, employerCheckKind, employerCheckLabel, isPresumed, tallyEmployerChecks } from "./employer-check"

const presumed = { source: "ats-tenant-match" as const, businessMatch: "match" as const }
const webMatch = { source: "web" as const, businessMatch: "match" as const }
// Verdicts stored before `source` existed have none.
const legacyMatch: Pick<WebVerification, "source" | "businessMatch"> = { businessMatch: "match" }
const webMismatch = { source: "web" as const, businessMatch: "mismatch" as const }
const webUncertain = { businessMatch: "uncertain" as const }

describe("employer check source", () => {
  it("treats only the ats-tenant-match source as a presumption", () => {
    expect(isPresumed(presumed)).toBe(true)
    expect(isPresumed(webMatch)).toBe(false)
    expect(isPresumed(legacyMatch)).toBe(false)
    expect(isPresumed(null)).toBe(false)
  })

  it("reads a verdict with no source as a web check, as the schema documents", () => {
    expect(employerCheckKind(legacyMatch)).toBe("web")
    expect(employerCheckKind(presumed)).toBe("presumed")
    expect(employerCheckKind(undefined)).toBe("none")
  })
})

describe("employerCheckLabel", () => {
  it("never calls a presumption verified, though it stores businessMatch match", () => {
    expect(employerCheckLabel(presumed)).toBe(PRESUMED_LABEL)
    expect(employerCheckLabel(presumed)).not.toMatch(/verified/)
  })

  it("labels web checks by their business verdict", () => {
    expect(employerCheckLabel(webMatch)).toBe("✓ verified")
    expect(employerCheckLabel(webMismatch)).toBe("⚠ business mismatch")
    expect(employerCheckLabel(webUncertain)).toBe("uncertain")
    expect(employerCheckLabel(null)).toBeNull()
  })
})

describe("tallyEmployerChecks", () => {
  it("keeps presumptions out of the web-checked denominator", () => {
    expect(tallyEmployerChecks([presumed, presumed, webMatch, legacyMatch, webMismatch, webUncertain, null])).toEqual({
      webChecked: 4,
      webMismatch: 1,
      presumed: 2,
    })
  })
})
