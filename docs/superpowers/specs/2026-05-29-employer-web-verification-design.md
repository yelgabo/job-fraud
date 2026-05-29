# Design: Employer Web Verification

**Date:** 2026-05-29
**Status:** Approved (brainstorm), pending implementation plan
**Component of:** job-fraud v1

## Problem

WorkBC postings give us the employer **name** but no website or structured address.
As a result the existing employer-level checks in `scripts/scrape.ts` Phase C
(`websiteReachable` probe, `geocode`, the new `addressMatchesCity`) have **no input on
real data** — every employer comes back with `addressRaw: null` and no website, so an
entire category of fraud signals is inert. The live scrape on 2026-05-29 confirmed this:
20/20 employers had no website and no geocoded address.

We want to recover that signal by discovering the employer's real web presence ourselves
and cross-checking the posting against it.

## Goal

For each unique employer, **full cross-check**:

1. Find the employer's official website.
2. Confirm it's a real business whose line of work plausibly matches the posting.
3. Find the employer's careers page and determine whether **this specific posting**
   appears there.

These become deterministic-ish signals that feed the existing Claude fraud score.

## Decisions (resolved during brainstorm)

1. **Engine = Claude's built-in `web_search` server tool** via `@anthropic-ai/sdk`. The
   scraper is a standalone Node script (`tsx scripts/scrape.ts`) and cannot use Claude
   Code's MCP tools, so it needs its own mechanism. Using the Anthropic SDK reuses the
   `ANTHROPIC_API_KEY` we already have and adds no new dependency or API key.
2. **Single combined call (Approach A)**: one `messages.create` exposes BOTH the
   server-side `web_search` tool AND a custom `record_web_verification` tool. Claude
   searches and reads pages server-side, then calls our custom tool with a structured
   verdict. We do not scrape search results or fetch pages ourselves. Rejected Approach B
   (search call → Node fetch → separate judge call) as more code and more failure modes.
3. **Run policy = on by default, cached.** Web verification runs inside the existing
   employer-check block, so it inherits the 7-day freshness check and `--reverify-employers`.
   A re-scrape mostly hits cached results. A `--no-verify-web` flag skips it for cheap runs.
   Offline (`--fixtures`) and `--dry-run` skip it automatically (no network / no Claude).
4. **Concurrency**: web-verification calls run with `p-limit(3)` to bound wall time
   (each call takes several seconds). Geocoding keeps its own strict 1-req/sec mutex,
   independent of this.
5. **Failure posture**: any transport/parse failure (after one retry) leaves the web fields
   `null` — neutral, never fabricated. Mirrors `lib/scoring.ts`.

## Architecture

```
scripts/scrape.ts  (Phase C — employer enrichment, per unique employer)
  existing: website probe (lib/http-probe.ts) + geocode (lib/geocode.ts) + cityMatches
  NEW:      verifyEmployerWeb(client, input)  ──▶ lib/verify-employer-web.ts
                                                     │
                                  Anthropic messages.create
                                  tools: [ web_search (server), record_web_verification (custom) ]
                                  tool_choice: auto
                                                     │
                                  zod-validated WebVerification ──▶ checks.web = {...}
  ──▶ checks (incl. checks.web) persisted on Employer row
  ──▶ lib/scoring.ts reads checks in the fraud-score prompt
  ──▶ app/e/[id]/page.tsx renders a "Web verification" card
```

## New module: `lib/verify-employer-web.ts`

```ts
export type WebVerifyInput = {
  employerName: string
  jobTitle: string
  location: string | null
  descriptionExcerpt: string   // first ~800 chars of the posting, to identify the role/company
}

export type WebVerification = {
  websiteUrl: string | null
  websiteReachable: boolean | null
  businessMatch: "match" | "mismatch" | "uncertain"
  postingFound: "found" | "not_found" | "uncertain"
  postingUrl: string | null
  confidence: number            // 0..1
  summary: string               // short prose, <= ~400 chars
}

export class WebVerifyError extends Error {}

export async function verifyEmployerWeb(
  client: Anthropic,
  input: WebVerifyInput,
): Promise<{ result: WebVerification; usage: { inputTokens: number; outputTokens: number } }>
```

- Model: `claude-haiku-4-5-20251001` (same as scoring), `temperature: 0`.
- `tools`:
  - server web search tool (current API tool type, e.g. `{ type: "web_search_20250305",
    name: "web_search", max_uses: 5 }` — exact version string confirmed against the SDK at
    implementation time).
  - custom `record_web_verification` tool whose `input_schema` matches `WebVerification`.
- `tool_choice: { type: "auto" }` — cannot force the custom tool, because the model must be
  free to call `web_search` first. Prompt explicitly instructs: search, read the official
  site + careers page, then call `record_web_verification`.
- Parse the `record_web_verification` tool_use block with a zod schema; if absent or invalid,
  retry once after 2s; second failure throws `WebVerifyError`.
