import { describe, it, expect, vi } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import { scoreJob, ScoringFailedError, type ScoreInput } from "./scoring"

const INPUT: ScoreInput = {
  title: "developer",
  employerDisplay: "Acme",
  location: "Vancouver",
  salary: null,
  postedAt: null,
  descriptionMd: "desc",
  employerChecks: null,
  applicationFlags: [],
  atsProvider: null,
  externalApplyOk: null,
}

const SIGNALS = [{ label: "legit", weight: -10, evidence: "detailed description" }]
const resp = (input: unknown) => ({
  content: [{ type: "tool_use", name: "record_fraud_assessment", input }],
  usage: { input_tokens: 1, output_tokens: 1 },
})
function mockClient(...rs: unknown[]) {
  const create = vi.fn()
  for (const r of rs) create.mockImplementationOnce(async () => r)
  return { messages: { create } } as unknown as Anthropic
}

describe("scoreJob signals tolerance", () => {
  it("accepts signals as a proper array", async () => {
    const c = mockClient(resp({ fraudScore: 20, reasoning: "ok", signals: SIGNALS }))
    const out = await scoreJob(c, INPUT)
    expect(out.result.fraudScore).toBe(20)
    expect(out.result.signals).toHaveLength(1)
  })

  it("accepts signals emitted as a JSON STRING (model tool-use quirk)", async () => {
    const c = mockClient(resp({ fraudScore: 30, reasoning: "ok", signals: JSON.stringify(SIGNALS) }))
    const out = await scoreJob(c, INPUT)
    expect(out.result.signals).toHaveLength(1)
    expect(out.result.signals[0].label).toBe("legit")
  })

  it("throws ScoringFailedError when the signals string is malformed on both attempts", async () => {
    const bad = resp({ fraudScore: 30, reasoning: "ok", signals: '[{"label":"x",' }) // truncated JSON
    const c = mockClient(bad, bad)
    await expect(scoreJob(c, INPUT)).rejects.toBeInstanceOf(ScoringFailedError)
  })
})

describe("approved address signal range", () => {
  it.each([35, 45])("accepts an address contribution of %i and advertises its range", async (weight) => {
    const signals = [{ label: "residential mailing address", weight, evidence: "Applicants mail resumes to a residence" }]
    const c = mockClient(resp({ fraudScore: 75, reasoning: "address evidence", signals }))
    const out = await scoreJob(c, INPUT)
    expect(out.result.signals[0].weight).toBe(weight)
    const request = vi.mocked(c.messages.create).mock.calls[0][0]
    expect(request.tools?.[0]).toMatchObject({
      input_schema: { properties: { signals: { items: { properties: { weight: { minimum: -30, maximum: 45 } } } } } },
    })
    expect(request.messages[0].content).toContain("+45 (strong fraud)")
  })
})
