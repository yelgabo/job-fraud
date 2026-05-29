import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { SignalsSchema, type Signal } from "./json-schemas"

const MODEL = "claude-haiku-4-5-20251001"

// Note: no `riskBand` here — the band is derived deterministically from `fraudScore`
// via bandFor() in the pipeline. Asking the model for it added no value and was a
// source of malformed tool calls (the model leaked XML tags into the enum value).
const ToolResultSchema = z.object({
  fraudScore: z.number().int().min(0).max(100),
  reasoning: z.string().min(1),
  signals: SignalsSchema,
})

export type ScoreResult = z.infer<typeof ToolResultSchema>

export type ScoreInput = {
  title: string
  employerDisplay: string | null
  location: string | null
  salary: string | null
  postedAt: string | null
  descriptionMd: string
  employerChecks: Record<string, unknown> | null
  applicationFlags: Array<{ flag: string; evidence: string }>
  atsProvider: string | null
  externalApplyOk: boolean | null
}

const tool: Anthropic.Tool = {
  name: "record_fraud_assessment",
  description:
    "Record the fraud-risk assessment for a single job posting. Both legitimacy and fraud signals matter; weight them in `signals[]` with negative values for legitimacy and positive for fraud.",
  input_schema: {
    type: "object",
    required: ["fraudScore", "reasoning", "signals"],
    properties: {
      fraudScore: { type: "integer", minimum: 0, maximum: 100 },
      reasoning: { type: "string", minLength: 1 },
      signals: {
        type: "array",
        items: {
          type: "object",
          required: ["label", "weight", "evidence"],
          properties: {
            label: { type: "string" },
            weight: { type: "integer", minimum: -30, maximum: 30 },
            evidence: { type: "string" },
          },
        },
      },
    },
  },
}

function buildPrompt(i: ScoreInput): string {
  return `You are auditing a WorkBC job posting for fraud risk.

Output a fraudScore 0-100 (low <30, medium 30-69, high >=70), a short prose reasoning (2-4 sentences), and a signals[] array citing specific evidence. Weight signals from -30 (strong legitimacy) to +30 (strong fraud).

CRITICAL — null vs false: A check value of \`null\` means NOT CHECKED / unknown. Treat it as
strictly NEUTRAL — never a fraud signal, never mention "missing/null verification" as a concern.
Only an explicit \`false\` (checked and failed) counts against the posting. When all checks are
null, score the posting on its TEXT alone (description quality, salary, contact method, employer
name plausibility), defaulting toward low risk unless the text itself raises a concrete flag.

SCORING GUIDANCE:
- ats_known_provider in flags → strong legitimacy signal (-20 to -30)
- addressGeocoded=false OR addressMatchConfidence<0.5 → strong fraud (+15 to +25)  [false only, not null]
- mail_physical_resume + software role → strong fraud (+20)
- generic_email_domain + no website → strong fraud (+20)
- websiteReachable=false → moderate fraud (+10 to +15)  [false only, not null]
- Vague descriptions, urgency, salary outliers, ID-upfront, fee-to-apply → fraud (+10 to +30)
- Detailed responsibilities, named team, real benefits, recognizable employer → legitimacy (-10 to -20)

POSTING
  Title: ${i.title}
  Employer: ${i.employerDisplay ?? "(hidden)"}
  Location: ${i.location ?? "(unknown)"}
  Salary: ${i.salary ?? "(unknown)"}
  Posted: ${i.postedAt ?? "(unknown)"}
  Description (markdown, truncated to 6000 chars):
${i.descriptionMd.slice(0, 6000)}

EMPLOYER VERIFICATION (deterministic — trust these):
${i.employerChecks ? JSON.stringify(i.employerChecks, null, 2) : "(employer hidden — no checks)"}

POSTING FLAGS (deterministic):
  Application flags: ${JSON.stringify(i.applicationFlags)}
  ATS provider: ${i.atsProvider ?? "(none)"}
  External apply reachable: ${i.externalApplyOk ?? "n/a"}

Now call record_fraud_assessment with your assessment.`
}

export class ScoringFailedError extends Error {
  constructor(msg: string, public readonly cause?: unknown) {
    super(msg)
  }
}

export type ScoreOutput = {
  result: ScoreResult
  usage: { inputTokens: number; outputTokens: number }
}

async function callOnce(client: Anthropic, input: ScoreInput): Promise<ScoreOutput> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    temperature: 0, // deterministic scoring — minimizes run-to-run drift on borderline postings

    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: buildPrompt(input) }],
  })
  const block = resp.content.find((b) => b.type === "tool_use")
  if (!block || block.type !== "tool_use") {
    throw new ScoringFailedError("no tool_use block in response")
  }
  const parsed = ToolResultSchema.safeParse(block.input)
  if (!parsed.success) {
    throw new ScoringFailedError("tool input failed zod validation: " + parsed.error.message)
  }
  return {
    result: parsed.data,
    usage: {
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
    },
  }
}

export async function scoreJob(client: Anthropic, input: ScoreInput): Promise<ScoreOutput> {
  try {
    return await callOnce(client, input)
  } catch (e) {
    await new Promise((r) => setTimeout(r, 2000))
    return await callOnce(client, input)
  }
}

export function makeFailedResult(reason: string): ScoreResult & { signals: Signal[] } {
  return {
    fraudScore: -1 as unknown as number,
    reasoning: "scoring failed: " + reason,
    signals: [],
  }
}
