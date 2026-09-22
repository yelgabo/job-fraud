import { describe, expect, it } from "vitest"
import { cachedVerdictMissedAnAddress, hasMailAddress, mailEvidence, pickRepresentative } from "./mail-evidence"

const mail = (evidence: string) => [{ flag: "mail_physical_resume", evidence }]
const email = [{ flag: "generic_email_domain", evidence: "a@gmail.com" }]

describe("mailEvidence", () => {
  it("returns the mailing address when the posting gives one", () => {
    expect(mailEvidence(mail("By mail: 3444 Caldera Ct, Langford"))).toBe("By mail: 3444 Caldera Ct, Langford")
  })

  it("returns empty for other flags and for no flags", () => {
    expect(mailEvidence(email)).toBe("")
    expect(mailEvidence([])).toBe("")
    expect(mailEvidence(null)).toBe("")
  })
})

describe("pickRepresentative", () => {
  it("prefers a posting that carries a mailing address over an earlier one that does not", () => {
    // Megacity Construction: the carpenter posting is first and applies by email, the
    // construction helper mails to a house. Picking by position sent "(none given)".
    const carpenter = { applicationFlags: email, id: "carpenter" }
    const helper = { applicationFlags: mail("By mail: 3444 Caldera Ct, Langford"), id: "helper" }
    expect(pickRepresentative([carpenter, helper]).id).toBe("helper")
  })

  it("keeps the first posting when none has an address", () => {
    const a = { applicationFlags: email, id: "a" }
    const b = { applicationFlags: [], id: "b" }
    expect(pickRepresentative([a, b]).id).toBe("a")
  })

  it("keeps the first address-bearing posting when several have one", () => {
    const a = { applicationFlags: mail("By mail: 1 First St"), id: "a" }
    const b = { applicationFlags: mail("By mail: 2 Second St"), id: "b" }
    expect(pickRepresentative([a, b]).id).toBe("a")
  })
})

describe("cachedVerdictMissedAnAddress", () => {
  it("re-verifies when a cached none is contradicted by an address", () => {
    expect(cachedVerdictMissedAnAddress("none", [{ applicationFlags: mail("By mail: 3444 Caldera Ct") }])).toBe(true)
  })

  it("leaves a cached none alone when no posting gives an address", () => {
    expect(cachedVerdictMissedAnAddress("none", [{ applicationFlags: email }])).toBe(false)
  })

  it("never disturbs a verdict that already classified an address", () => {
    for (const verdict of ["business", "residential", "po_box", "virtual", "uncertain"]) {
      expect(cachedVerdictMissedAnAddress(verdict, [{ applicationFlags: mail("By mail: x") }])).toBe(false)
    }
  })

  it("treats an absent verdict as nothing to re-verify (it gets verified anyway)", () => {
    expect(cachedVerdictMissedAnAddress(undefined, [{ applicationFlags: mail("By mail: x") }])).toBe(false)
  })
})
