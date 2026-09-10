import { describe, expect, it } from "vitest"
import { humanizeSignalLabel } from "./signal-labels"

describe("humanizeSignalLabel", () => {
  // Separator spellings observed in real published verdicts.
  it("maps the web.* key variants seen in the corpus", () => {
    const mismatch = "Web search found a different business than the posting claims"
    expect(humanizeSignalLabel("web.businessMatch mismatch")).toBe(mismatch)
    expect(humanizeSignalLabel("web.businessMatch: mismatch")).toBe(mismatch)
    expect(humanizeSignalLabel("web.businessMatch == mismatch")).toBe(mismatch)
    expect(humanizeSignalLabel("web.businessMatch = mismatch")).toBe(mismatch)
    expect(humanizeSignalLabel("businessMatch mismatch")).toBe(mismatch)
  })

  it("maps enum values with underscores", () => {
    expect(humanizeSignalLabel("web.applicationAddressType = po_box")).toBe(
      "Applications are mailed to a PO box",
    )
    expect(humanizeSignalLabel("applicationAddressType: residential")).toBe(
      "Applications are mailed to a residential address",
    )
  })

  it("maps bare deterministic flags", () => {
    expect(humanizeSignalLabel("generic_email_domain")).toBe(
      "The contact email is a free personal address (Gmail, Outlook, etc.)",
    )
    expect(humanizeSignalLabel("ats_known_provider")).toBe(
      "Applies through a recognized hiring system",
    )
  })

  it("maps websiteReachable boolean and yes/no spellings", () => {
    expect(humanizeSignalLabel("websiteReachable false")).toBe(
      "The employer's website could not be reached",
    )
    expect(humanizeSignalLabel("web.websiteReachable: no")).toBe(
      "The employer's website could not be reached",
    )
  })

  // The contract: anything unrecognized renders verbatim, never hidden or reworded.
  it("returns unrecognized labels verbatim", () => {
    for (const label of [
      "Unverifiable employer identity",
      "mail_physical_resume + childcare role",
      "websiteReachable == false (implied)",
      "Detailed job description and reasonable salary",
      "",
    ]) {
      expect(humanizeSignalLabel(label)).toBe(label)
    }
  })
})
