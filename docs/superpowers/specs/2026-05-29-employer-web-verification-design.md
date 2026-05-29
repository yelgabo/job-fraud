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
and sanity-checking the company against the posting.

## Goal

For each unique employer, once we find their website, run a **smell test / vibe check** on
the company — NOT a strict per-posting match:

1. Find the employer's official website.
2. Judge whether it's a real, substantive business whose industry/company info plausibly
   matches the employer name and the posting's field.
3. Check whether the company info / location / address on the site corroborates the posting's
   claimed location.
4. **Bonus:** if the site has a careers/jobs section (any active hiring presence), count that
   as a mild non-fraud signal. We do NOT try to locate this exact posting on their site — that
   strict cross-check is explicitly out of scope for now (too brittle).

These become signals that feed the existing Claude fraud score.

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
6. **Scope reduction (post-approval):** dropped the strict "is THIS posting on their careers
   page" cross-check. Replaced with a company smell test + a boolean bonus for the mere
   existence of a careers/jobs section.

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
  businessMatch: "match" | "mismatch" | "uncertain"      // real company whose field matches the posting
  locationMatch: "match" | "mismatch" | "uncertain"      // site's company info/address agrees with claimed location
  hasJobsListing: boolean | null                          // careers/jobs section exists (bonus legitimacy)
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
  free to call `web_search` first. Prompt instructs: search for the official site, judge
  whether it's a real business matching this employer/posting, check whether the company's
  stated location/address agrees with the posting, note whether a careers/jobs section exists,
  then call `record_web_verification`. Explicitly tell it NOT to hunt for this exact posting.
- Parse the `record_web_verification` tool_use block with a zod schema; if absent or invalid,
  retry once after 2s; second failure throws `WebVerifyError`.
- Returns usage so the pipeline can log/aggregate tokens.

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
  durationMs, meta: { businessMatch, locationMatch, hasJobsListing, in, out } }`.

## Scoring integration (`lib/scoring.ts`)

`checks` already serializes into the "EMPLOYER VERIFICATION (deterministic — trust these)"
block. Add guidance lines:

- `web.businessMatch == "mismatch"` → strong fraud (+20 to +30) — the site is not a real
  company matching this employer/role.
- `web.businessMatch == "match"` → legitimacy (−10 to −20).
- `web.locationMatch == "mismatch"` → moderate fraud (+10 to +15); `"match"` → mild
  legitimacy (−5).
- `web.hasJobsListing == true` → mild legitimacy bonus (−5 to −10). `false` → neutral
  (NOT a penalty — many real employers post only to WorkBC).
- any `web` field `null` / `"uncertain"` → strictly neutral (consistent with the existing
  null-vs-false rule).

## Schema (`lib/json-schemas.ts`)

Extend `ChecksSchema` with an optional, nullable `web` object matching `WebVerification`
(reuse a shared `WebVerificationSchema` exported from `verify-employer-web.ts` to avoid drift).
`parseChecks` continues to treat missing/`null` as empty.

## UI (`app/e/[id]/page.tsx`)

Add a "Web verification" card next to the existing Verification card:

- Website: `websiteUrl` as a link + reachable badge.
- Business match: badge — green "real / matches", red "mismatch", gray "uncertain".
- Location match: badge — green "location agrees", red "location mismatch", gray "uncertain".
- Careers section: green "has a careers/jobs page" when `hasJobsListing == true`, else muted.
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

- **Locating this exact posting on the employer's careers page** (strict cross-check) — only a
  boolean "careers section exists" bonus for now.
- Verifying employers that are hidden (no name) — skipped.
- Caching web results separately from the rest of the employer check (they share the same
  `checkedAt` freshness window).
- Following the discovered website to re-derive a postal address for geocoding (possible future
  enhancement: feed `websiteUrl` back into geocoding/contact extraction).
- Persisting raw web-search transcripts/citations (we store only the structured verdict).

## Acceptance

- [ ] `verifyEmployerWeb` returns a validated `WebVerification`; retries once; throws
      `WebVerifyError` on double failure; unit-tested with a mocked SDK.
- [ ] A live scrape (verification on) populates `checks.web` for named employers, with at
      least some `businessMatch != "uncertain"`.
- [ ] `--no-verify-web`, `--dry-run`, and `--fixtures` all skip the web call.
- [ ] Scoring reflects the new signals (a real, matching company lowers risk; a business
      mismatch raises it; a careers section is a small bonus; absence is never penalized).
- [ ] `app/e/[id]` renders the Web verification card; `npm test` and `npm run build` pass.
- [ ] End-of-run summary reports web-verification token usage separately.
