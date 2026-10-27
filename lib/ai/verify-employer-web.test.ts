import { describe, it, expect, vi } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import { isAlarmingVerdict, needsEscalation, tierViolation, verifyEmployerTiered, verifyEmployerWeb, WebVerifyError } from "./verify-employer-web"
import { VERIFIER_PROFILES, verifierCostUsd } from "./verifier-models"

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

  it("sends the production request unchanged when no profile is given", async () => {
    const { client, create } = mockClient(toolResp(VALID))
    await verifyEmployerWeb(client, INPUT, { retryDelayMs: 0 })
    const req = create.mock.calls[0][0]
    expect(req).toMatchObject({ model: "claude-haiku-4-5-20251001", max_tokens: 1500, temperature: 0 })
    expect(req.tools[0]).toEqual({ type: "web_search_20250305", name: "web_search", max_uses: 5 })
  })

  it("omits temperature and uses the newer search tool for a 5.x profile", async () => {
    const { client, create } = mockClient(toolResp(VALID))
    await verifyEmployerWeb(client, INPUT, { retryDelayMs: 0, profile: VERIFIER_PROFILES["opus-5.5"] })
    const req = create.mock.calls[0][0]
    expect(req.model).toBe("claude-opus-5-5")
    expect(req).not.toHaveProperty("temperature")
    expect(req.tools[0].type).toBe("web_search_20260209")
  })

  it("resumes a paused search loop and sums usage and billed searches across turns", async () => {
    const paused = {
      content: [{ type: "server_tool_use", name: "web_search", id: "stu_1", input: { query: "Acme" } }],
      stop_reason: "pause_turn",
      usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 3 } },
    }
    const done = { ...toolResp(VALID), stop_reason: "tool_use", usage: { input_tokens: 40, output_tokens: 6, server_tool_use: { web_search_requests: 1 } } }
    const { client, create } = mockClient(paused, done)
    const out = await verifyEmployerWeb(client, INPUT, { retryDelayMs: 0 })
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[1][0].messages[1]).toEqual({ role: "assistant", content: paused.content })
    expect(out.usage).toEqual({ inputTokens: 140, outputTokens: 16, webSearchRequests: 4 })
    expect(out.searchLog.queries).toEqual(["Acme"])
  })

  it("treats a refusal as a failed verification", async () => {
    const refusal = { content: [], stop_reason: "refusal", usage: { input_tokens: 5, output_tokens: 0 } }
    const { client } = mockClient(refusal, refusal)
    await expect(verifyEmployerWeb(client, INPUT, { retryDelayMs: 0 })).rejects.toThrow(/refused/)
  })
})

describe("verifierCostUsd", () => {
  it("prices tokens per million and searches at a cent each", () => {
    const cost = verifierCostUsd(VERIFIER_PROFILES["opus-5.5"], { inputTokens: 1_000_000, outputTokens: 100_000, webSearchRequests: 5 })
    expect(cost).toBeCloseTo(4 + 2 + 0.05, 10)
  })
})

describe("verifyEmployerTiered", () => {
  const priced = (input: unknown, inTok: number, searches: number) => ({
    ...toolResp(input),
    usage: { input_tokens: inTok, output_tokens: 0, server_tool_use: { web_search_requests: searches } },
  })

  it("keeps the primary verdict when it raises no risk, and makes one call", async () => {
    const { client, create } = mockClient(priced(VALID, 1_000_000, 2))
    const out = await verifyEmployerTiered(client, INPUT, { retryDelayMs: 0 })
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0].model).toBe("claude-haiku-5-5")
    expect(out.escalated).toBe(false)
    expect(out.result.verifiedBy).toBe("haiku-5.5")
    expect(out.costUsd).toBeCloseTo(0.1 + 0.02, 10)
  })

  it("replaces an alarming primary verdict with the escalation model's", async () => {
    const alarm = { ...VALID, businessMatch: "mismatch" }
    const { client, create } = mockClient(priced(alarm, 1_000_000, 2), priced(VALID, 1_000_000, 3))
    const out = await verifyEmployerTiered(client, INPUT, { retryDelayMs: 0 })
    expect(create.mock.calls.map((c) => c[0].model)).toEqual(["claude-haiku-5-5", "claude-opus-5-5"])
    expect(out.escalated).toBe(true)
    expect(out.result.businessMatch).toBe("match")
    expect(out.result.verifiedBy).toBe("haiku-5.5>opus-5.5")
    expect(out.usage).toEqual({ inputTokens: 2_000_000, outputTokens: 0, webSearchRequests: 5 })
    expect(out.costUsd).toBeCloseTo(0.1 + 0.02 + 4 + 0.03, 10)
  })

  it("fails instead of keeping an unconfirmed alarm when the escalation fails", async () => {
    const { client } = mockClient(priced({ ...VALID, applicationAddressType: "residential" }, 10, 1), textResp(), textResp())
    await expect(verifyEmployerTiered(client, INPUT, { retryDelayMs: 0 })).rejects.toBeInstanceOf(WebVerifyError)
  })
})

