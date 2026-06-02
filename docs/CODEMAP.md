# Codebase map

A file-by-file guide to the repo. For the system-architecture overview see
[ARCHITECTURE.md](ARCHITECTURE.md); for stack/setup/rubric detail see
[TECHNICAL_INFO.md](TECHNICAL_INFO.md); for the plain-language overview see [README.md](../README.md).

**Start here:** `scripts/scrape.ts` (collect) → `scripts/judge.ts` (evaluate) → `app/` (display).
Shared logic lives in `lib/`.

```
lib/          core logic — workbc/ signals/ ai/ shared/ + db·env·utils at root
scripts/      CLI entry points (scrape, judge, helpers)
app/          Next.js web app (read-only views)
components/   shared React UI
prisma/       database schema
docs/         architecture, technical info, runbook, specs/plans
.claude/      the judge-postings skill
```

## `lib/` — core logic (grouped by runtime / SDK boundary)

Root files (`db.ts`, `env.ts`, `utils.ts`) are cross-cutting plumbing imported everywhere; the four
subfolders split the rest by concern. **No web-app code imports `lib/ai/`** — all `@anthropic-ai/sdk`
usage is contained there — and `lib/shared/json-schemas.ts` stays SDK-free so the app can import it.

**`lib/workbc/` — WorkBC data layer**
- `workbc-api.ts` — WorkBC JSON API client. `searchJobsApi()` (paged keyword search → job stubs) and
  `fetchJobDetailApi()` (per-job detail → NOC group, salary, apply URL/email, mailing address). The
  data source for the whole pipeline.
- `scrape-workbc.ts` — `JobStub` / `DetailFields` types (used everywhere). Also holds the old HTML
  parsers `parseListingCards` / `parseDetail` — **no longer used by the pipeline** (kept only for
  their tests; superseded by `workbc-api.ts`).

**`lib/signals/` — deterministic signals (no AI)**
- `ats-registry.ts` — `classifyHost()`: maps an apply-URL host to a known ATS (Workday, Greenhouse,
  Lever, BambooHR, …) → the `ats_known_provider` legitimacy signal.
- `apply-host.ts` — `extractAtsTenant()` pulls the ATS tenant slug (e.g. `relx` from
  `relx.wd3.myworkdayjobs.com`); `tenantEmployerMatch()` compares it to the claimed employer (acronym/
  prefix pre-clear so UBC/SCI/etc. skip the check) → `match | mismatch | no-tenant`. Pre-filter for
  brand impersonation. `allApplyHostsMatch()` (every posting applies via the employer's own matching
  tenant) drives the judge's tier-skip of the web search.
- `application-flags.ts` — `detectFlags()`: regex detectors over apply text/description
  (`mail_physical_resume`, `generic_email_domain`, `crypto_payment`, `banking_info_upfront`,
  `fee_to_apply`, `id_upfront`, `whatsapp_telegram_only`). Each returns matched `evidence`.
- `normalize-employer.ts` — `normalizeEmployer()`: canonicalizes a company name (lowercase, strip
  legal suffixes) so postings dedupe to one employer.
- `job-category.ts` — `categoryForNoc()` maps a NOC occupation code → one of 10 coarse job-type
  buckets (Software & Data, IT & Infrastructure, Engineering, Food Service, Retail & Sales, Office/
  Admin/Finance, Healthcare, Skilled Trades & Construction, Care, Other); `parseNocGroup()` /
  `nocFromDescription()` extract the code. Drives the `?cat=` filter and the `/analysis` page.

**`lib/ai/` — Claude evaluation (all `@anthropic-ai/sdk` usage lives here)**
- `verify-employer-web.ts` — `verifyEmployerWeb()`: one Claude (`haiku-4-5`) call per company using
  the `web_search` tool → `{businessMatch, locationMatch, hasJobsListing, applicationAddressType,
  websiteUrl, …}`. Also returns `searchLog` (raw queries + result blocks); exports `extractSearchLog`.
- `check-impersonation.ts` — `checkImpersonation()`: on a tenant≠employer mismatch, a Claude
  **(`opus-4-8`)** + `web_search` call classifies the relationship `same | affiliate | impersonation
  | uncertain` and names the real company (stronger model — corporate-genealogy synthesis).
- `resolve-impersonation.ts` — `resolveApplyHost()`: glue — runs the apply-host check; on a confirmed
  impersonation re-attributes the posting to the real company + writes a deterministic HIGH score +
  the `apply_host_mismatch` flag + an audit-log row. Shared by `judge` and `rescan-impersonation`.
- `scoring.ts` — `scoreJob()`: Claude call (no web) that turns the employer verdict + a posting's
  flags/NOC/apply fields into `{fraudScore, reasoning, signals}`. Holds the scoring rubric/prompt
  (`temperature: 0`). `makeFailedResult()` for failures.

**`lib/shared/` — cross-cutting (web + CLI), SDK-free**
- `json-schemas.ts` — zod schemas + parsers for the Prisma `Json` columns (`ChecksSchema`,
  `WebVerificationSchema`, `SignalsSchema`, `parseFlags`/`parseChecks`/`parseSignals`). **Must stay
  free of the Anthropic SDK** so the web app can import it.
- `risk-band.ts` — `bandFor(score)` → `low | medium | high | unknown`.
- `anthropic-errors.ts` — `isBillingError()`: detects the out-of-credit 400 (not a retryable 429) so
  the judge fails fast — leaving jobs **pending** instead of mass-writing `unknown`.

