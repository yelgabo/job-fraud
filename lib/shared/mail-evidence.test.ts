import { describe, expect, it } from "vitest"
import { addressKey, addressUnchecked, cachedVerdictMissedAnAddress, hasMailAddress, mailEvidence, pickRepresentative } from "./mail-evidence"

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
  it("re-verifies when a verdict that saw no address meets a posting that gives one", () => {
    expect(cachedVerdictMissedAnAddress({ addressChecked: "" }, [{ applicationFlags: mail("By mail: 3444 Caldera Ct") }])).toBe(true)
  })

  it("leaves a verdict alone when no posting gives an address", () => {
    expect(cachedVerdictMissedAnAddress({ addressChecked: "" }, [{ applicationFlags: email }])).toBe(false)
    expect(cachedVerdictMissedAnAddress({}, [{ applicationFlags: email }])).toBe(false)
  })

  it("reuses a verdict for the address it was shown, compared without case or spacing", () => {
    const checked = { addressChecked: addressKey(mail("By mail:  3444 Caldera Ct")) }
    expect(cachedVerdictMissedAnAddress(checked, [{ applicationFlags: mail("by mail: 3444 CALDERA CT") }])).toBe(false)
  })

  it("re-verifies a posting that mails to a different address", () => {
    const checked = { addressChecked: addressKey(mail("By mail: 3444 Caldera Ct")) }
    expect(cachedVerdictMissedAnAddress(checked, [{ applicationFlags: mail("By mail: PO Box 12") }])).toBe(true)
  })

  it("re-verifies once a verdict stored before it recorded its address", () => {
    expect(cachedVerdictMissedAnAddress({}, [{ applicationFlags: mail("By mail: x") }])).toBe(true)
  })
})

describe("addressUnchecked", () => {
  it("never holds a posting that gives no address", () => {
    expect(addressUnchecked({ addressChecked: "1 main st" }, email)).toBe(false)
  })
})
