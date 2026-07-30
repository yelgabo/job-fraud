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
- `cache-tags.ts` - `DATA_CACHE_TAG`, the shared tag on every public-page `unstable_cache` read so
  `POST /api/revalidate` can purge them all with one `revalidateTag`.
- `request-revalidation.ts` - `requestRevalidation()`: best-effort POST to the deployed site's
  `/api/revalidate` (bearer `REVALIDATE_TOKEN`, endpoint overridable via `REVALIDATE_URL`) that the
  write-side CLIs call after a successful run; any failure logs one warning and never fails the run.
- `posted-date.ts` - `parsePostedDate()` turns a raw `Job.postedAt` string into a UTC date, handling
  both producer formats (the JSON API's ISO prefix and the HTML fallback's free text) and mapping
  anything ambiguous or junk to null. `effectivePostedDate()` / `formatPostedDate()` pick the date the
  UI shows, falling back to `scrapedAt` and marking it `~date (est. from scrape)` so an estimate is
  never mistaken for a published posted date.
- `postings-filter.ts` - where-clause composition for the postings list: `BANDS`, `POSTED_WINDOWS`,
  `parseBand()` / `parsePostedWindow()`, and `buildPostingsQuery()`, which builds the row query plus
  one count clause per dimension. **Each dimension's counts apply the other two filters and not
  itself**, which is what keeps the tab numbers equal to the rows listed. Adding a fourth filter
  dimension means changing this one function, not the page. Also owns pagination: `PAGE_SIZE` (50),
  `parsePage()`, `pageArgs()` (skip/take), and `POSTINGS_ORDER_BY`, whose unique `workbcId`
  tiebreaker keeps ties from straddling page boundaries. Only the row query pages; counts stay
  whole-corpus (pinned in `postings-filter.test.ts`).
- `companies-query.ts` - `orderEmployerAggs()`: sorts the per-employer judged-postings aggregates
  for `/companies` (worst score, then count, then unique `employerId` tiebreaker) so the page can
  fetch full employer rows only for the 50 shown.
- `posted-date-backfill.ts` - the pure half of `scripts/backfill-posted-date.ts`: `parseBackfillArgs()`
  (dry run unless `--apply`), `planBackfill()` (what a run would change, without a DB) and
  `groupWrites()` (collapse writes into one `updateMany` per distinct date).
- `anthropic-errors.ts` — `isBillingError()`: detects the out-of-credit 400 (not a retryable 429) so
  the judge fails fast — leaving jobs **pending** instead of mass-writing `unknown`.
- `methodology.ts` - the README-to-`/about` bridge: `methodologySlice()` cuts the README's
  visitor-facing sections for the page, `headingSlug()` + `RATING_ANCHOR` give other pages a stable
  deep link to the rating-bands section. README.md owns the wording; the test pins the caveats.
- `signal-labels.ts` - `humanizeSignalLabel()`: render-time plain-language map for judge-written
  signal labels that echo internal keys ("web.businessMatch mismatch"). Unrecognized labels render
  verbatim, never hidden; the contract is documented in the file.

**`lib/` root — plumbing (imported by web + CLIs)**
- `db.ts` — Prisma client singleton.
- `env.ts`: zod-validated env. `webEnv` for the app and for `scrape.ts`, which makes no Anthropic
  calls; `loadScrapeEnv()` adds a required `ANTHROPIC_API_KEY` and is imported only by the keyed
  judge scripts (`judge`, `rescore-failed`, `reverify-mail`, `rescan-impersonation`,
  `compare-judge`). The check is `z.string().min(1)`, so a placeholder value passes. `AUDIT_TOKEN`
  optional, gates `/audit`. Also exports `searchUrlForTerm()`.
- `utils.ts` — `cn()` classname helper for the UI.

_(The old Playwright-era modules — `geocode`, `http-probe`, `scrape-external`, `address-match` — were
removed; the pipeline now uses `lib/workbc/` + `lib/ai/verify-employer-web.ts`.)_

## `scripts/` — CLI entry points

- `scrape.ts` — **Phase 1 (collect).** API search + detail + flags + NOC category + ATS classify →
  upsert pending postings. Flags: `--search-terms`, `--location` (WorkBC server-side city filter;
  with `--search-terms ""` it sweeps every occupation in that city, not just tech), `--limit`,
  `--concurrency`, `--dry-run`, `--skip-existing` (alias `--new-only`: fetch detail only for new
  `workbcId`s), `--recent day|week` (ask WorkBC server-side for only recently-posted jobs, the cheap
  daily path). See `docs/TECHNICAL_INFO.md` for the two-pass refresh and the `WORKBC_SEARCH_TERMS`
  precedence trap.
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
- `backfill-posted-date.ts` - fill `postedDate` by parsing the raw `postedAt` string (pure parse, no
  API calls, re-runnable, raw string untouched). **Dry run is the default**; `--apply` writes, and
  `--limit` / `--samples` scope the report. `npm run backfill-posted-date`. Logic in
  `lib/shared/posted-date-backfill.ts`.
