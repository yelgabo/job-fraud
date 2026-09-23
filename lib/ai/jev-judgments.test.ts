import { describe, expect, it, vi } from "vitest"
import { TypeSafeClient } from "@typesafe-ai/sdk"
import { DESCRIPTION_CHARS, jevClientFromEnv, judgeText, QUESTIONS } from "./jev-judgments"

function clientReturning(answers: Record<string, unknown>) {
  const fetch = vi.fn(async () =>
    new Response(JSON.stringify({ model: "jev-test", answers, usage: { input_tokens: 10, output_tokens: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  )
  return { client: new TypeSafeClient({ apiKey: "test", fetch, retry: { maxRetries: 0 } }), fetch }
}

const ANSWERS = {
  routePlausibleForEmployer: { type: "noul", noul: 0.83 },
  employerIsOrganisation: { type: "noul", noul: 0.95 },
  brokerRouting: { type: "noul", noul: 0.05 },
  brandProminence: { type: "score", score: 2.4, confidence: 0.7, legend: {}, probabilities: {} },
  askBeforeHire: { type: "noul", noul: 0.02 },
}

describe("judgeText", () => {
  it("maps every question to a judgment and reports usage", async () => {
    const { client } = clientReturning(ANSWERS)
    const out = await judgeText(client, { title: "cook", employer: "Acme", location: "Victoria", salary: null, description: "d" })
    expect(out.judgments).toEqual({ routePlausibleForEmployer: 0.83, employerIsOrganisation: 0.95, brokerRouting: 0.05, brandProminence: 2.4, askBeforeHire: 0.02 })
    expect(out.usage).toEqual({ inputTokens: 10, outputTokens: 1 })
  })

  it("sends the measured state shape: fields plus a capped description", async () => {
    const { client, fetch } = clientReturning(ANSWERS)
    await judgeText(client, { title: "cook", employer: "Acme", location: null, salary: "$20", description: "x".repeat(DESCRIPTION_CHARS + 500) })
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(Object.keys(body.state).sort()).toEqual(["description", "employer", "location", "salary", "title"])
    expect(body.state.description).toHaveLength(DESCRIPTION_CHARS)
    expect(Object.keys(body.questions).sort()).toEqual(Object.keys(QUESTIONS).sort())
  })
})

describe("jevClientFromEnv", () => {
  it("is null without a key, and a placeholder counts as a key", () => {
    expect(jevClientFromEnv({})).toBeNull()
    expect(jevClientFromEnv({ TYPESAFE_API_KEY: "  " })).toBeNull()
    expect(jevClientFromEnv({ TYPESAFE_API_KEY: "ts-x" })).toBeInstanceOf(TypeSafeClient)
  })
})
