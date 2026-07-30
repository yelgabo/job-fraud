# Technical info

Developer/operator documentation for the Job Fraud Scanner. For the system-architecture overview see
[ARCHITECTURE.md](ARCHITECTURE.md); for the plain-language overview see [README.md](../README.md); for
a file-by-file guide to the repo see [CODEMAP.md](CODEMAP.md).

**Stack:** Next.js 15 (App Router) · Prisma + PostgreSQL · Claude (`claude-haiku-4-5` for bulk
verify/scoring, `claude-opus-4-8` for brand-impersonation checks, incl. the `web_search` tool) · zod ·
p-limit · Vitest. Data comes from WorkBC's JSON APIs (no browser/HTML scraping). **Live:**
https://job-fraud-production.up.railway.app

## Architecture

Two heavy phases — **scrape** and **judge** — are decoupled local CLI jobs that share one Postgres
database. The deployed web app only reads that database; it never runs the pipeline or holds an API
key. The overall flow:

```
scrape ──▶ pending postings ──▶ judge ──▶ rated postings ──▶ web app (read-only)
```

**Phase 1 — scrape** (collect; cheap, pure HTTP) · `scripts/scrape.ts`

- Fetch postings from WorkBC's JSON APIs — search + per-job detail (`lib/workbc/workbc-api.ts`),
  concurrently (`--concurrency`).
- Run deterministic flag detectors over the text (`lib/signals/application-flags.ts`).
- Upsert each posting as **pending** (`scoredAt = null`). Re-runs accumulate; nothing is wiped.

**Phase 2 — judge** (evaluate; deduped, single DB writer) · `scripts/judge.ts`

- *Stage 1 — verify each distinct employer once (tiered).* Claude's `web_search` tool researches the
  company (`lib/ai/verify-employer-web.ts`); the verdict (`businessMatch`, `locationMatch`,
  `applicationAddressType`, …) is cached on the employer and reused by all its postings. **Tiering
  (cost):** an employer whose pending postings *all* apply via its own matching ATS tenant
  (`lib/signals/apply-host.ts` `allApplyHostsMatch`) is presumed legit with a deterministic verdict
  (`businessMatch=match`, `source=ats-tenant-match`) and **skips the web search**; web-verify is spent
  only on employers with an email/mail/phone/no-ATS or tenant-mismatch posting. A cached presumption
  is upgraded to a real web-verify if a new non-matching posting later appears.
- *Stage 1.5 — brand-impersonation pre-check.* For each posting, if its apply URL routes to a
  different company's ATS tenant than the claimed employer (`lib/signals/apply-host.ts`), a Claude
  (`opus-4-8`) `web_search` call (`lib/ai/check-impersonation.ts`) classifies the relationship
  (`same`/`affiliate`/`impersonation`/`uncertain`); a confirmed impersonation is re-attributed to the
  real company and scored HIGH (`lib/ai/resolve-impersonation.ts`).
- *Stage 2 — score each posting.* A cheap Claude call (no web search) combines the employer verdict
  with the posting's own flags / NOC / apply fields (`lib/ai/scoring.ts`) → `fraudScore`, `riskBand`,
  `reasoning`, `signals`, `scoredAt`.

An out-of-credit billing error aborts the run (`lib/shared/anthropic-errors.ts`) leaving jobs **pending**,
rather than mass-writing `unknown`.

**Web app** (read-only) · `app/` — `/` risk-band tabs × job-type category chips × posted-date windows
(any / 7 / 30 / 90 days, `?posted=`) · `/j/[id]` posting (with an Apply link to the real apply URL; de-emphasized plus a review-first
warning line on High-band postings) ·
`/e/[id]` employer · `/companies` by-company list ·
`/analysis` elevated-risk rate by category (by company / by posting) · `/about` methodology page
(renders the README's plain-language sections via `lib/shared/methodology.ts`; the README owns the
wording) · `/audit/<token>` internal web-search audit (token-gated, unlinked).

