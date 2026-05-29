# Employer Web Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For each named WorkBC employer, use Claude's `web_search` tool to discover their official website and vibe-check the company (real business? location agrees? careers section exists?), feeding the result into the fraud score and the employer page.

**Architecture:** A new `lib/verify-employer-web.ts` makes one Anthropic call per employer exposing the server-side `web_search` tool plus a custom `record_web_verification` tool; the structured verdict is merged into the employer's `checks.web`, persisted, read by `lib/scoring.ts`, and rendered on `app/e/[id]`. It runs in `scripts/scrape.ts` Phase C, on by default, cached by the existing 7-day employer-check freshness, with `p-limit(3)` concurrency.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk` (server `web_search` tool), zod, Prisma, Next.js 15, vitest.

**Spec:** `docs/superpowers/specs/2026-05-29-employer-web-verification-design.md`

---

## File Structure

- `lib/json-schemas.ts` (modify) — add `WebVerificationSchema` + `WebVerification` type; extend `ChecksSchema` with optional nullable `web`. This is the shared, SDK-free schema home so the web UI never bundles the Anthropic SDK.
- `lib/json-schemas.test.ts` (create) — tests for the new schema.
- `lib/verify-employer-web.ts` (create) — `verifyEmployerWeb()`, `WebVerifyError`, tool defs, prompt, retry. Imports the schema from `json-schemas.ts`.
- `lib/verify-employer-web.test.ts` (create) — mocked-SDK tests.
- `lib/scoring.ts` (modify) — scoring-prompt guidance for the `web.*` fields.
- `scripts/scrape.ts` (modify) — `--no-verify-web` flag, representative-job map, Phase C web-verify pass with `p-limit(3)`, logging + summary.
- `app/e/[id]/page.tsx` (modify) — "Web verification" card.

---

## Task 1: WebVerification schema + ChecksSchema.web

**Files:**
- Modify: `lib/json-schemas.ts`
- Test: `lib/json-schemas.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/json-schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { WebVerificationSchema, parseChecks } from "./json-schemas"

describe("WebVerificationSchema", () => {
  it("parses a full verdict and nulls an empty websiteUrl", () => {
    const v = WebVerificationSchema.parse({
      websiteUrl: "",
      websiteReachable: "yes",
      businessMatch: "match",
      locationMatch: "uncertain",
      hasJobsListing: "no",
      confidence: 0.8,
      summary: "ok",
    })
    expect(v.websiteUrl).toBeNull()
    expect(v.businessMatch).toBe("match")
  })

  it("trims and keeps a real websiteUrl", () => {
    const v = WebVerificationSchema.parse({
      websiteUrl: " https://acme.com ",
      websiteReachable: "yes",
      businessMatch: "match",
      locationMatch: "match",
      hasJobsListing: "yes",
      confidence: 0.9,
      summary: "real",
    })
    expect(v.websiteUrl).toBe("https://acme.com")
  })

  it("rejects an invalid enum or out-of-range confidence", () => {
    const base = {
      websiteUrl: "x",
      websiteReachable: "yes",
      businessMatch: "match",
      locationMatch: "match",
      hasJobsListing: "yes",
      confidence: 1,
      summary: "",
    }
    expect(() => WebVerificationSchema.parse({ ...base, businessMatch: "nope" })).toThrow()
    expect(() => WebVerificationSchema.parse({ ...base, confidence: 5 })).toThrow()
  })
})

describe("ChecksSchema.web", () => {
  it("accepts web present, null, or absent", () => {
    expect(parseChecks({}).web).toBeUndefined()
    expect(parseChecks({ web: null }).web).toBeNull()
    const c = parseChecks({
      web: {
        websiteUrl: "https://x.com",
        websiteReachable: "yes",
        businessMatch: "match",
        locationMatch: "match",
        hasJobsListing: "yes",
        confidence: 0.9,
        summary: "s",
      },
    })
    expect(c.web?.websiteUrl).toBe("https://x.com")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/json-schemas.test.ts`
Expected: FAIL — `WebVerificationSchema` is not exported.

- [ ] **Step 3: Add the schema to `lib/json-schemas.ts`**

Add, after the existing `SignalsSchema` block and before the `Checks` type exports:

```ts
export const WebVerificationSchema = z.object({
  websiteUrl: z
    .string()
    .transform((s) => (s.trim() ? s.trim() : null))
    .nullable(),
  websiteReachable: z.enum(["yes", "no", "unknown"]),
  businessMatch: z.enum(["match", "mismatch", "uncertain"]),
  locationMatch: z.enum(["match", "mismatch", "uncertain"]),
  hasJobsListing: z.enum(["yes", "no", "unknown"]),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
})

export type WebVerification = z.infer<typeof WebVerificationSchema>
```

