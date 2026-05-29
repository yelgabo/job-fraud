# Plan: job-fraud v1

**Source spec:** `docs/superpowers/specs/2026-05-29-job-fraud-design.md`
**Date:** 2026-05-29 (revised after review round 1)
**Complexity:** Medium

## Summary

Stand up a Next.js + Postgres app on Railway that scrapes the WorkBC software-jobs search page, runs deterministic employer-level and posting-level checks, scores each job for fraud with Claude, and displays the results in three risk-banded tabs. v1 is a manual CLI scrape with overwrite semantics.

## Decisions resolved before task 1 (round-1 review)

These are spec-level choices that need the user's confirmation OR are unambiguously the right call given the existing anki-srs pattern:

1. **ORM = Prisma 6** (spec said Drizzle; anki-srs uses Prisma — match the working pattern). User to confirm.
2. **PK strategy = `workbcId` as the row identity** instead of an auto-increment integer. Reason: spec's overwrite-each-run semantics combined with auto-increment would invalidate every `/j/[id]` URL after a scrape. Using the stable WorkBC posting ID as the PK makes URLs durable, makes intra-run dedupe trivial (`createMany` with `skipDuplicates: true`), and removes the "monotonic PK leak" risk. `employers.id` stays as `cuid()` since employer names don't have a stable external ID.
3. **Migration strategy = `prisma db push` at deploy (matches anki-srs `railway.json`)**, not `migrate deploy`. Simpler for v1 — no committed migration folder needed. We accept that destructive schema changes will be visible in `db push` output instead of versioned migrations. Move to `migrate deploy` only when the project sees real production data.
4. **TRUNCATE statement = raw SQL inside `prisma.$transaction(async (tx) => { ... })`** (interactive transaction). `tx.$executeRawUnsafe('TRUNCATE TABLE "Job"')` followed by `tx.job.createMany({ data, skipDuplicates: true })`. Matches the spec's stated invariant (`BEGIN; TRUNCATE; INSERT; COMMIT;`) faithfully; `deleteMany` was wrong. **`RESTART IDENTITY` is omitted** (no-op on a string PK) and **`CASCADE` is omitted** (no inbound FKs to Job in v1; keeping it would silently wipe any future inbound-FK table).
5. **`employers.nameNormalized` rule = lowercase, trim, collapse internal whitespace to single space, strip trailing `.`/`,`, strip `Inc/LLC/Ltd/Corp/Corporation/Co./Company` suffixes.** Pure function in `lib/normalize-employer.ts` with vitest tests for the listed cases. Single source of truth used by both upsert and group-by.
6. **Tailwind version = pin Tailwind 3.4** manually after scaffold. `create-next-app@latest` now defaults to Tailwind 4, which has a different config surface. Plan task 1 explicitly downgrades.
7. **shadcn = full init flow.** Task 1 runs `npx shadcn@latest init` (writes `components.json`, `lib/utils.ts`, patches `globals.css` with theme vars). Task 8 runs `npx shadcn@latest add tabs card badge collapsible separator` before authoring UI.
8. **Server-component caching = `export const dynamic = 'force-dynamic'` on every page.** Data only changes when the script runs; no benefit to Next's fetch cache here.
9. **Next 15 params are Promises** — every dynamic route handler uses `const { id } = await params`.
10. **Playwright stays out of the Railway image** — it's a `devDependency` only used by `scripts/scrape.ts`, which is local-only in v1. Railway runs only the Next.js app. Task 11 verifies the Railway build doesn't try to install chromium.
11. **`--fixtures` mode contract** — when `--fixtures DIR` is passed: (a) search HTML read from `DIR/workbc-search.html`; (b) per-job detail HTML from `DIR/detail-<workbcId>.html`; (c) external apply HTML from `DIR/external-<workbcId>.html`; (d) missing file → log and skip that step (treated as a fetch failure for flag-derivation purposes); (e) **`--fixtures` implies offline for all I/O** — no Playwright launch, no Nominatim, no HTTP probes (probe results synthesized as `reachable: null`). `--dry-run` is a separate flag that only suppresses Claude calls + DB writes; the two compose.
12. **Playwright context strategy** — one shared `browser.newContext({userAgent, extraHTTPHeaders: {'Accept-Language': 'en-CA,en;q=0.9'}, viewport: {width: 1366, height: 768}})` reused across all WorkBC detail pages (preserves cookies/fingerprint stability, avoids ~500ms per-context cold start, looks less bot-like). A **second** context for all external apply pages (isolates state from WorkBC). `await page.close()` between iterations, not `context.close()`. UA + headers go on `newContext`, not `launch` or `page`.
13. **Signal handler idempotency** — `let closing = false`. Each handler: `if (closing) return; closing = true; await browser?.close(); process.exit(130)`. Prevents re-entry during the close itself.
14. **WorkBC sentinel selector is a task-7 prerequisite** — before task 7 implementation, do a live-site DOM inspection and lock the listing-card selector and the detail-page heading selector in `lib/scrape-workbc.ts` constants. Plan calls this out as a pre-task step.
15. **`--limit N`** = "process first N listing stubs from the search page". Successful + failed + dry-run-skipped all count toward N. Used for smoke testing only.

