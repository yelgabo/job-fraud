import { describe, expect, it } from "vitest"
import { extractApplyBlock, parseApplyRoute } from "./apply-route"

describe("extractApplyBlock", () => {
  it("returns the section verbatim", () => {
    expect(extractApplyBlock("Salary: $20\n\nHow to apply:\nBy email: a@b.com")).toBe("By email: a@b.com")
  })

  it("returns null when the posting has no such section", () => {
    expect(extractApplyBlock("Salary: $20\n\nDuties: things")).toBeNull()
  })
})

describe("parseApplyRoute", () => {
  it("reads a single online route", () => {
    expect(parseApplyRoute("How to apply:\nOnline: https://jobs.peri.com/job/123")).toEqual({
      online: ["https://jobs.peri.com/job/123"],
    })
  })

  it("keeps every channel when several are offered on one line", () => {
    // Tim Hortons #9: the mailing address is the third item, and it is the one that matters.
    const r = parseApplyRoute("How to apply: By email: tims@gmail.com In person: 38930 Progress Way, Squamish By phone: 7784765990")
    expect(r.email).toEqual(["tims@gmail.com"])
    expect(r.inPerson).toEqual(["38930 Progress Way, Squamish"])
    expect(r.phone).toEqual(["7784765990"])
  })

  it("keeps a postal address alongside an email", () => {
    const r = parseApplyRoute("How to apply:\nBy email: megacityconstructionltd@gmail.com\nBy mail: 3444 Caldera Ct, Langford, British Columbia, V9B 6Z8")
    expect(r.email).toEqual(["megacityconstructionltd@gmail.com"])
    expect(r.mail).toEqual(["3444 Caldera Ct, Langford, British Columbia, V9B 6Z8"])
  })

  it("returns nothing for a posting with no apply section", () => {
    expect(parseApplyRoute("Duties: things")).toEqual({})
  })
})