Then add `web` to the existing `ChecksSchema` object (inside `z.object({ ... })`, before `.passthrough()`):

```ts
    web: WebVerificationSchema.nullable().optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/json-schemas.test.ts`
Expected: PASS (3 + ... assertions, all green).

- [ ] **Step 5: Commit**

```bash
git add lib/json-schemas.ts lib/json-schemas.test.ts
git commit -m "feat: WebVerification schema + checks.web field"
```

---

## Task 2: verify-employer-web module

**Files:**
- Create: `lib/verify-employer-web.ts`
- Test: `lib/verify-employer-web.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/verify-employer-web.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/verify-employer-web.test.ts`
Expected: FAIL — cannot import `verifyEmployerWeb`.

- [ ] **Step 3: Create `lib/verify-employer-web.ts`**

```ts
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
        description: "Is this a real, substantive business whose field matches the employer name + posting?",
      },
      locationMatch: {
        type: "string",
        enum: ["match", "mismatch", "uncertain"],
        description: "Does the company's stated location/address agree with the posting's claimed location?",
      },
      hasJobsListing: {
        type: "string",
        enum: ["yes", "no", "unknown"],
        description: "Does the site have a careers/jobs section at all? (bonus only — do NOT look for this exact posting)",
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
- businessMatch: is it a real, substantive business whose industry/about info plausibly matches the employer name and this role?
- locationMatch: does the company's stated location/address agree with the claimed location?
- hasJobsListing: does the site have a careers/jobs section at all? (a bonus legitimacy hint — do NOT search for this specific posting)
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/verify-employer-web.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If the SDK rejects the `web_search` tool `type` string, fix the version string per the SDK's exported web-search tool type, then re-run.

- [ ] **Step 6: Commit**

```bash
git add lib/verify-employer-web.ts lib/verify-employer-web.test.ts
git commit -m "feat: verifyEmployerWeb (Claude web_search company smell-test)"
```

---

## Task 3: Scoring-prompt guidance for web.*

**Files:**
- Modify: `lib/scoring.ts`

- [ ] **Step 1: Add guidance lines**

In `lib/scoring.ts`, inside `buildPrompt`, find the `SCORING GUIDANCE:` list and add these lines immediately after the `crypto_payment / banking_info_upfront` line:

```ts
- web.businessMatch=="mismatch" → strong fraud (+20 to +30); =="match" → legitimacy (-10 to -20)
- web.locationMatch=="mismatch" → moderate fraud (+10 to +15); =="match" → mild legitimacy (-5)
- web.hasJobsListing=="yes" → mild legitimacy bonus (-5 to -10); "no"/"unknown" is NEUTRAL, never a penalty
- web fields that are null/"uncertain"/"unknown" → strictly neutral (same null-vs-false rule)
```

(The `checks` object — including `web` — is already serialized into the EMPLOYER VERIFICATION block, so no other change is needed.)

- [ ] **Step 2: Verify the guidance is present and the project still builds**

Run: `npx tsc --noEmit`
Expected: clean.
Run: `node -e "const s=require('fs').readFileSync('lib/scoring.ts','utf8'); if(!s.includes('web.businessMatch')) { console.error('missing guidance'); process.exit(1)} console.log('guidance present')"`
Expected: `guidance present`.

- [ ] **Step 3: Commit**

```bash
git add lib/scoring.ts
git commit -m "feat: score the employer web-verification signals"
```

---

## Task 4: Pipeline wiring in scripts/scrape.ts

**Files:**
- Modify: `scripts/scrape.ts`

- [ ] **Step 1: Add the import**

Near the other `lib` imports, add:

```ts
import { verifyEmployerWeb } from "../lib/verify-employer-web"
```

- [ ] **Step 2: Add the flag to the `Args` type and `parseArgs`**

In the `Args` type add:

```ts
  verifyWeb: boolean
```

In `parseArgs`, set the default in the initial object:

```ts
    verifyWeb: true,
```

and add a branch in the arg loop:

```ts
    else if (t === "--no-verify-web") a.verifyWeb = false
```

- [ ] **Step 3: Hoist the Anthropic client so Phase C can use it**

In `lib/scoring.ts` the client is the caller's responsibility. In `scripts/scrape.ts`, the client is currently created in Phase D. Move its creation to just before Phase C (employer checks). Add this line right before the `// Phase C` comment / employer-map building:

```ts
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
```