describe("isAlarmingVerdict", () => {
  it("flags only the answers that add risk", () => {
    const v = { ...VALID } as Parameters<typeof isAlarmingVerdict>[0]
    expect(isAlarmingVerdict(v)).toBe(false)
    expect(isAlarmingVerdict({ ...v, locationMatch: "mismatch" })).toBe(true)
    expect(isAlarmingVerdict({ ...v, applicationAddressType: "po_box" })).toBe(true)
    expect(isAlarmingVerdict({ ...v, businessMatch: "uncertain", locationMatch: "uncertain", applicationAddressType: "uncertain" })).toBe(false)
  })
})

describe("tierViolation", () => {
  const v = { ...VALID } as Parameters<typeof tierViolation>[0]
  const alarm = { ...v, applicationAddressType: "residential" as const }
  const MAIL = "Mail resume to 12 Main St, Victoria"

  it("accepts a verdict that needs no escalation from any verifier, or none recorded", () => {
    expect(tierViolation(v, "")).toBeNull()
    expect(tierViolation({ ...v, verifiedBy: "haiku-5.5" }, MAIL)).toBeNull()
    expect(tierViolation({ ...v, applicationAddressType: "uncertain", verifiedBy: "haiku-5.5" }, "")).toBeNull()
  })

  it("accepts a verdict needing escalation only from the escalation model", () => {
    expect(tierViolation({ ...alarm, verifiedBy: "haiku-5.5>opus-5.5" }, "")).toBeNull()
    expect(tierViolation({ ...alarm, verifiedBy: "opus-5.5" }, "")).toBeNull()
    expect(tierViolation({ ...alarm, verifiedBy: "haiku-5.5" }, "")).toMatch(/needs opus-5.5/)
    expect(tierViolation(alarm, "")).toMatch(/\(none\)/)
    expect(tierViolation({ ...v, applicationAddressType: "uncertain", verifiedBy: "haiku-5.5" }, MAIL)).toMatch(/needs opus-5.5/)
  })
})

describe("needsEscalation", () => {
  const v = { ...VALID } as Parameters<typeof needsEscalation>[0]
  it("escalates an unclassified mailing address but not an absent one", () => {
    expect(needsEscalation({ ...v, applicationAddressType: "uncertain" }, "Mail to 724 Lorimer Rd")).toBe(true)
    expect(needsEscalation({ ...v, applicationAddressType: "uncertain" }, "")).toBe(false)
    expect(needsEscalation({ ...v, applicationAddressType: "business" }, "Mail to 724 Lorimer Rd")).toBe(false)
  })
})

describe("verifyEmployerTiered on a mailing address", () => {
  it("re-checks an address the primary left uncertain", async () => {
    const r = (input: unknown) => ({ ...toolResp(input), usage: { input_tokens: 1, output_tokens: 0 } })
    const { client, create } = mockClient(r({ ...VALID, applicationAddressType: "uncertain" }), r({ ...VALID, applicationAddressType: "residential" }))
    const out = await verifyEmployerTiered(client, { ...INPUT, applicationText: "Mail to 724 Lorimer Rd" }, { retryDelayMs: 0 })
    expect(create).toHaveBeenCalledTimes(2)
    expect(out.result.applicationAddressType).toBe("residential")
    expect(out.result.verifiedBy).toBe("haiku-5.5>opus-5.5")
  })
})
