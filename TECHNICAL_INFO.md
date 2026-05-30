# Technical info

Developer/operator documentation for the Job Fraud Scanner. For the plain-language overview see
[README.md](README.md).

**Stack:** Next.js 15 (App Router) · Prisma + PostgreSQL · Claude (`claude-haiku-4-5`, incl. the
`web_search` tool) · zod · p-limit · Vitest. Data comes from WorkBC's JSON APIs (no browser/HTML
scraping). **Live:** https://job-fraud-production.up.railway.app

## Architecture

The two heavy phases — **scrape** (collect) and **judge** (evaluate) — are decoupled local CLI jobs;
the deployed web app only reads the database (it never runs the pipeline or holds an API key).

```
PHASE 1 — scrape (collect, cheap, pure HTTP — scripts/scrape.ts)
  WorkBC search API  ──▶ stubs (employer, city, salary)         lib/workbc-api.ts
  WorkBC detail API  ──▶ per-job NOC, apply URL/email, address  (concurrent, --concurrency)
  deterministic flags (mail/email/crypto/banking/ATS…)          lib/application-flags.ts
  ──▶ UPSERT raw postings as "pending" (scoredAt = null)         (accumulates; no TRUNCATE)

PHASE 2 — judge (evaluate — scripts/judge.ts, deduped + single-writer)
  Stage 1: verify each DISTINCT employer once (Claude web_search) lib/verify-employer-web.ts
           → employer.checks.web {businessMatch, locationMatch, applicationAddressType, …}
  Stage 2: score each job (Claude, no web) reusing the employer verdict + the posting's
           own flags/NOC/apply fields                            lib/scoring.ts
  ──▶ update job {fraudScore, riskBand, reasoning, signals, scoredAt}

WEB APP (read-only) — app/  : / (risk tabs) · /j/[id] · /e/[id] · /companies
```

Risk band derives from the score (`lib/risk-band.ts`): `low <30`, `medium 30–69`, `high ≥70`,
`unknown` for scoring failures. The UI shows only judged postings (`scoredAt != null`).

## Data sources (what we gather, and how)

1. **Posting facts — WorkBC JSON APIs** (`lib/workbc-api.ts`). Search API
   (`POST /api/Search/JobSearch`) → employer, title, city, salary. Per-job
   `GET /api/Search/GetJobDetail?jobId=` → NOC occupation code, salary, apply method
   (`ApplyWebsite`/`ApplyEmailAddress`/`ApplyPhoneNumber`), and structured mailing address
   (`ApplyMail*`/`ApplyPerson*`). Authoritative structured data — no HTML parsing.
   - *History:* earlier versions scraped the WorkBC Angular SPA's HTML. Because the page is
     hash-routed, `page.goto(#/job-details/<id>)` did not reload, so Playwright captured the
     *previous* job's DOM — one posting's description/NOC/address got stamped onto ~273 others,
     producing bogus "impersonation" verdicts. Switching to the JSON API removed Playwright and the
     entire failure mode.
2. **Deterministic flags** (`lib/application-flags.ts`) — regex detectors over apply text +
   description, each emitting matched `evidence`: `mail_physical_resume`, `generic_email_domain`
   (free providers only), `crypto_payment`, `banking_info_upfront`, `fee_to_apply`, `id_upfront`,
   `whatsapp_telegram_only`; plus pipeline-derived `ats_known_provider` (`lib/ats-registry.ts`) and
   `external_apply_unreachable`.
3. **Employer web verification** (`lib/verify-employer-web.ts`) — once per company, Claude's
   `web_search` tool returns `businessMatch`, `locationMatch`, `hasJobsListing`,
   `applicationAddressType` (`business|residential|po_box|virtual|none|uncertain`), `websiteUrl`,
   `confidence`, `summary`. Cached on the employer and reused across its postings.

## Scoring logic

Claude (`lib/scoring.ts`, `temperature: 0`) outputs `fraudScore` 0–100 plus `signals[]`, each
weighted **−30 (legitimacy) … +30 (fraud)** with cited evidence.

