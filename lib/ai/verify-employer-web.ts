import Anthropic from "@anthropic-ai/sdk"
import { WebVerificationSchema, type WebVerification } from "../shared/json-schemas"
import { retryOnce } from "../shared/retry"
import {
  DEFAULT_VERIFIER,
  TIERED_VERIFIER,
  VERIFIER_PROFILES,
  verifierCostUsd,
  type VerifierName,
  type VerifierProfile,
  type VerifierUsage,
} from "./verifier-models"

export type WebVerifyInput = {
  employerName: string
  jobTitle: string
  location: string | null
  descriptionExcerpt: string
  applicationText: string // the posting's "How to apply" text / mailing address, "" if none
}

// Audit trail of the server-side web_search activity behind a verification. `queries` is the
// list of searches Claude issued (quick-scan convenience); `blocks` is the raw, verbatim
// server_tool_use(web_search) + web_search_tool_result content blocks (incl. each result's opaque
// encrypted_content), so a downstream audit tool can show exactly what Claude consulted.
export type SearchLog = {
  queries: string[]
  blocks: unknown[]
}

export type WebVerifyOutput = {
  result: WebVerification
  usage: VerifierUsage
  searchLog: SearchLog
}

export class WebVerifyError extends Error {}

// The web_search server-tool content blocks aren't in the SDK's typed ContentBlock union at this
// version, so we read them structurally by their `type` string. Exported so other web_search
// callers (e.g. the impersonation check) capture the same audit trail.
export function extractSearchLog(content: unknown[]): SearchLog {
  const queries: string[] = []
  const blocks: unknown[] = []
  for (const raw of content) {
    const b = raw as { type?: string; name?: string; input?: { query?: unknown } }
    if (b?.type === "server_tool_use" && b.name === "web_search") {
      blocks.push(raw)
      if (typeof b.input?.query === "string") queries.push(b.input.query)
    } else if (b?.type === "web_search_tool_result") {
      blocks.push(raw)
    }
  }
  return { queries, blocks }
}

const webSearchTool = (type: VerifierProfile["webSearchTool"]) => ({ type, name: "web_search", max_uses: 5 })