- Returns usage so the pipeline can log/aggregate tokens (web search is billed separately;
  log the count of web-search uses if the API surfaces it).

## Pipeline wiring (`scripts/scrape.ts`)

- New CLI flag `--no-verify-web` (default: verification ON).
- New `Args` field `verifyWeb: boolean` (true unless `--no-verify-web`).
- Inside the employer loop, only when an employer's checks are being (re)computed
  (i.e. not served from the <7-day cache, or `--reverify-employers`):
  - If `emp.nameDisplay` exists AND `args.verifyWeb` AND `!isOffline` AND `!args.dryRun`:
    schedule `verifyEmployerWeb` via a shared `pLimit(3)`.
  - Merge the verdict into `checks.web`. On `WebVerifyError`, set `checks.web = null` and log.
- Because the employer loop currently awaits each employer sequentially, refactor the
  web-verification calls to collect promises and `await` them with the limiter so the 3-way
  concurrency is real (geocode stays sequential under its mutex; probes stay as-is).
- Log one JSONL line per employer verification: `{ employer, stage: "verify-web", ok,
  durationMs, meta: { businessMatch, postingFound, in, out } }`.

## Scoring integration (`lib/scoring.ts`)

`checks` already serializes into the "EMPLOYER VERIFICATION (deterministic — trust these)"
block. Add guidance lines:

- `web.postingFound == "found"` → strong legitimacy (−15 to −25)
- `web.businessMatch == "mismatch"` → strong fraud (+20 to +30)
- `web.postingFound == "not_found"` AND `web.businessMatch == "match"` → mild fraud (+5 to +10)
  (the company is real but this exact posting isn't on their site — weakly suspicious; many
  legitimate employers post only to WorkBC, so keep it mild)
- `web.websiteUrl` present AND `web.websiteReachable == true` AND `web.businessMatch == "match"`
  → legitimacy (−10)
- any `web` field `null` / `"uncertain"` → strictly neutral (consistent with the existing
  null-vs-false rule)

## Schema (`lib/json-schemas.ts`)

Extend `ChecksSchema` with an optional, nullable `web` object matching `WebVerification`
(reuse a shared `WebVerificationSchema` exported from `verify-employer-web.ts` to avoid drift).
`parseChecks` continues to treat missing/`null` as empty.

## UI (`app/e/[id]/page.tsx`)

Add a "Web verification" card next to the existing Verification card:

- Website: `websiteUrl` as a link + reachable badge.
- Business match: badge — green "matches", red "mismatch", gray "uncertain".
- Posting found: badge — green "found on careers page" (link to `postingUrl`), amber
  "not found", gray "uncertain".
- Confidence (0–1) and the `summary` prose.
- Absent `web` (older rows / skipped) → "not checked".

## Testing

- `lib/verify-employer-web.test.ts` (mock the Anthropic SDK, like `scoring.test.ts`):
  - a zod-conformant `record_web_verification` result is parsed and returned
  - one malformed result → retried successfully
  - two failures → throws `WebVerifyError`
  - a response with no custom-tool block → throws `WebVerifyError`
- A small pure test for the merge-into-`checks` shaping if that logic is extracted into a
  helper.
- Existing suites stay green; `npm run build` type-checks the new `checks.web` usage in the UI.

## Cost / performance

- ~1 web-search-enabled Claude call per **unique** employer per scrape, only when its check is
  stale/new. Caching (7 days) means re-scrapes are mostly free. `--no-verify-web` for cheap runs.
- `p-limit(3)` bounds added wall time. Web search is billed separately from tokens; the
  end-of-run summary should report total web-verification tokens distinctly from scoring tokens.

## Out of scope (deferred)

- Verifying employers that are hidden (no name) — skipped.
- Caching web results separately from the rest of the employer check (they share the same
  `checkedAt` freshness window).
- Following the discovered website to also re-derive a postal address for geocoding (could be a
  future enhancement: feed `websiteUrl` back into geocoding/contact extraction).
- Persisting raw web-search transcripts/citations (we store only the structured verdict +
  `postingUrl`).

## Acceptance

- [ ] `verifyEmployerWeb` returns a validated `WebVerification`; retries once; throws
      `WebVerifyError` on double failure; unit-tested with a mocked SDK.
- [ ] A live scrape (verification on) populates `checks.web` for named employers, with at
      least some `businessMatch != "uncertain"` and some `postingFound` resolved.
- [ ] `--no-verify-web`, `--dry-run`, and `--fixtures` all skip the web call.
- [ ] Scoring reflects the new signals (a confirmed careers-page posting lowers risk; a
      business mismatch raises it).
- [ ] `app/e/[id]` renders the Web verification card; `npm test` and `npm run build` pass.
- [ ] End-of-run summary reports web-verification token usage separately.