and DELETE the now-duplicate `const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })` line inside Phase D.

- [ ] **Step 4: Capture a representative job per employer**

In the employer-map building loop (Phase C), add a `repJob` map. Replace the existing loop:

```ts
    const employerMap = new Map<string, EmployerRow>()
    for (const e of enriched) {
      const display = e.detail.employerName ?? e.stub.employerName ?? null
      if (!display) continue
      const key = normalizeEmployer(display)
      if (!key) continue
      if (employerMap.has(key)) continue
      employerMap.set(key, {
```

with:

```ts
    const employerMap = new Map<string, EmployerRow>()
    const repJob = new Map<string, EnrichedJob>()
    for (const e of enriched) {
      const display = e.detail.employerName ?? e.stub.employerName ?? null
      if (!display) continue
      const key = normalizeEmployer(display)
      if (!key) continue
      if (!repJob.has(key)) repJob.set(key, e)
      if (employerMap.has(key)) continue
      employerMap.set(key, {
```

- [ ] **Step 5: Mark fresh-checked employers for web verification**

In the employer-check loop, find the end of the new-checks branch (the lines `emp.checks = checks`, `emp.checkedAt = new Date()`, `newChecks++`). Declare a collector just before the loop:

```ts
    const toVerify: string[] = []
```

and immediately after `newChecks++` add:

```ts
      if (args.verifyWeb && !isOffline && !args.dryRun) toVerify.push(emp.nameNormalized)
```

- [ ] **Step 6: Run the web-verification pass (after the employer-check loop, before Phase D)**

Insert this block right after the `console.log(`[employers] checks: ...`)` line:

```ts
    let webIn = 0
    let webOut = 0
    let webFail = 0
    if (toVerify.length > 0) {
      const webLimit = pLimit(3)
      await Promise.all(
        toVerify.map((key) =>
          webLimit(async () => {
            const emp = employerMap.get(key)!
            const rep = repJob.get(key)
            if (!rep) return
            const vt0 = Date.now()
            try {
              const out = await verifyEmployerWeb(client, {
                employerName: emp.nameDisplay,
                jobTitle: rep.detail.title || rep.stub.title,
                location: rep.detail.location ?? rep.stub.location ?? null,
                descriptionExcerpt: rep.descriptionMd.slice(0, 800),
              })
              emp.checks.web = out.result
              webIn += out.usage.inputTokens
              webOut += out.usage.outputTokens
              log.log({
                employer: emp.nameDisplay,
                stage: "verify-web",
                ok: true,
                durationMs: Date.now() - vt0,
                meta: {
                  businessMatch: out.result.businessMatch,
                  locationMatch: out.result.locationMatch,
                  hasJobsListing: out.result.hasJobsListing,
                  in: out.usage.inputTokens,
                  out: out.usage.outputTokens,
                },
              })
            } catch (err) {
              webFail++
              emp.checks.web = null
              log.log({
                employer: emp.nameDisplay,
                stage: "verify-web",
                ok: false,
                durationMs: Date.now() - vt0,
                error: (err as Error).message,
              })
            }
          }),
        ),
      )
      console.log(`[employers] web-verified ${toVerify.length - webFail}/${toVerify.length}, ${webFail} failed`)
    }
```

- [ ] **Step 7: Report web tokens in the end-of-run summary**

In the `=== SUMMARY ===` block, after the `Claude tokens:` line, add:

