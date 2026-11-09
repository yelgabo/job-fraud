import { describe, expect, it } from "vitest"
import { verificationDateText } from "./verification-date"

const iso = (d: Date) => d.toISOString().slice(0, 10)
const checkedAt = new Date("2026-11-09T12:00:00Z")

describe("verificationDateText", () => {
  it("says a presumed verdict was presumed, never checked, even if verifiedAt is present", () => {
    const text = verificationDateText({ source: "ats-tenant-match", verifiedAt: "2026-11-01T00:00:00Z" }, checkedAt, iso)
    expect(text).toMatch(/^Presumed real on 2026-11-09 /)
    expect(text).toMatch(/no web check was made/)
    expect(text).not.toMatch(/Web-checked/)
  })

  it("dates a web check by when the research happened, not when it was stored", () => {
    expect(verificationDateText({ source: "web", verifiedAt: "2026-11-02T08:00:00Z" }, checkedAt, iso)).toBe(
      "Web-checked 2026-11-02",
    )
    expect(verificationDateText({ verifiedAt: "2026-11-02T08:00:00Z" }, null, iso)).toBe("Web-checked 2026-11-02")
  })

  it("words a legacy verdict as recorded, not checked", () => {
    expect(verificationDateText({ source: "web" }, checkedAt, iso)).toBe("Verdict recorded 2026-11-09")
    expect(verificationDateText(undefined, checkedAt, iso)).toBe("Verdict recorded 2026-11-09")
  })

  it("treats an unparseable verifiedAt as absent", () => {
    expect(verificationDateText({ verifiedAt: "soon" }, checkedAt, iso)).toBe("Verdict recorded 2026-11-09")
  })

  it("has nothing to say without any date", () => {
    expect(verificationDateText({ source: "web" }, null, iso)).toBeNull()
  })
})
