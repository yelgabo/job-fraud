# Job Fraud Scanner — WorkBC

Collects software/tech job postings from [WorkBC](https://www.workbc.ca), evaluates each for
fraud risk with Claude (deterministic flags + AI employer verification + scoring), and shows the
results in risk-banded tabs and a by-company view.

**Live:** https://job-fraud-production.up.railway.app

Data is pulled from **WorkBC's JSON APIs** (no HTML/browser scraping). The two heavy phases —
**scrape** (collect) and **judge** (evaluate) — are decoupled local CLI jobs; the deployed web app
only reads the database (it never runs the pipeline or holds an API key).

## Architecture

```
PHASE 1 — scrape (collect, cheap, pure HTTP — scripts/scrape.ts)
  WorkBC search API  ──▶ stubs (employer, city, salary)        lib/workbc-api.ts
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

Risk band derives from the score (`lib/risk-band.ts`): `low <30`, `medium 30–69`, `high ≥70`.
The UI shows **only judged** postings; pending ones are hidden until evaluated.

## What we gather (and how)

Three layers of evidence per posting:

1. **Posting facts — WorkBC JSON APIs** (`lib/workbc-api.ts`). The search API gives employer name,
   title, city, salary; the per-job `GetJobDetail` API gives the real **NOC occupation code**,
   salary, **apply method** (website/email/phone), and the **structured mailing address**
   (`ApplyMail*`/`ApplyPerson*`). This is authoritative structured data — no fragile HTML parsing.
   *(Early versions scraped the Angular SPA's HTML; hash-route navigation didn't reload the page, so
   one job's content bled onto hundreds of others — the JSON API eliminates that whole failure mode.)*
2. **Deterministic flags** (`lib/application-flags.ts`) — regex detectors over the apply text +
   description, each emitting the matched `evidence`:
   `mail_physical_resume`, `generic_email_domain` (free providers only — gmail/outlook/yahoo/…),
   `crypto_payment`, `banking_info_upfront`, `fee_to_apply`, `id_upfront`, `whatsapp_telegram_only`;
   plus pipeline-derived `ats_known_provider` (apply URL is a real ATS — Workday/Greenhouse/Lever/…)
   and `external_apply_unreachable`.
3. **Employer web verification** (`lib/verify-employer-web.ts`) — once per company, Claude uses its
   `web_search` tool to find the official site and judge: `businessMatch` (a real company that could
   employ this role — *any* industry; "mismatch" only for fake/shell/impersonating/unverifiable),
   `locationMatch`, `hasJobsListing`, and `applicationAddressType` (is the mailing address a real
   business office vs a `residential`/`po_box`/`virtual` address). Cached on the employer and reused
   across all its postings.

## How the fraud score works

Claude produces a `fraudScore` 0–100 plus a `signals[]` list, each signal weighted **−30
(legitimacy) … +30 (fraud)** with cited evidence (`lib/scoring.ts`, `temperature: 0`). Guidance:

| Signal | Effect |
|---|---|
| `applicationAddressType` = residential / po_box / virtual | **+35…45** (mail your résumé to a house/PO box = top red flag; with `mail_physical_resume` → HIGH) |
| `businessMatch` = mismatch (fake/shell/impersonation) | +20…30 · match → −10…20 |
| `crypto_payment` / `banking_info_upfront` | +20…30 |
| `generic_email_domain` (free provider) | +15…25 · a **company-domain** email is normal (never penalized) |
| `mail_physical_resume` + software role | +20 |
| `locationMatch` = mismatch | +10…15 |
| website unreachable (checked `false`, not unknown) | +10…15 |
| `ats_known_provider` / applies via real ATS | −20…30 (strong legitimacy) |
| detailed duties, real benefits, recognizable employer, careers page | −10…20 |

Two rules keep it honest: **a check that's `null`/`unknown` is strictly neutral** (we never penalize
missing info — that earlier over-flagged legit employers), and **`mismatch` means "not a real
company,"** not "the company's industry differs from the role" (a ridesharing firm hiring a
developer is a match). A failed scoring call lands in the `unknown` band, not a fabricated score.

## Quickstart

```bash
npm install
cp .env.example .env          # DATABASE_URL (+ ANTHROPIC_API_KEY for scrape/judge)
npx prisma db push            # create the Employer/Job tables
npm run scrape -- --limit 50  # collect 50 software-engineer postings (pending)
npm run judge -- --limit 50   # evaluate them
npm run dev                   # view at http://localhost:3000
```

`DATABASE_URL` must be reachable from your machine — for Railway Postgres use its **public** URL
(the TCP-proxy host), not the `*.railway.internal` one. The web app needs only `DATABASE_URL`;
`ANTHROPIC_API_KEY` is used by `scrape`/`judge` (the judge calls Claude with the `web_search` tool).

## Scrape (collect)

```bash
npm run scrape -- --search-terms "software engineer,software" --limit 500 --concurrency 6
```

- `--search-terms` comma-separated WorkBC keywords (default `"software engineer"`); results merged
  and de-duped by job id. `--limit N` caps total. `--concurrency N` parallel detail fetches (default 6).
- `--dry-run` collects without writing. Re-running upserts (refreshes scraped fields, **preserves**
  any prior judgment) — so you can grow a corpus across runs.

## Judge (evaluate)

```bash
npm run judge -- --limit 500          # evaluate the next 500 pending (deduped, recommended)
npm run judge -- --rejudge            # re-evaluate everything (e.g. after prompt tuning)
npm run judge -- --emp-concurrency 4 --score-concurrency 8
```

`judge.ts` is single-process (one DB writer → no races) and **dedups by employer**: it web-verifies
each distinct pending employer once, then does a cheap per-job score reusing that verdict. Roughly
one web search per company instead of per posting.

- **Repeatable / schedulable:** the `judge-postings` skill (`.claude/skills/`) wraps this flow.
- **Helpers:** `npm run rescore-failed` (re-score rows whose band is `unknown`),
  `npm run compare-judge` (read-only A/B of the deduped judge vs the agent path).
- **Optional "deep" path:** `npm run judge:fetch` dumps pending postings into per-batch files for
  dispatched fraud-detection agents; `npm run judge:apply <dir>` validates + applies their verdicts
  (single writer). Richer per-posting investigation, but no employer dedup — see `docs/judge-runbook.md`.

## Adding a new application-flag detector

Edit [`lib/application-flags.ts`](lib/application-flags.ts): add a `{flag, patterns}` entry to
`DETECTORS` (matched text becomes the flag's `evidence`). Add a label/icon in
[`components/FlagIcons.tsx`](components/FlagIcons.tsx) and a case in
[`lib/application-flags.test.ts`](lib/application-flags.test.ts). The scoring prompt
([`lib/scoring.ts`](lib/scoring.ts)) reads the flags array, so new flags feed the score automatically.

## Testing

```bash
npm test          # vitest — pure helpers, parsers, schema, mocked-SDK scoring/verify
npm run build     # prisma generate + next build (type-checks the whole app)
```

## Deploy

GitHub-connected Railway service (`railway.json`, RAILPACK; start = `prisma db push` then
`next start`). The web service needs only `DATABASE_URL` (a reference to the Postgres service).
To refresh production data, run `scrape`/`judge` locally against the same database — the site reads
it live. (If GitHub auto-deploy isn't picking up a push, `railway up --detach` forces a deploy.)

## Notes

Employer web verification uses Claude's `web_search` tool. Source job data: WorkBC. Risk scores are
heuristic and for screening only — not a determination of fraud.