Risk band derives from the score (`lib/shared/risk-band.ts`): **low** `<30`, **medium** `30–69`, **high**
`≥70`, **unknown** for scoring failures. The UI shows only judged postings (`scoredAt` set).

All three filter dimensions are composed in one place, `lib/shared/postings-filter.ts`: each
dimension's tab counts apply the *other two* filters and not itself, which is what makes the tab
numbers equal the rows listed underneath them. The posted-date window compares the indexed
`Job.postedDate`, and falls back to `scrapedAt` for postings whose raw `postedAt` did not parse, so a
window never silently drops rows. Those rows are marked as estimates rather than as a posted date
the employer published: a compact `~date` (with a footnote) in the list, the full
`~date (est. from scrape)` label on the posting page (`lib/shared/posted-date.ts`).

## Data sources (what we gather, and how)

1. **Posting facts — WorkBC JSON APIs** (`lib/workbc/workbc-api.ts`). Search API
   (`POST /api/Search/JobSearch`) → employer, title, city, salary. Per-job
   `GET /api/Search/GetJobDetail?jobId=` → NOC occupation code, salary, apply method
   (`ApplyWebsite`/`ApplyEmailAddress`/`ApplyPhoneNumber`), and structured mailing address
   (`ApplyMail*`/`ApplyPerson*`). Authoritative structured data — no HTML parsing.
   - *History:* earlier versions scraped the WorkBC Angular SPA's HTML. Because the page is
     hash-routed, `page.goto(#/job-details/<id>)` did not reload, so Playwright captured the
     *previous* job's DOM — one posting's description/NOC/address got stamped onto ~273 others,
     producing bogus "impersonation" verdicts. Switching to the JSON API removed Playwright and the
     entire failure mode.
2. **Deterministic flags** (`lib/signals/application-flags.ts`) — regex detectors over apply text +
   description, each emitting matched `evidence`: `mail_physical_resume`, `generic_email_domain`
   (free providers only), `crypto_payment`, `banking_info_upfront`, `fee_to_apply`, `id_upfront`,
   `whatsapp_telegram_only`; plus pipeline-derived `ats_known_provider` (`lib/signals/ats-registry.ts`),
   `apply_host_mismatch` (brand impersonation — apply URL routes to a different company, `lib/signals/apply-host.ts`),
   and the NOC-derived job-type `category` (`lib/signals/job-category.ts`).
3. **Employer web verification** (`lib/ai/verify-employer-web.ts`) — once per company, Claude's
   `web_search` tool returns `businessMatch`, `locationMatch`, `hasJobsListing`,
   `applicationAddressType` (`business|residential|po_box|virtual|none|uncertain`), `websiteUrl`,
   `confidence`, `summary`. Cached on the employer and reused across its postings.

## Scoring logic

Claude (`lib/ai/scoring.ts`, `temperature: 0`) outputs `fraudScore` 0–100 plus `signals[]`, each
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
never a fabricated score. A **confirmed brand impersonation** (apply URL routes to an unrelated
company) bypasses the scoring model and is written deterministically as HIGH (`lib/ai/resolve-impersonation.ts`).

## Setup

```bash
npm install
cp .env.example .env          # DATABASE_URL always; ANTHROPIC_API_KEY only for the keyed judge
npx prisma db push            # create the Employer/Job tables
npm run scrape -- --limit 50  # collect 50 software-engineer postings (pending)
npm run judge -- --limit 50   # evaluate them (needs a real key uncommented in .env)
npm run dev                   # http://localhost:3000
```

`DATABASE_URL` must be reachable from your machine — for Railway Postgres use its **public** URL
(TCP-proxy host), not `*.railway.internal`. The web app needs only `DATABASE_URL`, and so does
`scrape`: it makes no Anthropic calls. `ANTHROPIC_API_KEY` is read only by the keyed judge path
(`judge`, `rescore-failed`, `reverify-mail`, `rescan-impersonation`, `compare-judge`); the keyless
`judge:fetch` -> agents -> `judge:apply` path needs no key at all. Keep the key commented out in
`.env` unless it is real, because `lib/env.ts` accepts any non-empty string, so a placeholder sends
the run down the keyed path where every call 401s and the postings are written as judged. Set
`AUDIT_TOKEN` (web-app env) to enable the unlinked `/audit/<token>` internal pages; unset ⇒ they 404.

