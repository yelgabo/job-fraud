import { describe, it, expect, vi } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import { verifyEmployerWeb, WebVerifyError } from "./verify-employer-web"

const VALID = {
  websiteUrl: "https://acme.com",
  websiteReachable: "yes",
  businessMatch: "match",
  locationMatch: "match",
  hasJobsListing: "yes",
  confidence: 0.9,
  summary: "Real company.",
}

const toolResp = (input: unknown) => ({
  content: [{ type: "tool_use", name: "record_web_verification", input }],
  usage: { input_tokens: 10, output_tokens: 5 },
})
const textResp = () => ({ content: [{ type: "text", text: "hi" }], usage: { input_tokens: 1, output_tokens: 1 } })

function mockClient(...responses: unknown[]) {
  const create = vi.fn()
  for (const r of responses) create.mockImplementationOnce(async () => r)
  return { client: { messages: { create } } as unknown as Anthropic, create }
}

const INPUT = { employerName: "Acme", jobTitle: "developer", location: "Vancouver", descriptionExcerpt: "build things" }

describe("verifyEmployerWeb", () => {
  it("parses a valid verdict", async () => {
    const { client } = mockClient(toolResp(VALID))
    const out = await verifyEmployerWeb(client, INPUT)
    expect(out.result.businessMatch).toBe("match")
    expect(out.result.websiteUrl).toBe("https://acme.com")
    expect(out.usage.inputTokens).toBe(10)
  })

  it("retries once on invalid output then succeeds", async () => {
    const { client, create } = mockClient(toolResp({ ...VALID, businessMatch: "nope" }), toolResp(VALID))
    const out = await verifyEmployerWeb(client, INPUT, { retryDelayMs: 0 })
    expect(create).toHaveBeenCalledTimes(2)
    expect(out.result.businessMatch).toBe("match")
  })

  it("throws WebVerifyError after two invalid outputs", async () => {
    const { client } = mockClient(toolResp({ ...VALID, confidence: 5 }), toolResp({ ...VALID, confidence: 9 }))
    await expect(verifyEmployerWeb(client, INPUT, { retryDelayMs: 0 })).rejects.toBeInstanceOf(WebVerifyError)
  })

  it("throws WebVerifyError when there is no tool_use block", async () => {
    const { client } = mockClient(textResp(), textResp())
    await expect(verifyEmployerWeb(client, INPUT, { retryDelayMs: 0 })).rejects.toBeInstanceOf(WebVerifyError)
  })
})
