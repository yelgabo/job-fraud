import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { WebVerification } from "@/lib/shared/json-schemas"
import { EmployerChecks } from "./EmployerChecks"

const web: WebVerification = {
  websiteUrl: "https://acme.example",
  websiteReachable: "yes",
  businessMatch: "match",
  locationMatch: "match",
  hasJobsListing: "yes",
  applicationAddressType: "none",
  confidence: 0.9,
  summary: "Real company.",
}
const checkedAt = new Date("2026-11-09T12:00:00Z")

describe("EmployerChecks date row", () => {
  it("never calls a presumed verdict checked", () => {
    const html = renderToStaticMarkup(
      <EmployerChecks checks={{ web: { ...web, source: "ats-tenant-match" } }} checkedAt={checkedAt} />,
    )
    expect(html).toContain("Presumed real on 2026-11-09")
    expect(html).toContain("no web check was made")
    expect(html).not.toMatch(/Checked on|Web-checked/)
  })

  it("dates a web check by its research time", () => {
    const html = renderToStaticMarkup(
      <EmployerChecks checks={{ web: { ...web, verifiedAt: "2026-11-03T10:00:00Z" } }} checkedAt={checkedAt} />,
    )
    expect(html).toContain("Web-checked 2026-11-03")
  })

  it("words a legacy verdict as recorded", () => {
    const html = renderToStaticMarkup(<EmployerChecks checks={{ web }} checkedAt={checkedAt} />)
    expect(html).toContain("Verdict recorded 2026-11-09")
    expect(html).not.toContain("Checked on")
  })
})