## Commands

**Scrape (collect).** A refresh is **two passes**, and both are intended. The *term pass* looks for
tech postings across all of BC by keyword; it comes in two variants, a routine weekly form and a
full-depth catch-up form, both below. The *city pass* sweeps every occupation in one city, not
just tech, which is deliberate: fraud patterns are not confined to tech listings. The city pass is by
far the larger of the two. On the most recent real run the term pass collected 42 new postings and the
city pass collected 411, so running only the term pass gets you roughly a tenth of a refresh.

```bash
# Pass 1 - term pass, routine form: tech postings across BC from the last week.
npm run scrape -- --search-terms "software engineer,software" --recent week --skip-existing

# Pass 1 - term pass, catch-up form: full-depth paging for after a gap longer than a week, or a gap
# of unknown age. Deliberately chosen on 2026-07-28, when 13 days had passed since the last refresh.
npm run scrape -- --search-terms "software engineer,software" --limit 5000 --skip-existing

# Pass 2 - city pass: every occupation in Victoria, keyword filter explicitly disabled.
npm run scrape -- --location "Victoria" --search-terms "" --limit 5000 --skip-existing

npm run scrape -- --search-terms "software engineer,software" --limit 500 --concurrency 6  # one-off backfill
npm run scrape -- --dry-run          # collect without writing
```

The routine refresh (weekly term pass, then Victoria city pass) runs automatically every Monday
via GitHub Actions (`.github/workflows/scrape.yml`, also runnable on demand from the Actions tab).
The scheduled run scrapes only: it collects postings as `pending` and never judges, so it carries
no `ANTHROPIC_API_KEY`. The manual commands above remain the right tool for catch-up runs, backfills
and dry runs.

Then `npm run judge` (which judges only pending postings and web-verifies only the employers that
need it). Judging is manual on purpose - there is no scheduled judge run, so pending postings wait
for someone to run the judge path (either variant below).

Flags:

- **`--search-terms`** comma-separated keywords, merged + de-duped by job id. Defaults to
  `"software engineer"` with no `--location`, and to the empty keyword (every posting in the city)
  when `--location` is given.
- **`--location "Victoria"`** (or a comma-separated list such as `"Victoria,Saanich"`) is a WorkBC
  server-side city filter. Pair it with `--search-terms ""` to collect every posting in that city
  regardless of keyword or category.
- **`--limit N`** caps stubs collected. The default cap is 5000 with `--recent` or a `--location`, and
  only 50 otherwise, so an explicit `--limit` matters on a plain term run.
- **`--concurrency N`** parallel detail fetches (default 6).
- **`--recent day|week`** asks WorkBC server-side (`SearchDateSelection`) for only postings from the
  last day/week, so the term pass pulls a few dozen to a few hundred recent stubs instead of paging
  the whole feed.
- **`--skip-existing`** (alias `--new-only`) drops `workbcId`s already in the DB so only genuinely new
  postings have their detail fetched.
- **`--dry-run`** collects without writing.

Re-running upserts (refreshes scraped fields, preserves prior judgment) so a corpus grows across runs.

> **`WORKBC_SEARCH_TERMS` precedence trap.** The scraper resolves the keyword as
> `--search-terms` ?? `WORKBC_SEARCH_TERMS` ?? (empty when a location is set, else
> `"software engineer"`) (`scripts/scrape.ts`). So the env var **outranks** the empty city default: on
> a machine where `WORKBC_SEARCH_TERMS` is set in `.env`, a city pass that omits `--search-terms`
> silently narrows to those keywords and quietly misses most of the city. Always pass
> `--search-terms ""` explicitly on the city pass. The term pass has the same exposure: the env var
> also outranks the `"software engineer"` default, which is why both term-pass variants above pin
> `--search-terms "software engineer,software"` explicitly.