// The server-side search loop stops with pause_turn after 10 iterations; re-sending the turn
// resumes it. Bounded so a model that never settles cannot run up searches indefinitely.
const MAX_CONTINUATIONS = 3

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
      "applicationAddressType",
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
      applicationAddressType: {
        type: "string",
        enum: ["business", "residential", "po_box", "virtual", "none", "uncertain"],
        description:
          "Nature of the address applicants are told to MAIL materials to (from APPLICATION below). Web-search the address to judge. 'business' = a genuine commercial office (ideally the company's own). 'residential' = a house/apartment/private unit. 'po_box' = a PO box. 'virtual' = a mail-forwarding/virtual-office. 'none' = the posting gives no mailing address (applies online/email). 'uncertain' = cannot tell. A residence/po_box/virtual address — especially one that is NOT the company's real office found on their website — is a serious red flag for a professional role.",
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
APPLICATION (how to apply / mailing address from the posting):
${i.applicationText || "(none given)"}
POSTING EXCERPT:
${i.descriptionExcerpt}

Do a smell test on the COMPANY (do NOT try to find this exact posting):
- Find the official website (not directories/aggregators). If none clearly exists, set websiteUrl="" and websiteReachable="unknown". Note the company's real office address from the site/registration.
- businessMatch: is it a REAL, substantive company that plausibly exists and could employ this role? Almost every real company hires software/IT/support roles, so a tech-enabled employer in ANY industry (ridesharing, retail, healthcare, fintech, etc.) counts as "match". Only use "mismatch" for genuine red flags: no real company found, a parked/empty/template website, a shell, impersonation of a known brand, or a clearly unrelated entity. Do NOT mark mismatch merely because the company's core industry differs from the job's function.
- locationMatch: does the company's stated location/address agree with the claimed location?
- hasJobsListing: does the site have a careers/jobs section at all? (a bonus legitimacy hint - do NOT search for this specific posting)
- applicationAddressType: if the APPLICATION above gives a postal/mailing address, WEB-SEARCH that exact address and classify the KIND of place it is — business (a real commercial office, ideally the company's own), residential (a house/apartment/private unit), po_box, or virtual (mail-forwarding). A residence/PO box/virtual office — ESPECIALLY one that is not the company's real office you found above — is a serious red flag for a professional role. If the posting gives no mailing address, use "none".
Use "uncertain"/"unknown" when you genuinely cannot tell. Then call record_web_verification.`
}

async function callOnce(client: Anthropic, input: WebVerifyInput, profile: VerifierProfile): Promise<WebVerifyOutput> {
  const user: Anthropic.MessageParam = { role: "user", content: buildPrompt(input) }
  const content: unknown[] = []
  const usage: VerifierUsage = { inputTokens: 0, outputTokens: 0, webSearchRequests: 0 }
  let resp: Anthropic.Message
  for (let turn = 0; ; turn++) {
    resp = await client.messages.create({
      model: profile.model,
      max_tokens: profile.maxTokens,
      ...(profile.temperature !== undefined ? { temperature: profile.temperature } : {}),
      tools: [webSearchTool(profile.webSearchTool), recordTool] as unknown as Anthropic.ToolUnion[],
      messages: turn === 0 ? [user] : [user, { role: "assistant", content: resp!.content }],
    })
    content.push(...resp.content)
    const u = resp.usage as Anthropic.Usage & { server_tool_use?: { web_search_requests?: number } }
    usage.inputTokens += u.input_tokens
    usage.outputTokens += u.output_tokens
    usage.webSearchRequests += u.server_tool_use?.web_search_requests ?? 0
    if ((resp.stop_reason as string) !== "pause_turn" || turn >= MAX_CONTINUATIONS) break
  }
  if ((resp.stop_reason as string) === "refusal") throw new WebVerifyError("model refused the verification request")
  const block = resp.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "record_web_verification",
  )
  if (!block) throw new WebVerifyError("no record_web_verification tool_use in response")
  const parsed = WebVerificationSchema.safeParse(block.input)
  if (!parsed.success) throw new WebVerifyError("tool input failed zod validation: " + parsed.error.message)
  return {
    result: parsed.data,
    usage,
    searchLog: extractSearchLog(content),
  }
}

export async function verifyEmployerWeb(
  client: Anthropic,
  input: WebVerifyInput,
  opts: { retryDelayMs?: number; profile?: VerifierProfile } = {},
): Promise<WebVerifyOutput> {
  const profile = opts.profile ?? VERIFIER_PROFILES[DEFAULT_VERIFIER]
  return retryOnce(() => callOnce(client, input, profile), opts.retryDelayMs ?? 2000)
}

/**
 * A verdict that would raise a posting's risk: the business or its location doesn't check out, or
 * the mailing address is a home, P.O. box or mail drop. These are the answers worth a second,
 * stronger look before they reach a published rating; everything else adds no risk.
 */
export function isAlarmingVerdict(w: WebVerification): boolean {
  return (
    w.businessMatch === "mismatch" ||
    w.locationMatch === "mismatch" ||
    ["residential", "po_box", "virtual"].includes(w.applicationAddressType)
  )
}

/**
 * Whether the primary model's verdict gets a second look from the escalation model: when it is
 * alarming, or when the posting gives a mailing address and the primary could not classify it.
 * The second case is the one alarming verdicts miss: on 1,000 postings Haiku left a house address
 * "uncertain" (Timberdale Supply) where Opus found the residence that floors a score at 70.
 */
export function needsEscalation(w: WebVerification, applicationText: string): boolean {
  return isAlarmingVerdict(w) || (applicationText.trim() !== "" && w.applicationAddressType === "uncertain")
}

/**
 * Why a verdict breaks the tiered rule, or null when it doesn't. A verdict that needs escalation
 * must come from the escalation model, alone or after the primary; any other may come from either.
 * The keyless apply step enforces this because there no code escalates for it.
 */
export function tierViolation(w: WebVerification, applicationText: string): string | null {
  if (!needsEscalation(w, applicationText)) return null
  const { primary, escalation } = TIERED_VERIFIER
  if (w.verifiedBy === escalation || w.verifiedBy === `${primary}>${escalation}`) return null
  return `verdict needing escalation has verifiedBy=${w.verifiedBy ?? "(none)"}; it needs ${escalation}, alone or as ${primary}>${escalation}`
}

export type TieredVerifyOutput = WebVerifyOutput & { escalated: boolean; costUsd: number }

/**
 * The employer check the judging paths use: the primary model first, and the escalation model in
 * its place when needsEscalation() says so. A failed escalation throws rather than keep
 * the unconfirmed alarm, so the caller treats it like any other failed verification.
 */
export async function verifyEmployerTiered(
  client: Anthropic,
  input: WebVerifyInput,
  opts: { retryDelayMs?: number; primary?: VerifierName; escalation?: VerifierName } = {},
): Promise<TieredVerifyOutput> {
  const primaryName = opts.primary ?? TIERED_VERIFIER.primary
  const escalationName = opts.escalation ?? TIERED_VERIFIER.escalation
  const primary = VERIFIER_PROFILES[primaryName]
  const escalation = VERIFIER_PROFILES[escalationName]
  const first = await verifyEmployerWeb(client, input, { retryDelayMs: opts.retryDelayMs, profile: primary })
  const firstCost = verifierCostUsd(primary, first.usage)
  if (!needsEscalation(first.result, input.applicationText)) {
    return { ...first, result: { ...first.result, verifiedBy: primaryName }, escalated: false, costUsd: firstCost }
  }
  const second = await verifyEmployerWeb(client, input, { retryDelayMs: opts.retryDelayMs, profile: escalation })
  return {
    result: { ...second.result, verifiedBy: `${primaryName}>${escalationName}` },
    usage: {
      inputTokens: first.usage.inputTokens + second.usage.inputTokens,
      outputTokens: first.usage.outputTokens + second.usage.outputTokens,
      webSearchRequests: first.usage.webSearchRequests + second.usage.webSearchRequests,
    },
    searchLog: {
      queries: [...first.searchLog.queries, ...second.searchLog.queries],
      blocks: [...first.searchLog.blocks, ...second.searchLog.blocks],
    },
    escalated: true,
    costUsd: firstCost + verifierCostUsd(escalation, second.usage),
  }
}
