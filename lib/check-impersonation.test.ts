import { describe, it, expect } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import { checkImpersonation, ImpersonationError } from "./check-impersonation"

const VALID = {
  relationship: "impersonation",
  realCompany: "RELX",
  confidence: 0.9,
  summary: "relx.wd3 is RELX/LexisNexis, unrelated to Remitly.",
}

const toolResp = (input: unknown) => ({
  content: [
    { type: "server_tool_use", name: "web_search", id: "s1", input: { query: "relx workday company" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "s1",
      content: [{ type: "web_search_result", title: "RELX", url: "https://relx.com", encrypted_content: "E" }],
    },
    { type: "tool_use", name: "record_impersonation_check", input },
  ],
  usage: { input_tokens: 20, output_tokens: 6 },
})
const textResp = () => ({ content: [{ type: "text", text: "hi" }], usage: { input_tokens: 1, output_tokens: 1 } })

function mockClient(...responses: unknown[]) {
  let i = 0
  const create = async () => responses[Math.min(i++, responses.length - 1)]
  return { messages: { create } } as unknown as Anthropic
}

const INPUT = {
  claimedEmployer: "Remitly",
  tenant: "relx",
  provider: "workday",
  applyUrl: "https://relx.wd3.myworkdayjobs.com/relx/job/x",
  jobTitle: "ServiceNow Tech Lead",
}

describe("checkImpersonation", () => {
  it("parses an impersonation verdict and captures the search trail", async () => {
    const out = await checkImpersonation(mockClient(toolResp(VALID)), INPUT)
    expect(out.result.relationship).toBe("impersonation")
    expect(out.result.realCompany).toBe("RELX")
    expect(out.searchLog.queries).toEqual(["relx workday company"])
    expect(out.searchLog.blocks).toHaveLength(2)
  })

  it("coerces an empty realCompany to null", async () => {
    const out = await checkImpersonation(mockClient(toolResp({ ...VALID, realCompany: "" })), INPUT)
    expect(out.result.realCompany).toBeNull()
  })

  it("clears a legitimate affiliate relationship", async () => {
    const out = await checkImpersonation(
      mockClient(toolResp({ ...VALID, relationship: "affiliate", summary: "LexisNexis is part of RELX." })),
      INPUT,
    )
    expect(out.result.relationship).toBe("affiliate")
  })

  it("throws after two invalid responses", async () => {
    await expect(
      checkImpersonation(mockClient(textResp(), textResp()), INPUT, { retryDelayMs: 0 }),
    ).rejects.toBeInstanceOf(ImpersonationError)
  })
})
