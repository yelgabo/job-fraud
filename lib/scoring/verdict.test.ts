import { describe, expect, it, vi } from "vitest"
import type { TypeSafeClient } from "@typesafe-ai/sdk"
import type { Judgments } from "./compose"
import { rescoreVerdict } from "./verdict"

vi.mock("../ai/jev-judgments", () => ({
  judgeText: vi.fn(async () => ({
    judgments: { routePlausibleForEmployer: 0.2, employerIsOrganisation: 0.9, brokerRouting: 0.8, brandProminence: 0, askBeforeHire: 0 },
    usage: { inputTokens: 10, outputTokens: 5 },
  })),
}))
const { judgeText } = await import("../ai/jev-judgments")

const STORED: Judgments = { routePlausibleForEmployer: 0.9, employerIsOrganisation: 0.9, brokerRouting: 0.1, brandProminence: 1, askBeforeHire: 0 }
const job = (judgments: Judgments | null) => ({
  title: "Cook", location: "Victoria", salary: null, descriptionMd: "Cook wanted.",
  applicationFlags: [], nocCode: null, employerName: "Acme", judgments,
})
const jev = {} as TypeSafeClient

describe("rescoreVerdict", () => {
  it("composes from stored judgments without asking Jev", async () => {
    vi.mocked(judgeText).mockClear()
    const v = await rescoreVerdict(jev, job(STORED), {})
    expect(judgeText).not.toHaveBeenCalled()
    expect(v.judgments).toEqual(STORED)
  })

  it("asks Jev again when the row has no stored judgments", async () => {
    vi.mocked(judgeText).mockClear()
    const v = await rescoreVerdict(jev, job(null), {})
    expect(judgeText).toHaveBeenCalledOnce()
    expect((v.judgments as Judgments).brokerRouting).toBe(0.8)
  })
})