```ts
    console.log(`Web-verify tokens: in=${webIn} out=${webOut}`)
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 9: Verify offline mode SKIPS web verification (no network/Claude)**

Run: `npm run scrape -- --fixtures __fixtures__`
Expected: completes; output does NOT contain a `[employers] web-verified` line (because `isOffline` is true → `toVerify` is empty); `Web-verify tokens: in=0 out=0` in the summary.

- [ ] **Step 10: Commit**

```bash
git add scripts/scrape.ts
git commit -m "feat: run employer web-verification in Phase C (on by default, cached, p-limit 3)"
```

---

## Task 5: Employer page "Web verification" card

**Files:**
- Modify: `app/e/[id]/page.tsx`

- [ ] **Step 1: Add a tri-state badge helper**

In `app/e/[id]/page.tsx`, add this helper next to the existing `ReachBadge` function:

```tsx
function TriBadge({
  value,
  good,
  bad,
  unknown,
}: {
  value: string | null | undefined
  good: string
  bad: string
  unknown: string
}) {
  if (value === "match" || value === "yes")
    return <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">{good}</span>
  if (value === "mismatch" || value === "no")
    return <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">{bad}</span>
  return <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">{unknown}</span>
}
```

- [ ] **Step 2: Render the card**

Immediately after the closing `</section>` of the existing `grid gap-4 sm:grid-cols-2` block, add:

```tsx
      {checks.web && (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Web verification</h2>
          <div className="flex flex-wrap items-center gap-2">
            {checks.web.websiteUrl ? (
              <a
                href={checks.web.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {checks.web.websiteUrl}
              </a>
            ) : (
              <span className="italic text-zinc-400">no site found</span>
            )}
            <TriBadge
              value={checks.web.businessMatch}
              good="real / matches"
              bad="business mismatch"
              unknown="business uncertain"
            />
            <TriBadge
              value={checks.web.locationMatch}
              good="location agrees"
              bad="location mismatch"
              unknown="location uncertain"
            />
            {checks.web.hasJobsListing === "yes" && (
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">has careers page</span>
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {checks.web.summary} (confidence {checks.web.confidence.toFixed(2)})
          </p>
        </section>
      )}
```

- [ ] **Step 3: Build to typecheck the JSX + new `checks.web` access**

Run: `npm run build`
Expected: compiles successfully; `/e/[id]` listed as a dynamic route.

- [ ] **Step 4: Commit**

```bash
git add app/e/[id]/page.tsx
git commit -m "feat: render employer web-verification card"
```

---

## Task 6: Full verification + live smoke + push

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all suites pass (existing 30 + Task 1 + Task 2 tests).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Live smoke (small, costs a few Claude/web-search calls)**

Run: `npm run scrape -- --limit 3 --reverify-employers`
Expected: a `[employers] web-verified N/N` line; `Web-verify tokens: in=... out=...` non-zero in the summary; 0 unhandled rejections.

- [ ] **Step 4: Spot-check the DB + live employer page**

Run:
```bash
node --env-file=.env -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const e=await p.employer.findFirst({where:{checkedAt:{not:null}},orderBy:{checkedAt:'desc'}});console.log(e.nameDisplay, JSON.stringify(JSON.parse(JSON.stringify(e.checks)).web));await p.\$disconnect()})()"
```
Expected: a `web` object with `businessMatch`/`locationMatch`/`hasJobsListing`/`websiteUrl`/`summary`.

Then open the employer page for that employer on the live site (or `npm run dev`) and confirm the "Web verification" card renders.

- [ ] **Step 5: Push**

```bash
git push origin main
```
Expected: pushes the feature commits. (No redeploy action needed — the web app reads the DB; the scraper change is local. Railway auto-builds from the push but the running site is unaffected by the scraper code.)

---

## Self-Review

**Spec coverage:**
- Discover site + smell test (businessMatch) → Task 2 prompt + schema; scored in Task 3. ✓
- Location corroboration (locationMatch) → schema + prompt (Task 2) + scoring (Task 3). ✓
- Careers-section bonus (hasJobsListing), no strict posting match → schema/prompt explicitly say "do NOT look for this exact posting" (Task 2); scored as bonus, absence neutral (Task 3). ✓
- Engine = Claude web_search + custom tool, single call, tool_choice auto → Task 2. ✓
- On by default, cached, `--no-verify-web`, offline/dry-run skip → Task 4 (toVerify gated on `!isOffline && !args.dryRun && args.verifyWeb`; only fresh-checked employers enqueued). ✓
- `p-limit(3)` concurrency → Task 4 Step 6. ✓
- Null/failure → neutral, never fabricated → Task 2 retry-then-throw; Task 4 sets `checks.web = null` on error. ✓
- Schema in SDK-free `json-schemas.ts` → Task 1. ✓
- UI card → Task 5. ✓
- Tests (mocked SDK: valid / retry / double-fail / no-tool-block) → Task 2. ✓
- Summary reports web tokens separately → Task 4 Step 7. ✓

**Placeholder scan:** none — all code blocks are complete; the only flagged unknown (the `web_search` tool version string) has an explicit verify-and-fix step (Task 2 Step 5).

**Type consistency:** `WebVerification` fields (`websiteUrl`, `websiteReachable`, `businessMatch`, `locationMatch`, `hasJobsListing`, `confidence`, `summary`) are identical across the schema (Task 1), the tool `input_schema` and parse (Task 2), the scoring guidance (Task 3), the log `meta` (Task 4), and the UI card (Task 5). `verifyEmployerWeb(client, input, opts?)` signature matches its call site in Task 4 and its tests in Task 2. `EnrichedJob`, `EmployerRow`, `repJob`, `toVerify`, `pLimit`, and `client` all reference existing or task-introduced symbols.
