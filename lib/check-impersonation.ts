// When a posting names employer X but applies via a different company's ATS tenant Y, this asks
// Claude (with web_search) what the real relationship is — so a legitimate parent/subsidiary
// (LexisNexis applying via RELX's Workday) is cleared, while true brand misuse is confirmed.
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { extractSearchLog, type SearchLog } from "./verify-employer-web"

const MODEL = "claude-haiku-4-5-20251001"

export type ImpersonationInput = {
  claimedEmployer: string
  tenant: string // ATS tenant slug, e.g. "relx"
  provider: string // e.g. "workday"
  applyUrl: string
  jobTitle: string
}

export const ImpersonationSchema = z.object({
  // same = tenant IS the claimed employer (alias/rebrand); affiliate = parent/subsidiary/owned brand
  // (legitimate); impersonation = unrelated companies (brand misuse); uncertain = can't tell.
  relationship: z.enum(["same", "affiliate", "impersonation", "uncertain"]),
  realCompany: z
    .string()
    .transform((s) => (s.trim() ? s.trim() : null))
    .nullable(),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
})
export type ImpersonationResult = z.infer<typeof ImpersonationSchema>

export type ImpersonationOutput = {
  result: ImpersonationResult
  usage: { inputTokens: number; outputTokens: number }
  searchLog: SearchLog
}

export class ImpersonationError extends Error {}

const webSearchTool = { type: "web_search_20250305", name: "web_search", max_uses: 5 } as const

const recordTool: Anthropic.Tool = {
  name: "record_impersonation_check",
  description: "Record the relationship between the ATS tenant (apply-URL destination) and the claimed employer.",
  input_schema: {
    type: "object",
    required: ["relationship", "realCompany", "confidence", "summary"],
    properties: {
      relationship: {
        type: "string",
        enum: ["same", "affiliate", "impersonation", "uncertain"],
        description:
          "'same' = the ATS tenant IS the claimed employer (alias/rebrand). 'affiliate' = the tenant is the parent, subsidiary, or owning group of the claimed employer (or vice-versa) — legitimate, e.g. a brand applying via its parent's hiring system. 'impersonation' = the tenant and the claimed employer are UNRELATED companies, so the posting misuses the claimed brand's name while routing applicants to an unrelated company. 'uncertain' = cannot determine.",
      },
      realCompany: {
        type: "string",
        description:
          "Official name of the company that actually owns the ATS tenant (the apply-URL destination). Empty string if unknown.",
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      summary: { type: "string", description: "<= 400 chars of reasoning." },
    },
  },
}

function buildPrompt(i: ImpersonationInput): string {
  return `A WorkBC job posting names the employer "${i.claimedEmployer}" for a "${i.jobTitle}" role, but its application link routes to the "${i.tenant}" tenant on ${i.provider}:
${i.applyUrl}

Use web_search to determine the company that actually owns the "${i.tenant}" ${i.provider} careers site, and its relationship to "${i.claimedEmployer}":
- same: "${i.tenant}" IS "${i.claimedEmployer}" (same company, alias, or rebrand).
- affiliate: "${i.tenant}" is the parent, subsidiary, sibling, or owning group of "${i.claimedEmployer}" (or vice-versa) — a legitimate corporate relationship (e.g. a brand applying through its parent's hiring system).
- impersonation: "${i.tenant}" and "${i.claimedEmployer}" are UNRELATED companies — the posting uses "${i.claimedEmployer}"'s name but sends applicants to an unrelated company's hiring system. Brand misuse.
- uncertain: you genuinely cannot tell.
Identify the real company behind "${i.tenant}" (realCompany). Then call record_impersonation_check.`
}

async function callOnce(client: Anthropic, input: ImpersonationInput): Promise<ImpersonationOutput> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    temperature: 0,
    tools: [webSearchTool, recordTool] as unknown as Anthropic.ToolUnion[],
    messages: [{ role: "user", content: buildPrompt(input) }],
  })
  const block = resp.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "record_impersonation_check",
  )
  if (!block) throw new ImpersonationError("no record_impersonation_check tool_use in response")
  const parsed = ImpersonationSchema.safeParse(block.input)
  if (!parsed.success) throw new ImpersonationError("tool input failed zod validation: " + parsed.error.message)
  return {
    result: parsed.data,
    usage: { inputTokens: resp.usage.input_tokens, outputTokens: resp.usage.output_tokens },
    searchLog: extractSearchLog(resp.content),
  }
}

export async function checkImpersonation(
  client: Anthropic,
  input: ImpersonationInput,
  opts: { retryDelayMs?: number } = {},
): Promise<ImpersonationOutput> {
  try {
    return await callOnce(client, input)
  } catch {
    await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 2000))
    return await callOnce(client, input)
  }
}