**`lib/` root — plumbing (imported by web + CLIs)**
- `db.ts` — Prisma client singleton.
- `env.ts` — zod-validated env (`webEnv` for the app; `loadScrapeEnv()` adds `ANTHROPIC_API_KEY` for
  scrape/judge; `AUDIT_TOKEN` optional, gates `/audit`) + `searchUrlForTerm()`.
- `utils.ts` — `cn()` classname helper for the UI.

_(The old Playwright-era modules — `geocode`, `http-probe`, `scrape-external`, `address-match` — were
removed; the pipeline now uses `lib/workbc/` + `lib/ai/verify-employer-web.ts`.)_

## `scripts/` — CLI entry points

- `scrape.ts` — **Phase 1 (collect).** API search + detail + flags + NOC category + ATS classify →
  upsert pending postings. Flags: `--search-terms`, `--limit`, `--concurrency`, `--dry-run`,
  `--skip-existing` (alias `--new-only`: fetch detail only for new `workbcId`s), `--recent day|week`
  (ask WorkBC server-side for only recently-posted jobs — the cheap daily path).
- `judge.ts` — **Phase 2 (evaluate), deduped + tiered.** Verify each distinct employer once — but
  *skip* the web search for employers whose postings all apply via their own matching ATS tenant
  (presumed legit, `source=ats-tenant-match`); web-verify only the rest. Then run the apply-host
  impersonation pre-check per job and score each job. Fails fast on an out-of-credit error (leaves
  jobs pending). Flags: `--limit`, `--rejudge`, `--emp-concurrency`, `--score-concurrency`.
  *(Preferred judge.)*
- `judge-fetch.ts` / `judge-apply.ts` — the optional **agent** judge path: fetch dumps pending into
  per-batch files for dispatched fraud agents; apply validates + writes their verdicts (single writer).
- `rescore-failed.ts` — re-score postings stuck in the `unknown` band.
- `reverify-mail.ts` — re-verify + re-score only employers whose postings give a mailing address.
- `compare-judge.ts` — read-only A/B of the deduped judge vs the agent path (quality check).
- `rescan-impersonation.ts` — one-time corpus sweep: find apply-host≠employer mismatches, web-check
  each distinct pair, re-attribute + HIGH-score confirmed brand impersonations. `npm run rescan-impersonation`.
- `backfill-categories.ts` — fill `nocCode`/`nocGroup`/`category` from each posting's stored
  description (pure parse, no API calls, re-runnable). `npm run backfill-categories`.
- `logger.ts` — `JsonlLogger` (per-run JSONL logs under `logs/`).

## `app/` — web app (Next.js, read-only, server components)

- `layout.tsx` — shell + header nav (Postings / Companies / Analysis).
- `page.tsx` — home: risk-band tabs (`?band=`) × job-type category chips (`?cat=`), table of judged
  postings.
- `j/[id]/page.tsx` — one posting: verdict, weighted signals, evidence, + a primary **Apply ↗** link
  to the real apply URL (host shown) when the posting routes externally.
- `e/[id]/page.tsx` — one employer: web-verification card, address checks, its postings.
- `companies/page.tsx` — all companies with judged postings, risk mix + top score, most-suspicious first.
- `analysis/page.tsx` — elevated-risk rate by job-type category, **by company** (each employer by its
  worst posting) and **by posting**, plus an "unverifiable" (businessMatch=mismatch) stat. Nav-linked.
- `audit/[token]/page.tsx` + `audit/[token]/[employerId]/page.tsx` — **unlinked, token-gated** internal
  UI to review the raw `web_search` trail (queries → results → verdict) behind each verification.
  `audit/[token]/guard.ts` enforces the `AUDIT_TOKEN` env var (unset ⇒ 404).
- `globals.css` — Tailwind entry.

## `components/`
- `ScoreChip.tsx` — colored risk-score badge. `FlagIcons.tsx` — application-flag chips with tooltips
  (incl. `apply_host_mismatch` brand-impersonation).

## `prisma/`
- `schema.prisma` — `Employer`, `Job`, and `EmployerWebSearchLog` models. Job scoring fields are
  nullable (`null` = pending); `scoredAt` marks judged. Job also carries `nocCode`/`nocGroup`/`category`
  (NOC occupation + derived job-type bucket; `category` indexed). `EmployerWebSearchLog` is an
  append-only audit trail of the raw `web_search` activity per verification (incl. `encrypted_content`
  blocks) — kept out of `Employer.checks` so prod pages don't load it; surfaced by the token-gated
  `/audit` pages.

## Config & meta
- `package.json` — scripts (`scrape`, `judge`, `judge:fetch/apply`, `rescore-failed`, `reverify-mail`,
  `compare-judge`, `rescan-impersonation`, `backfill-categories`, `dev`, `build`, `test`) + deps.
- `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs` — build/TS/CSS config.
- `railway.json` — Railway deploy (RAILPACK; `prisma db push` then `next start`).
- `.env.example` — required env vars.
- `__fixtures__/` — saved WorkBC HTML (only used by the legacy parser tests).
- `docs/` — `ARCHITECTURE.md` (system overview), `TECHNICAL_INFO.md` (stack/setup/rubric), this
  `CODEMAP.md`, `judge-runbook.md` (agent judge steps) + `superpowers/{specs,plans}/` (design history).
- `.claude/skills/judge-postings/SKILL.md` — repeatable/schedulable judging skill.