## Patterns to mirror (from `anki-srs`)

| Category | Source | Pattern |
|---|---|---|
| ORM client | `anki-srs/lib/db.ts` | Single `prisma` singleton, dev-mode globalThis reuse |
| Scripts | `anki-srs/package.json:5-15` | `dev`, `build` (=`prisma generate && next build`), `start` (=`next start -p ${PORT:-3000}`), `postinstall` (=`prisma generate`), `db:push`, `db:seed`, `test` |
| Tests | `anki-srs/lib/*.test.ts` | Vitest, co-located `*.test.ts` next to source |
| Deploy | `anki-srs/railway.json` | RAILPACK builder, `prisma db push` at start, `ON_FAILURE` restart × 3 |
| Next.js version | `anki-srs/package.json:21-26` | Next 15 + React 19, App Router |
| Validation | `anki-srs` uses `zod` | zod for Claude output schema + env validation |

## Tech stack (locked in)

- Next.js 15 (App Router) + React 19
- Prisma 6 + Postgres (Railway)
- Tailwind 3.4 + shadcn/ui (Tabs, Card, Badge, Collapsible, Separator)
- Playwright (chromium) — `devDependency`, local-only
- `@anthropic-ai/sdk`
- `zod` — output schema, env validation, JSON-field read parsing
- `p-limit` — Claude concurrency (sequential for Playwright)
- Vitest — unit tests for pure functions

## Files to change

| File | Action | Why |
|---|---|---|
| `package.json` | CREATE | Deps + scripts incl. `postinstall: prisma generate` |
| `next.config.ts` | CREATE | `serverExternalPackages: ['@prisma/client', '@prisma/engines']` |
| `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs` | CREATE | Tailwind 3 setup |
| `components.json` | CREATE (shadcn init) | shadcn config |
| `app/globals.css` | CREATE | Tailwind + shadcn theme vars |
| `railway.json` | CREATE | RAILPACK + `prisma db push --accept-data-loss --skip-generate && next start` |
| `prisma/schema.prisma` | CREATE | `Employer`, `Job` models, PK strategy per decision 2 |
| `.env.example` | CREATE | `DATABASE_URL`, `ANTHROPIC_API_KEY`, `WORKBC_SEARCH_URL`, `NOMINATIM_USER_AGENT` |
| `.gitignore` | CREATE | `node_modules`, `.env*`, `.next`, `logs/`, `*.tsbuildinfo`, `__fixtures__/*.local.*` |
| `lib/db.ts` | CREATE | Prisma singleton (mirror anki-srs) |
| `lib/env.ts` | CREATE | zod-validated env; `ANTHROPIC_API_KEY` is lazy (required only by scoring/scrape, not by `next build`) |
| `lib/utils.ts` | CREATE (shadcn init) | `cn()` |
| `lib/normalize-employer.ts` | CREATE | `normalize(name) → string` per decision 5 |
| `lib/risk-band.ts` | CREATE | `bandFor(score)` |
| `lib/ats-registry.ts` | CREATE | Host → provider table + `classifyHost()` |
| `lib/application-flags.ts` | CREATE | Regex detectors → `{flag, evidence}[]` |
| `lib/geocode.ts` | CREATE | Nominatim wrapper, strict 1-req/sec **mutex** (not token bucket), polite UA, returns `{found, lat, lon, displayName, confidence}` |
| `lib/http-probe.ts` | CREATE | `probe(url)` → `{reachable, statusCode, contentType, finalUrl}` |
| `lib/scoring.ts` | CREATE | Claude call + zod schema for output |
| `lib/scrape-workbc.ts` | CREATE | Pure WorkBC parsers (string in, data out) |
| `lib/scrape-external.ts` | CREATE | External apply-page body extraction (pure) |
| `lib/json-schemas.ts` | CREATE | zod schemas for `checks`, `applicationFlags`, `signals` JSON fields (write + read) |
| `scripts/scrape.ts` | CREATE | Pipeline orchestrator |
| `scripts/logger.ts` | CREATE | JSONL writer with auto-flush on `exit`/`SIGINT`/`uncaughtException` |
| `app/layout.tsx`, `app/page.tsx`, `app/j/[id]/page.tsx`, `app/e/[id]/page.tsx` | CREATE | Root layout + three pages |
| `components/ScoreChip.tsx`, `components/FlagIcons.tsx`, `components/ui/*` | CREATE | UI primitives |
| `README.md` | CREATE | Quickstart |