| Signal | Weight |
|---|---|
| `applicationAddressType` = residential / po_box / virtual | **+35…45** (alone → HIGH; with `mail_physical_resume` → HIGH) |
| `businessMatch` = mismatch (fake/shell/impersonation) | +20…30 · match → −10…20 |
| `crypto_payment` / `banking_info_upfront` | +20…30 |
| `generic_email_domain` (free provider) | +15…25 · company-domain email = normal, never penalized |
| `mail_physical_resume` + software role | +20 |
| `locationMatch` = mismatch | +10…15 |
| website unreachable (checked `false`, not unknown) | +10…15 |
| `ats_known_provider` / applies via a real ATS | −20…30 |
| detailed duties, real benefits, recognizable employer, careers page | −10…20 |

Two invariants: a check that is `null`/`unknown` is **strictly neutral** (missing info is never
penalized), and `mismatch` means "not a real company" — **not** "the company's industry differs from
the role" (a ridesharing firm hiring a developer is a match). A failed scoring call → `unknown` band,
never a fabricated score.

## Setup

```bash
npm install
cp .env.example .env          # DATABASE_URL (+ ANTHROPIC_API_KEY for scrape/judge)
npx prisma db push            # create the Employer/Job tables
npm run scrape -- --limit 50  # collect 50 software-engineer postings (pending)
npm run judge -- --limit 50   # evaluate them
npm run dev                   # http://localhost:3000
```

`DATABASE_URL` must be reachable from your machine — for Railway Postgres use its **public** URL
(TCP-proxy host), not `*.railway.internal`. The web app needs only `DATABASE_URL`;
`ANTHROPIC_API_KEY` is used by `scrape`/`judge`.

## Commands

**Scrape (collect):**
```bash
npm run scrape -- --search-terms "software engineer,software" --limit 500 --concurrency 6
npm run scrape -- --dry-run          # collect without writing
```
`--search-terms` (default `"software engineer"`) merged + de-duped by job id; `--limit N` caps;
`--concurrency N` parallel detail fetches (default 6). Re-running upserts (refreshes scraped fields,
preserves prior judgment) so a corpus grows across runs.

**Judge (evaluate) — deduped, recommended:**
```bash
npm run judge -- --limit 500         # next 500 pending
npm run judge -- --rejudge           # re-evaluate everything (e.g. after prompt tuning)
npm run judge -- --emp-concurrency 4 --score-concurrency 8
```
Single-process (one DB writer → no races); web-verifies each distinct employer once, then cheap
per-job scoring. ~1 web search per company instead of per posting. Wrapped by the `judge-postings`
skill (`.claude/skills/`) for repeatable/scheduled runs.

**Helpers:** `npm run rescore-failed` (re-score `unknown`-band rows) · `npm run compare-judge`
(read-only A/B of deduped vs agent scoring) · **agent "deep" path:** `npm run judge:fetch` dumps
pending into per-batch files for dispatched fraud agents, `npm run judge:apply <dir>` validates +
applies their verdicts (single writer) — see `docs/judge-runbook.md`.

## Adding an application-flag detector

Edit `lib/application-flags.ts` — add a `{flag, patterns}` entry to `DETECTORS` (matched text →
`evidence`). Add a label/icon in `components/FlagIcons.tsx` and a case in
`lib/application-flags.test.ts`. The scoring prompt (`lib/scoring.ts`) reads the flags array, so new
flags feed the score automatically.

## Testing & deploy

```bash
npm test          # vitest — helpers, parsers, schema, mocked-SDK scoring/verify
npm run build     # prisma generate + next build (full type-check)
```

GitHub-connected Railway service (`railway.json`, RAILPACK; start = `prisma db push` then
`next start`). Web service needs only `DATABASE_URL` (reference to the Postgres service). Refresh
prod data by running `scrape`/`judge` locally against the same DB — the site reads it live. If
GitHub auto-deploy doesn't pick up a push, `railway up --detach` forces a deploy.