**Judge (evaluate) — deduped, recommended:**
```bash
npm run judge -- --limit 500         # next 500 pending
npm run judge -- --rejudge           # re-evaluate everything (e.g. after prompt tuning)
npm run judge -- --emp-concurrency 4 --score-concurrency 8
```
Single-process (one DB writer → no races); web-verifies each distinct employer once, then cheap
per-job scoring. ~1 web search per company instead of per posting. Wrapped by the `judge-postings`
skill (`.claude/skills/`) for repeatable/scheduled runs.

**Backfill the posted-date column.** `Job.postedDate` is parsed from the raw `Job.postedAt` string;
run this after any change to the parser, or once after the column is first added. Pure parse, no API
calls, re-runnable, and the raw string is never touched. **The default is a dry run** that reports what
it would change and writes nothing:

```bash
npm run backfill-posted-date                    # dry run: counts + unparseable samples
npm run backfill-posted-date -- --limit 100     # dry-run a sample of rows
npm run backfill-posted-date -- --samples 50    # print more unparseable raw values
npm run backfill-posted-date -- --apply         # write (publishes with no deploy, live within ~10 min)
```

Rows whose raw value is missing, ambiguous or junk keep `postedDate = null` on purpose: the parser
never guesses a date, and the site marks those postings' dates as estimates (`~date`).

**Helpers:** `npm run rescore-failed` (re-score `unknown`-band rows) · `npm run reverify-mail`
(re-verify mail-address employers) · `npm run rescan-impersonation` (corpus sweep for apply-host≠employer
brand impersonation) · `npm run backfill-categories` (fill `nocCode`/`nocGroup`/`category` from stored
descriptions — pure parse, no API) · `npm run backfill-posted-date` (fill `postedDate` from `postedAt` -
pure parse, no API, dry run by default) · `npm run compare-judge` (read-only A/B of deduped vs agent scoring) ·
**agent "deep" path:** `npm run judge:fetch` dumps pending into per-batch files for dispatched fraud
agents, `npm run judge:apply <dir>` validates + applies their verdicts (single writer) — see
`judge-runbook.md`.

## Adding an application-flag detector

Edit `lib/signals/application-flags.ts` — add a `{flag, patterns}` entry to `DETECTORS` (matched text →
`evidence`). Add a label/icon in `components/FlagIcons.tsx` and a case in
`lib/signals/application-flags.test.ts`. The scoring prompt (`lib/ai/scoring.ts`) reads the flags array, so new
flags feed the score automatically.

## Testing & deploy

```bash
npm test          # vitest — helpers, parsers, schema, mocked-SDK scoring/verify, component render
npm run build     # prisma generate + next build (full type-check)
```

GitHub-connected Railway service (`railway.json`, RAILPACK; start = `prisma db push` then
`next start`). Web service needs only `DATABASE_URL` (reference to the Postgres service). Refresh
prod data by running `scrape`/`judge` locally against the same DB: the site serves pages cached
up to 10 minutes (`revalidate`/`unstable_cache` 600 s on the public pages), so data updates appear
without a deploy, within the revalidation window. When `REVALIDATE_TOKEN` is set locally (matching
the deployed service's env var), the write-side CLIs (`scrape`, `judge`, `judge:apply`) also POST
`/api/revalidate` at the end of a successful run, which refreshes the public pages immediately and
then sends a second `?phase=warm` request that re-renders the common filter pages
(`lib/shared/warm-targets.ts`) so their first visitors get cache hits; if the token is unset or the
endpoint is unreachable, the run logs one warning and the 600 s timer remains the backstop
(`lib/shared/request-revalidation.ts`, `app/api/revalidate/route.ts`). If
GitHub auto-deploy doesn't pick up a push, `railway up --detach` forces a deploy.