## Prisma schema (concrete, per decisions 2 + 5)

```prisma
model Employer {
  id              String    @id @default(cuid())
  nameNormalized  String    @unique
  nameDisplay     String
  website         String?
  applicationUrl  String?
  addressRaw      String?
  checks          Json      @default("{}")
  checkedAt       DateTime?
  jobs            Job[]
}

model Job {
  workbcId          String    @id        // <— stable PK from WorkBC
  employerId        String?
  employer          Employer? @relation(fields: [employerId], references: [id], onDelete: SetNull)
  title             String
  location          String?
  salary            String?
  postedAt          String?
  sourceUrl         String
  descriptionMd     String
  externalApplyUrl  String?
  externalApplyHost String?
  atsProvider       String?
  externalApplyOk   Boolean?
  applicationFlags  Json      @default("[]")
  fraudScore        Int
  riskBand          String
  reasoning         String
  signals           Json
  scrapedAt         DateTime  @default(now())

  @@index([riskBand, fraudScore])
}
```

Notes:
- `Job.workbcId` is the PK → `/j/[id]` URLs survive scrapes. Spec called for no indexes; we add one on `(riskBand, fraudScore)` because `/` filters and sorts on those columns on every request. Trivial to remove if undesired.
- `employerId` is **explicitly nullable** (spec said employer can be hidden). `onDelete: SetNull` so a stray employer row deletion never breaks jobs.
- All Json fields **except `signals`** default to `'{}' / '[]'` (Prisma string literal) to avoid `null`-vs-`{}` ambiguity at the read boundary. `signals` has no default and is non-null; the pipeline always writes it (scoring-failure path uses `[]`).

## Tasks

