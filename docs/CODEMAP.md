# Codebase map

A file-by-file guide to the repo. For the architecture/data-flow overview see
[TECHNICAL_INFO.md](TECHNICAL_INFO.md); for the plain-language overview see [README.md](../README.md).

**Start here:** `scripts/scrape.ts` (collect) → `scripts/judge.ts` (evaluate) → `app/` (display).
Shared logic lives in `lib/`.

```
lib/          core logic (data fetch, flags, scoring, schema, db)
scripts/      CLI entry points (scrape, judge, helpers)
app/          Next.js web app (read-only views)
components/   shared React UI
prisma/       database schema
docs/         specs, plans, runbook
.claude/      the judge-postings skill
```

## `lib/` — core logic

**Data acquisition**
- `workbc-api.ts` — WorkBC JSON API client. `searchJobsApi()` (paged keyword search → job stubs) and
  `fetchJobDetailApi()` (per-job detail → NOC, salary, apply URL/email, mailing address). The data
  source for the whole pipeline.
- `scrape-workbc.ts` — `JobStub` / `DetailFields` types (used everywhere). Also holds the old HTML
  parsers `parseListingCards` / `parseDetail` — **no longer used by the pipeline** (kept only for
  their tests; superseded by `workbc-api.ts`).
- `ats-registry.ts` — `classifyHost()`: maps an apply-URL host to a known ATS (Workday, Greenhouse,
  Lever, BambooHR, …) → the `ats_known_provider` legitimacy signal.
- `application-flags.ts` — `detectFlags()`: regex detectors over apply text/description
  (`mail_physical_resume`, `generic_email_domain`, `crypto_payment`, `banking_info_upfront`,
  `fee_to_apply`, `id_upfront`, `whatsapp_telegram_only`). Each returns matched `evidence`.
- `normalize-employer.ts` — `normalizeEmployer()`: canonicalizes a company name (lowercase, strip
  legal suffixes) so postings dedupe to one employer.

**Evaluation (AI)**
- `verify-employer-web.ts` — `verifyEmployerWeb()`: one Claude call per company using the `web_search`
  tool → `{businessMatch, locationMatch, hasJobsListing, applicationAddressType, websiteUrl, …}`.
- `scoring.ts` — `scoreJob()`: Claude call (no web) that turns the employer verdict + a posting's
  flags/NOC/apply fields into `{fraudScore, reasoning, signals}`. Holds the scoring rubric/prompt
  (`temperature: 0`). `makeFailedResult()` for failures.
- `risk-band.ts` — `bandFor(score)` → `low | medium | high | unknown`.

**Data plumbing**
- `json-schemas.ts` — zod schemas + parsers for the Prisma `Json` columns (`ChecksSchema`,
  `WebVerificationSchema`, `SignalsSchema`, `parseFlags`/`parseChecks`/`parseSignals`). SDK-free, so
  the web app can import it without pulling the Anthropic SDK.
- `db.ts` — Prisma client singleton.
- `env.ts` — zod-validated env (`webEnv` for the app; `loadScrapeEnv()` adds `ANTHROPIC_API_KEY` for
  scrape/judge) + `searchUrlForTerm()`.
- `utils.ts` — `cn()` classname helper for the UI.

**Legacy (from the old Playwright pipeline — not imported anywhere now; safe to delete)**
- `geocode.ts` (Nominatim), `http-probe.ts` (website reachability), `scrape-external.ts` (external
  apply-page text), `address-match.ts` (`cityMatches`). Their `*.test.ts` are the only references.

## `scripts/` — CLI entry points

- `scrape.ts` — **Phase 1 (collect).** API search + detail + flags → upsert pending postings.
  Flags: `--search-terms`, `--limit`, `--concurrency`, `--dry-run`.
- `judge.ts` — **Phase 2 (evaluate), deduped.** Verify each distinct employer once, then score each
  job. Flags: `--limit`, `--rejudge`, `--emp-concurrency`, `--score-concurrency`. *(Preferred judge.)*
- `judge-fetch.ts` / `judge-apply.ts` — the optional **agent** judge path: fetch dumps pending into
  per-batch files for dispatched fraud agents; apply validates + writes their verdicts (single writer).
- `rescore-failed.ts` — re-score postings stuck in the `unknown` band.
- `reverify-mail.ts` — re-verify + re-score only employers whose postings give a mailing address.
- `compare-judge.ts` — read-only A/B of the deduped judge vs the agent path (quality check).
- `logger.ts` — `JsonlLogger` (per-run JSONL logs under `logs/`).

## `app/` — web app (Next.js, read-only, server components)

- `layout.tsx` — shell + header nav (Postings / Companies).
- `page.tsx` — home: risk-band tabs (`?band=`), table of judged postings.
- `j/[id]/page.tsx` — one posting: verdict, weighted signals, evidence.
- `e/[id]/page.tsx` — one employer: web-verification card, address checks, its postings.
- `companies/page.tsx` — all companies with judged postings, risk mix + top score, most-suspicious first.
- `globals.css` — Tailwind entry.

## `components/`
- `ScoreChip.tsx` — colored risk-score badge. `FlagIcons.tsx` — application-flag chips with tooltips.

## `prisma/`
- `schema.prisma` — `Employer` and `Job` models. Job scoring fields are nullable (`null` = pending);
  `scoredAt` marks judged.

## Config & meta
- `package.json` — scripts (`scrape`, `judge`, `judge:fetch/apply`, `rescore-failed`,
  `reverify-mail`, `compare-judge`, `dev`, `build`, `test`) + deps.
- `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs` — build/TS/CSS config.
- `railway.json` — Railway deploy (RAILPACK; `prisma db push` then `next start`).
- `.env.example` — required env vars.
- `__fixtures__/` — saved WorkBC HTML (only used by the legacy parser tests).
- `docs/` — `judge-runbook.md` (agent judge steps) + `superpowers/{specs,plans}/` (design history).
- `.claude/skills/judge-postings/SKILL.md` — repeatable/schedulable judging skill.
