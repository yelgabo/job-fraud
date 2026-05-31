// When a posting names employer X but applies via a different company's ATS tenant Y, this asks
// Claude (with web_search) what the real relationship is — so a legitimate parent/subsidiary
// (LexisNexis applying via RELX's Workday) is cleared, while true brand misuse is confirmed.
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { extractSearchLog, type SearchLog } from "./verify-employer-web"

// Stronger model than the rest of the pipeline (which is Haiku): this is a rare call (only on an
// apply-host mismatch) and demands corporate-genealogy synthesis across web sources — exactly where
// a small model under-performs (it mislabeled CapWest Build, Onni Group's construction division, as
// an impersonation). Opus 4.8 rejects temperature/top_p/top_k, so none are set below.
const MODEL = "claude-opus-4-8"

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
          "'same' = the ATS tenant IS the claimed employer (alias, rebrand, or legal name). 'affiliate' = ANY legitimate corporate tie in either direction — parent, subsidiary, sibling, owning group, in-house division or operating arm, brand/trade name, or an entity that owns / operates / manages the other or shares ownership or leadership (e.g. a construction division applying via its parent group's hiring system). 'impersonation' = the tenant and the claimed employer are genuinely UNRELATED companies with no ownership, control, division, or shared-leadership tie — the posting misuses the claimed brand's name while routing applicants to an unrelated company. 'uncertain' = you cannot confidently establish the relationship. IMPORTANT: choose 'impersonation' ONLY when you are confident the two are unrelated. If there is ANY plausible corporate tie, or you are unsure, choose 'affiliate' or 'uncertain' — never 'impersonation'.",
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

Use web_search to identify the company that owns the "${i.tenant}" ${i.provider} careers site, then determine its relationship to "${i.claimedEmployer}". Investigate specifically: does one own, operate, or manage the other? Is the claimed employer a division, brand, or trade name of the tenant's group (or vice-versa)? Do they share ownership or leadership? Check the tenant's "divisions"/"brands"/"about" pages and the claimed employer's leadership/ownership.
- same: "${i.tenant}" IS "${i.claimedEmployer}" (same company, alias, or rebrand).
- affiliate: ANY legitimate corporate tie in either direction — parent, subsidiary, sibling, owning group, in-house division or operating arm, brand/trade name, or one owns/operates/manages the other or they share ownership/leadership (e.g. a construction division applying through its parent group's hiring system).
- impersonation: "${i.tenant}" and "${i.claimedEmployer}" are genuinely UNRELATED companies — the posting uses "${i.claimedEmployer}"'s name but sends applicants to an unrelated company's hiring system. Brand misuse.
- uncertain: you cannot confidently establish the relationship.
Choose "impersonation" ONLY if you are confident the two are genuinely unrelated. If there is ANY plausible corporate tie, or you are unsure, choose "affiliate" or "uncertain" — never "impersonation". Identify the real company behind "${i.tenant}" (realCompany). Then call record_impersonation_check.`
}

async function callOnce(client: Anthropic, input: ImpersonationInput): Promise<ImpersonationOutput> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 3000, // headroom for web-search rounds + the tool call on Opus
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