### Task 1: Scaffold + schema
- **Action:** `npx create-next-app@latest . --typescript --app --no-src-dir --no-eslint --no-tailwind` (skip Tailwind — we pin v3). Install deps: `prisma @prisma/client zod @anthropic-ai/sdk p-limit tailwindcss@^3 postcss autoprefixer playwright vitest tsx cross-env`. After install, run **`./node_modules/.bin/tailwindcss init -p`** (path-direct to guarantee v3 binary, not whatever `npx` resolves). Run `npx shadcn@latest init --yes --base-color zinc --css-variables --no-src-dir` (non-interactive). Write `prisma/schema.prisma` (above). Add `postinstall: prisma generate` to `package.json`. Use `cross-env PORT=${PORT-3000} next start` for the `start` script (Windows portability — anki-srs's `${PORT:-3000}` is POSIX-only). Add `lib/db.ts` singleton matching `anki-srs/lib/db.ts`. Run `npx prisma db push` against a local Postgres to confirm.
- **Mirror:** `anki-srs/package.json:5-15` for script names; `anki-srs/lib/db.ts` shape.
- **Validate:** `npm run build` succeeds. `npx prisma db push` against a local DB creates both tables.

### Task 2: Env + JSON schemas
- **Action:** `lib/env.ts` exports two parsers: `webEnv` (required: `DATABASE_URL`; optional: `WORKBC_SEARCH_URL`, `NOMINATIM_USER_AGENT`) and `scrapeEnv` (extends webEnv with required `ANTHROPIC_API_KEY`). Pages import `webEnv`; the scrape script imports `scrapeEnv`. This way `next build` on Railway succeeds without `ANTHROPIC_API_KEY`. `lib/json-schemas.ts` exports zod schemas for `checks`, `applicationFlags`, `signals`, plus a `parseOrEmpty` helper that pages use when reading from Prisma `Json` fields — **treats `null` as the empty default** (`{}` or `[]`) to handle old rows pre-default, then validates.
- **Validate:** vitest: missing required key → throws with a clear message; valid → parses; reading a malformed JSON field → throws with the path that failed; `parseFlags(null)` returns `[]` without throwing.

### Task 3: Pure helpers — normalize, risk band, ATS, app-flag detectors
- **Action:** Implement `lib/normalize-employer.ts`, `lib/risk-band.ts`, `lib/ats-registry.ts`, `lib/application-flags.ts` per the rules in Decisions section. Each gets co-located `*.test.ts`. Flag detectors return `Array<{flag: string, evidence: string}>` so the UI can cite the phrase that matched.
- **Mirror:** `anki-srs/lib/srs.ts` + `srs.test.ts` co-located shape.
- **Validate:** `npm test` green. Specific tests:
  - `normalize("Acme Corp.")` === `normalize("acme   corporation")` === `"acme"`
  - `bandFor(-1) === 'unknown'`, `bandFor(29) === 'low'`, `bandFor(30) === 'medium'`, `bandFor(69) === 'medium'`, `bandFor(70) === 'high'`
  - `classifyHost("acme.myworkdaysite.com") === 'workday'`
  - `detectFlags("Mail your resume to PO Box 123")` includes `mail_physical_resume`

### Task 4: HTTP probe + Nominatim
- **Action:** `lib/http-probe.ts` uses `fetch` with `redirect: 'follow'`, AbortController 10s timeout. Returns `{reachable, statusCode, contentType, finalUrl}`. Treats `Content-Disposition: attachment` or non-text content-type as a signal for `external_apply_is_file` (the caller derives the flag). `lib/geocode.ts` exports `geocode(addressRaw)` backed by a **strict mutex + 1s sleep** (NOT a token bucket — Nominatim ToS is hard 1 req/sec). UA from env. Returns `{found, lat, lon, displayName, confidence}`. Confidence derived from Nominatim `importance` (`0..1` clamp).
- **Mirror:** none.
- **Validate:** vitest with recorded fixture JSON in `__fixtures__/`. Test that two concurrent `geocode()` calls observe ≥1000ms gap (timestamps in fake clock or `performance.now()` in real test).

### Task 5: WorkBC parsers + external body extractor (pure)
- **Action:** `lib/scrape-workbc.ts` exports `parseListingCards(html: string): JobStub[]` and `parseDetail(html: string): DetailFields`. `lib/scrape-external.ts` exports `extractBodyText(html: string, atsProvider: string | null): string` — for `workday`, strip `<header>`, `<footer>`, `<nav>`, the candidate-portal chrome; for `greenhouse` and `lever`, similar known-selector stripping; for `unknown`, fall back to "visible text minus header/nav/footer". Both files have zero IO dependency.
- **Mirror:** none.
- **Validate:** vitest against saved HTML fixtures in `__fixtures__/workbc-search.html`, `__fixtures__/workbc-detail-49600147.html`, `__fixtures__/workday-omegro.html`. Tests assert specific extracted fields, including the spec's `mail_physical_resume` example.

### Task 6: Scoring (Claude + zod)
- **Action:** `lib/scoring.ts` exports `scoreJob(input): Promise<ScoreResult>`. Uses Anthropic SDK tool-use forcing: defines `record_fraud_assessment` tool, sets `tool_choice: {type: 'tool', name: 'record_fraud_assessment'}`, parses the tool_use block with zod. Retry once on parse/transport error with 2s backoff. Model: `claude-haiku-4-5-20251001`. Returns `{result, usage}` with input/output tokens for logging.
- **Validate:** vitest mocks SDK, asserts: (a) zod-conformant tool result is returned, (b) one parse failure → retried successfully, (c) two failures → throws a typed `ScoringFailedError`. Live: `tsx -e "..."` scores a fixture posting.

### Task 7: scripts/scrape.ts — full pipeline
- **Action:** Wire everything per the spec pipeline, with the following explicit mechanics:

  - **CLI flags:** `--reverify-employers`, `--dry-run` (skip Claude + DB), `--limit N`, `--fixtures DIR` (read HTML from disk instead of Playwright — for offline development).
  - **Playwright lifecycle:** single `browser` launched in a `try/finally`, `await browser.close()` in finally. Also register `SIGINT`, `SIGTERM`, `uncaughtException`, `unhandledRejection` handlers that close the browser before exit. Per-detail-page work uses a fresh `context` then `await context.close()` to bound memory.
  - **SPA navigation:** for hash-routed pages (`#/job-details/<id>`), use `page.goto(detailUrl)` then `await page.waitForSelector('[data-testid="job-detail-heading"], h1.job-title, ...sentinel...')` (selector to be locked at task time after inspecting the live site). `networkidle` alone is not relied upon. For unknown external ATSs, `await page.waitForLoadState('networkidle', {timeout: 8000}).catch(() => {})` followed by a 1.5s settle.
  - **Anti-bot hygiene:** `chromium.launch({args: ['--disable-blink-features=AutomationControlled']})`, set `userAgent` to a current real Chrome string, set `Accept-Language: en-CA,en;q=0.9`, viewport `1366x768`. None of this is guaranteed to evade fingerprinting; it is reasonable politeness.
  - **Sequencing:** WorkBC detail pages and external apply pages are processed strictly sequentially with the stated polite delays. Only Claude calls fan out (concurrency 5 via `p-limit`).
  - **Retries:** WorkBC detail navigation gets 1 retry with 3s backoff on failure (added per round-1 finding); failure after retry = skip that job + log + continue. Spec's "0 listings = hard exit, don't truncate" invariant preserved.
  - **Employer dedupe:** group `JobStub[]` by `normalize(employer.name)` in memory before touching DB. Only one upsert per `nameNormalized`.
  - **Employer check freshness:** `if (existing && existing.checkedAt && (now - existing.checkedAt) < 7 days && !args.reverifyEmployers) skip`.
  - **Atomic write:**
    ```ts
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE TABLE "Job"')
      await tx.job.createMany({ data: rows, skipDuplicates: true })
    })
    ```
    - Dropped `RESTART IDENTITY` (no-op on a string PK) and `CASCADE` (no inbound FKs to Job in v1; keeping CASCADE would silently wipe a future audit table without warning). Reintroduce only if/when an inbound FK is added.
    - `skipDuplicates: true` covers intra-run `workbcId` collisions. **Semantics: first row wins** — later duplicates (incl. their score/signals) are dropped without error. In v1 this is acceptable; if the scrape ever sees real duplicates with diverging content, this is the place to revisit.
    - `signals` has no DB default and is non-null; every row built by the pipeline must include it (the scoring failure path sets `signals: []`).
  - **External-page wait:** `networkidle` with 8s timeout, then a 1.5s settle. Hard ceiling on the whole external fetch (including retry) is the 15s timeout from the spec.
  - **JSONL log:** one line per `{workbcId, stage, durationMs, ok, error?}`. Writer flushes on any exit signal (see `scripts/logger.ts`).
  - **End-of-run summary** to stdout: counts per band, scoring failures, total Claude tokens, wall time.

- **Validate:** Run with `--fixtures __fixtures__` first (no network, no Claude). Then `--limit 3` against live URL with a real key. Then full run. Verify: DB row count > 0, no orphaned employer rows, log file has one line per job per stage.

### Task 8: UI — list page with tabs
- **Action:** `app/page.tsx` server component. `export const dynamic = 'force-dynamic'`. Queries Prisma `groupBy({by: ['riskBand'], _count: true})` for tab counts and `findMany({where: {riskBand}, orderBy: [{fraudScore: 'desc'}, {title: 'asc'}]})` for rows. Header shows `MAX(scrapedAt)` and "{scored} of {total}". Render shadcn `Tabs` with `TabsTrigger` per band (count in label) and a table per `TabsContent`. Row = `<ScoreChip>` + title + employer name (or "employer hidden") + `<FlagIcons applicationFlags={parseFlags(job.applicationFlags)} />`. Empty state when DB has no rows. **Nominatim attribution footer** (`© OpenStreetMap contributors`) on layout — required by ToS since we display geocoded addresses.
- **Mirror:** `anki-srs/app/page.tsx` for server-component data-loading shape.
- **Validate:** `npm run dev`, visit `/`, all four tabs render, counts match a raw SQL `GROUP BY`, switching tabs changes URL `?band=` and content.

### Task 9: UI — job detail page
- **Action:** `app/j/[id]/page.tsx`. `const { id } = await params`. Loads job + employer with `findUnique({where: {workbcId: id}, include: {employer: true}})`. Sections: (1) header (title, employer link, score chip, "View on WorkBC" → `sourceUrl`); (2) verdict (parsed `signals` with zod; bullet list with color-coded weight bars + `reasoning` prose); (3) collapsible evidence panels — application flags (with evidence phrases), employer checks JSON (pretty-printed), description rendered in `<pre className="whitespace-pre-wrap">` (defer `react-markdown` to v1.1).
- **Validate:** click a row from `/`, detail page loads at `/j/<workbcId>`, all sections render, source link works.

### Task 10: UI — employer detail page
- **Action:** `app/e/[id]/page.tsx`. `const { id } = await params`. Header (name, website with `✓ 200` / `✗ unreachable` badge from `checks.websiteReachable`, address claimed, `addressResolvedTo`, `checkedAt`). List of all jobs with this employer in the current run.
- **Validate:** click employer link from a job detail; page renders; jobs list matches `WHERE employerId = ?`.

### Task 11: Railway config + first deploy
- **Action:** Create `railway.json` mirroring `anki-srs/railway.json`:
  ```json
  {
    "$schema": "https://railway.com/railway.schema.json",
    "build": {"builder": "RAILPACK"},
    "deploy": {
      "startCommand": "npx prisma db push --accept-data-loss --skip-generate && npx next start -p ${PORT:-3000}",
      "restartPolicyType": "ON_FAILURE",
      "restartPolicyMaxRetries": 3
    }
  }
  ```
  Push to Railway under existing `compassionate-charisma` project. Add Postgres add-on, copy `DATABASE_URL` (`postgresql://...` internal), set `ANTHROPIC_API_KEY` (Anthropic console). **Do not install Playwright on Railway** — confirm by checking the deploy build log doesn't include `playwright install`. Playwright is a `devDependency`; production install skips it.
- **Mirror:** `anki-srs/railway.json` verbatim, only the start command changes.
- **Validate:** Deploy succeeds; visiting Railway URL shows empty-state UI. Local `npm run scrape` pointed at Railway's `DATABASE_URL` populates the DB; refresh shows results.

### Task 12: README
- **Action:** README.md with: what it is, quickstart (`npm i`, `npx playwright install chromium`, `cp .env.example .env`, `npx prisma db push`, `npm run scrape`, `npm run dev`), how to re-verify employers (`npm run scrape -- --reverify-employers`), how to develop offline (`npm run scrape -- --fixtures __fixtures__`), how to add a new applicationFlag detector (point at `lib/application-flags.ts`), Nominatim attribution note.
- **Validate:** Manual read.

## Validation

```bash
# Unit
npm test
# Type-check + build
npm run build
# Offline pipeline
npm run scrape -- --fixtures __fixtures__ --dry-run
# Small live smoke
npm run scrape -- --limit 3
# Full run
npm run scrape
# Live site
npm run dev
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Auto-increment PK breaks `/j/[id]` across runs** | resolved | `workbcId` is the PK (decision 2). |
| **TRUNCATE/deleteMany semantic mismatch** | resolved | Raw `TRUNCATE TABLE "Job"` (no `RESTART IDENTITY`, no `CASCADE`) inside interactive `$transaction` (decision 4 + task 7). |
| **`nameNormalized` ambiguity** | resolved | Function spec'd + tested in `lib/normalize-employer.ts` (decision 5). |
| **First Railway deploy fails (missing migration)** | resolved | Mirror anki-srs: `prisma db push` at startup, no committed migration folder (decision 3). |
| **Tailwind 4 surprise from `create-next-app`** | resolved | Pin Tailwind 3.4 in task 1; skip Tailwind during scaffold. |
| **shadcn primitives missing** | resolved | `shadcn init` + `shadcn add` explicit in tasks 1 + 8. |
| **Playwright zombie processes** | resolved | try/finally + signal handlers (task 7). |
| **SPA hash navigation doesn't trigger waits** | resolved | `waitForSelector` on a known sentinel, not `networkidle` (task 7). |
| **Partial-run data loss (49 of 50 succeed, #50 throws)** | accepted for v1 | 1 retry per detail page (added in round-1 revision). If both fail → skip, log, continue. Successful 49 still get written. Spec's "0 listings = hard exit" invariant unchanged. |
| **Nominatim rate cap exceeded** | resolved | Strict mutex + 1s sleep, not token bucket (decision per round-1; task 4). |
| **Nominatim attribution missing from UI** | resolved | Attribution footer added to root layout (task 8). |
| **JSON-field type safety in UI** | resolved | zod parsers in `lib/json-schemas.ts`, used at every read site (task 2). |
| **Intra-run duplicate `workbcId`** | resolved | `workbcId` PK + `skipDuplicates: true` (task 7). |
| **WorkBC SPA selector changes** | High over time | Pure parsers isolate the change to one file. 0-listings hard-exit prevents DB wipe. Manual fixture update path documented. |
| **`next build` fails without `ANTHROPIC_API_KEY`** | resolved | Lazy `scrapeEnv` parsing, separate from `webEnv` (task 2). |
| **Prisma engines bundled into Next build** | resolved | `serverExternalPackages: ['@prisma/client', '@prisma/engines']` in `next.config.ts` (task 1). |
| **Next 15 params Promise gotcha** | resolved | Decision 9 + tasks 9 + 10 explicit. |
| **Playwright on Railway build** | resolved | Playwright is `devDependency`; Railway production install skips it (task 11). |
| **WorkBC blocking scrapes** | Medium | Polite delays + real UA + `--disable-blink-features=AutomationControlled`. Fallback: `--fixtures` mode lets you scrape elsewhere and feed HTML in. |
| **Spec → plan ORM divergence** | resolved if user agrees | Decision 1; user confirms before task 1. |
| **`addressFlags` referenced in spec example but empty in v1** | resolved | Stored as `[]`; Claude prompt receives `addressFlags: []`; UI handles missing key as empty (task 7/9). |
| **Concurrent `scrape` runs racing on TRUNCATE+INSERT** | accepted for v1 | v1 is local CLI; the user runs it manually one at a time. No advisory lock. Two concurrent runs would interleave deletes and inserts; the surviving state is whichever transaction commits last. Add a Postgres advisory lock if the scrape ever moves to cron. |
| **Per-context fingerprint reset looking bot-like** | resolved | Shared context per host class (decision 12). |
| **Windows `npm start` `${PORT:-3000}` portability** | resolved | `cross-env` (task 1). |

## Acceptance

- [ ] All 12 tasks complete; each validation step passes.
- [ ] `npm test` green.
- [ ] `npm run build` green without `ANTHROPIC_API_KEY` in env.
- [ ] `npm run scrape -- --fixtures __fixtures__` works offline against checked-in fixtures.
- [ ] `npm run scrape` against the live URL writes ≥40 rows, produces a JSONL log, finishes without unhandled rejections, and no zombie chromium left running.
- [ ] `/`, `/j/[id]`, `/e/[id]` render correctly on the deployed Railway URL.
- [ ] Risk bands distribute non-degenerately on the first real run.
- [ ] `mail_physical_resume` and `ats_known_provider` both trigger on at least one real job each (spot check).
- [ ] Patterns mirrored from `anki-srs`, not reinvented.
- [ ] Nominatim attribution visible in the UI.

## What this plan does NOT cover (deferred)

- Auth, multi-user
- Cron / scheduling (scrape is local-only)
- Filters beyond risk band
- Historical runs
- Multi-search-term scraping
- Real-time updates
- React component tests, Playwright E2E
- `react-markdown` for description rendering
- `matches_claimed_city` flag (raw geocode outputs only in v1)
- Versioned migrations (`db push` for v1)
