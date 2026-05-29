import Anthropic from "@anthropic-ai/sdk"
import { WebVerificationSchema, type WebVerification } from "./json-schemas"

const MODEL = "claude-haiku-4-5-20251001"

export type WebVerifyInput = {
  employerName: string
  jobTitle: string
  location: string | null
  descriptionExcerpt: string
}

export type WebVerifyOutput = {
  result: WebVerification
  usage: { inputTokens: number; outputTokens: number }
}

export class WebVerifyError extends Error {}

// Server-side web search tool. Confirm the exact `type` version string against the installed
// @anthropic-ai/sdk at implementation time (e.g. "web_search_20250305").
const webSearchTool = { type: "web_search_20250305", name: "web_search", max_uses: 5 } as const

const recordTool: Anthropic.Tool = {
  name: "record_web_verification",
  description: "Record the employer web-presence verification result.",
  input_schema: {
    type: "object",
    required: [
      "websiteUrl",
      "websiteReachable",
      "businessMatch",
      "locationMatch",
      "hasJobsListing",
      "confidence",
      "summary",
    ],
    properties: {
      websiteUrl: { type: "string", description: "Official site URL, or empty string if none found." },
      websiteReachable: { type: "string", enum: ["yes", "no", "unknown"] },
      businessMatch: {
        type: "string",
        enum: ["match", "mismatch", "uncertain"],
        description:
          "Is this a REAL, substantive company that plausibly exists and could employ this role? 'match' = a genuine company (any industry — companies hire software/IT/support/etc. roles regardless of their core business). 'mismatch' ONLY for genuine red flags: no real company found, a parked/empty/template site, a shell, impersonation of a known brand, or a clearly unrelated entity. Do NOT mark mismatch just because the company's core industry differs from the job's function.",
      },
      locationMatch: {
        type: "string",
        enum: ["match", "mismatch", "uncertain"],
        description: "Does the company's stated location/address agree with the posting's claimed location?",
      },
      hasJobsListing: {
        type: "string",
        enum: ["yes", "no", "unknown"],
        description: "Does the site have a careers/jobs section at all? (bonus only - do NOT look for this exact posting)",
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      summary: { type: "string", description: "<= 400 chars of reasoning." },
    },
  },
}

function buildPrompt(i: WebVerifyInput): string {
  return `Verify the web presence of a job-posting employer. Use web_search to find their official website.

EMPLOYER: ${i.employerName}
POSTING TITLE: ${i.jobTitle}
CLAIMED LOCATION: ${i.location ?? "(unknown)"}
POSTING EXCERPT:
${i.descriptionExcerpt}

Do a smell test on the COMPANY (do NOT try to find this exact posting):
- Find the official website (not directories/aggregators). If none clearly exists, set websiteUrl="" and websiteReachable="unknown".
- businessMatch: is it a REAL, substantive company that plausibly exists and could employ this role? Almost every real company hires software/IT/support roles, so a tech-enabled employer in ANY industry (ridesharing, retail, healthcare, fintech, etc.) counts as "match". Only use "mismatch" for genuine red flags: no real company found, a parked/empty/template website, a shell, impersonation of a known brand, or a clearly unrelated entity. Do NOT mark mismatch merely because the company's core industry differs from the job's function.
- locationMatch: does the company's stated location/address agree with the claimed location?
- hasJobsListing: does the site have a careers/jobs section at all? (a bonus legitimacy hint - do NOT search for this specific posting)
Use "uncertain"/"unknown" when you genuinely cannot tell. Then call record_web_verification.`
}

async function callOnce(client: Anthropic, input: WebVerifyInput): Promise<WebVerifyOutput> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    temperature: 0,
    tools: [webSearchTool, recordTool] as unknown as Anthropic.ToolUnion[],
    messages: [{ role: "user", content: buildPrompt(input) }],
  })
  const block = resp.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "record_web_verification",
  )
  if (!block) throw new WebVerifyError("no record_web_verification tool_use in response")
  const parsed = WebVerificationSchema.safeParse(block.input)
  if (!parsed.success) throw new WebVerifyError("tool input failed zod validation: " + parsed.error.message)
  return {
    result: parsed.data,
    usage: { inputTokens: resp.usage.input_tokens, outputTokens: resp.usage.output_tokens },
  }
}

export async function verifyEmployerWeb(
  client: Anthropic,
  input: WebVerifyInput,
  opts: { retryDelayMs?: number } = {},
): Promise<WebVerifyOutput> {
  try {
    return await callOnce(client, input)
  } catch {
    await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 2000))
    return await callOnce(client, input)
  }
}