- `logger.ts` — `JsonlLogger` (per-run JSONL logs under `logs/`).

## `app/` — web app (Next.js, read-only, server components)

- `layout.tsx` — shell + header nav (Postings / Companies / Analysis / About) + footer link to `/about`.
- `about/page.tsx` - the methodology page: renders the README's plain-language sections (why
  postings are reviewed, what the bands mean, the caveats) via `lib/shared/methodology.ts`, with
  `marked` + slugged heading ids so score surfaces can deep-link `#how-each-posting-is-rated`.
- `page.tsx` — home: risk-band tabs (`?band=`) × job-type category chips (`?cat=`) × posted-date
  windows (`?posted=`: `any` / `7` / `30` / `90`), table of judged postings with each row's posted
  date, paginated at 50 rows (`?page=`). Every clause comes from `lib/shared/postings-filter.ts`;
  the page only renders. Cache semantics for all public pages:
  `docs/superpowers/specs/2026-07-29-pagination-and-caching-design.md`.
- `j/[id]/page.tsx` — one posting: verdict, weighted signals (plain-language labels via
  `lib/shared/signal-labels.ts`), evidence, posted + reviewed-on dates, keyed employer-checks table,
  + a primary **Apply ↗** link to the real apply URL (host shown) when the posting routes externally.
- `e/[id]/page.tsx` — one employer: web-verification card, address checks, its postings.
- `companies/page.tsx` — companies with judged postings, risk mix + top score, most-suspicious
  first, paginated at 50 (ordering in `lib/shared/companies-query.ts`).
- `analysis/page.tsx` — elevated-risk rate by job-type category, **by company** (each employer by its
  worst posting) and **by posting**, plus an "unverifiable" (businessMatch=mismatch) stat. Nav-linked.
- `api/revalidate/route.ts` - POST-only on-write cache refresh: bearer-token gated by
  `REVALIDATE_TOKEN` (unset ⇒ every request denied), purges `DATA_CACHE_TAG` plus the `/j/[id]` and
  `/e/[id]` ISR pages so an update run is visible immediately instead of after the 600 s window.
- `audit/[token]/page.tsx` + `audit/[token]/[employerId]/page.tsx` — **unlinked, token-gated** internal
  UI to review the raw `web_search` trail (queries → results → verdict) behind each verification.
  `audit/[token]/guard.ts` enforces the `AUDIT_TOKEN` env var (unset ⇒ 404).
- `globals.css` — Tailwind entry.

## `components/`
- `ScoreChip.tsx` — colored risk-score badge. `FlagIcons.tsx` — application-flag chips with tooltips
  (incl. `apply_host_mismatch` brand-impersonation).
- `EmployerChecks.tsx` - plain-language keyed table of an employer's verification record for the
  posting page; unknown `checks` keys fall back to raw JSON so they surface instead of vanishing.
- `PaginationNav.tsx` - prev/number/next pager pills with a "Page X of Y" caption; renders nothing
  on a single page. Used by the postings and companies lists.

## `prisma/`
- `schema.prisma` — `Employer`, `Job`, and `EmployerWebSearchLog` models. Job scoring fields are
  nullable (`null` = pending); `scoredAt` marks judged. Job also carries `nocCode`/`nocGroup`/`category`
  (NOC occupation + derived job-type bucket; `category` indexed) and a **pair** of posted-date fields:
  the raw `postedAt String?` exactly as the producer wrote it (still what the judge prompt sees) plus
  `postedDate DateTime?`, indexed, parsed from it and null when the raw value is unusable. Filter on
  `postedDate`, never on `postedAt` strings. `EmployerWebSearchLog` is an
  append-only audit trail of the raw `web_search` activity per verification (incl. `encrypted_content`
  blocks) — kept out of `Employer.checks` so prod pages don't load it; surfaced by the token-gated
  `/audit` pages.

## Config & meta
- `package.json` — scripts (`scrape`, `judge`, `judge:fetch/apply`, `rescore-failed`, `reverify-mail`,
  `compare-judge`, `rescan-impersonation`, `backfill-categories`, `backfill-posted-date`, `dev`,
  `build`, `test`) + deps.
- `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs` — build/TS/CSS config.
- `railway.json` — Railway deploy (RAILPACK; `prisma db push` then `next start`).
- `.env.example` — required env vars.
- `__fixtures__/` — saved WorkBC HTML (only used by the legacy parser tests).
- `docs/` — `ARCHITECTURE.md` (system overview), `TECHNICAL_INFO.md` (stack/setup/rubric), this
  `CODEMAP.md`, `judge-runbook.md` (agent judge steps) + `superpowers/{specs,plans}/` (design history).
- `.claude/skills/judge-postings/SKILL.md` — repeatable/schedulable judging skill.
