import { describe, it, expect, vi } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import { verifyEmployerWeb, WebVerifyError } from "./verify-employer-web"

const VALID = {
  websiteUrl: "https://acme.com",
  websiteReachable: "yes",
  businessMatch: "match",
  locationMatch: "match",
  hasJobsListing: "yes",
  applicationAddressType: "business",
  confidence: 0.9,
  summary: "Real company.",
}

const toolResp = (input: unknown) => ({
  content: [{ type: "tool_use", name: "record_web_verification", input }],
  usage: { input_tokens: 10, output_tokens: 5 },
})
// Response that also includes the server-side web_search activity (queries + results).
const searchResp = (input: unknown) => ({
  content: [
    { type: "server_tool_use", name: "web_search", id: "stu_1", input: { query: "Acme Vancouver company" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "stu_1",
      content: [
        { type: "web_search_result", title: "Acme Inc.", url: "https://acme.com", page_age: "2024-01-01", encrypted_content: "BLOB" },
      ],
    },
    { type: "tool_use", name: "record_web_verification", input },
  ],
  usage: { input_tokens: 50, output_tokens: 8 },
})
const textResp = () => ({ content: [{ type: "text", text: "hi" }], usage: { input_tokens: 1, output_tokens: 1 } })

function mockClient(...responses: unknown[]) {
  const create = vi.fn()
  for (const r of responses) create.mockImplementationOnce(async () => r)
  return { client: { messages: { create } } as unknown as Anthropic, create }
}

const INPUT = {
  employerName: "Acme",
  jobTitle: "developer",
  location: "Vancouver",
  descriptionExcerpt: "build things",
  applicationText: "Apply online at acme.com/careers",
}

describe("verifyEmployerWeb", () => {
  it("parses a valid verdict", async () => {
    const { client } = mockClient(toolResp(VALID))
    const out = await verifyEmployerWeb(client, INPUT)
    expect(out.result.businessMatch).toBe("match")
    expect(out.result.applicationAddressType).toBe("business")
    expect(out.result.websiteUrl).toBe("https://acme.com")
    expect(out.usage.inputTokens).toBe(10)
  })

  it("captures web_search queries and raw blocks for the audit trail", async () => {
    const { client } = mockClient(searchResp(VALID))
    const out = await verifyEmployerWeb(client, INPUT)
    expect(out.searchLog.queries).toEqual(["Acme Vancouver company"])
    // both the server_tool_use and the web_search_tool_result block are captured verbatim
    expect(out.searchLog.blocks).toHaveLength(2)
    const resultBlock = out.searchLog.blocks.find(
      (b) => (b as { type?: string }).type === "web_search_tool_result",
    ) as { content: Array<{ encrypted_content: string }> }
    expect(resultBlock.content[0].encrypted_content).toBe("BLOB")
  })

  it("returns an empty searchLog when the model did not search", async () => {
    const { client } = mockClient(toolResp(VALID))
    const out = await verifyEmployerWeb(client, INPUT)
    expect(out.searchLog.queries).toEqual([])
    expect(out.searchLog.blocks).toEqual([])
  })

  it("captures a residential application-address verdict", async () => {
    const { client } = mockClient(
      toolResp({ ...VALID, applicationAddressType: "residential", summary: "Mail-to is a Surrey apartment." }),
    )
    const out = await verifyEmployerWeb(client, INPUT)
    expect(out.result.applicationAddressType).toBe("residential")
  })

  it("defaults applicationAddressType to 'none' when the model omits it", async () => {
    const noType = { ...VALID } as Record<string, unknown>
    delete noType.applicationAddressType
    const { client } = mockClient(toolResp(noType))
    const out = await verifyEmployerWeb(client, INPUT)
    expect(out.result.applicationAddressType).toBe("none")
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
