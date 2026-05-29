# job-fraud — Design

**Date:** 2026-05-29
**Status:** Spec, awaiting implementation plan

## Purpose

A small web tool that scrapes a WorkBC job-search results page, scores each posting for fraud probability using a combination of deterministic checks and a Claude judgment call, and displays the results as a triaged list bucketed by risk band.

Seed search URL:
`https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-search;search=software;pagesize=50;`

Scope is intentionally narrow for v1: one search, ~50 listings, manual CLI scrape, overwrite semantics, no auth.

## Architecture

```
┌──────────────────┐
│  npm run scrape  │  ← run manually on demand
└────────┬─────────┘
         │
         ▼
┌────────────────────────────────┐
│  Scraper job (Node script)     │
│  1. Playwright → WorkBC SPA    │
│  2. Extract 50 listings        │
│  3. Walk each detail page      │
│  4. Follow external apply URLs │
│  5. Upsert employers, run      │
│     employer-level checks      │
│  6. Score each job with Claude │
│  7. TRUNCATE jobs + INSERT     │
└────────┬───────────────────────┘
         │
         ▼
┌──────────────────┐       ┌────────────────────────┐
│   Postgres       │ ◄──── │  Next.js app (Railway) │
│   employers,     │       │  /  → tabs by risk     │
│   jobs           │       │  /j/[id] → job detail  │
│                  │       │  /e/[id] → employer    │
└──────────────────┘       └────────────────────────┘
```

Three pieces in one repo:

1. **`scripts/scrape.ts`** — standalone Node script. Does scraping + employer checks + Claude scoring + DB write end-to-end, then exits.
2. **`db/`** — Postgres schema + Drizzle ORM (matches the `anki-srs` pattern already in use on this account).
3. **Next.js app** — Server components reading from Postgres. No API routes for reads. No write endpoints in v1.

Boundary rules:

- Scraper and web app share the schema package but otherwise do not talk to each other. The script writes; the site reads.
- Overwrite of `jobs` is atomic: `BEGIN; TRUNCATE jobs; INSERT…; COMMIT;`. The site never sees a half-written run.
- `employers` is upserted, not overwritten, so expensive checks (HTTP probes, geocoding) are cached across runs.
- Only two required env vars: `DATABASE_URL`, `ANTHROPIC_API_KEY`.

Stack:

- Next.js (App Router) on Railway, Postgres on Railway, Drizzle ORM. Same shape as `anki-srs`.
- Playwright (chromium, headless) for both WorkBC and external apply pages.
- Anthropic SDK for Claude scoring (`claude-haiku-4-5-20251001`).
- Nominatim (OpenStreetMap) for geocoding.

## Data model

Two tables. Drizzle schema:

```ts
// db/schema.ts
export const employers = pgTable('employers', {
  id:              serial('id').primaryKey(),
  nameNormalized:  text('name_normalized').notNull().unique(),
  nameDisplay:     text('name_display').notNull(),

  website:         text('website'),
  applicationUrl:  text('application_url'),
  addressRaw:      text('address_raw'),

  checks:          jsonb('checks').notNull().default('{}'),
  checkedAt:       timestamp('checked_at'),
})

export const jobs = pgTable('jobs', {
  id:                 serial('id').primaryKey(),
  employerId:         integer('employer_id').references(() => employers.id),
  workbcId:           text('workbc_id').notNull(),
  title:              text('title').notNull(),
  location:           text('location'),
  salary:             text('salary'),
  postedAt:           text('posted_at'),
  sourceUrl:          text('source_url').notNull(),
  descriptionMd:      text('description_md').notNull(),

  externalApplyUrl:   text('external_apply_url'),
  externalApplyHost:  text('external_apply_host'),
  atsProvider:        text('ats_provider'),
  externalApplyOk:    boolean('external_apply_ok'),

  applicationFlags:   jsonb('application_flags').notNull().default('[]'),

  fraudScore:         integer('fraud_score').notNull(),
  riskBand:           text('risk_band').notNull(),
  reasoning:          text('reasoning').notNull(),
  signals:            jsonb('signals').notNull(),

  scrapedAt:          timestamp('scraped_at').notNull().defaultNow(),
})
```

### Risk bands

Stored as a column for cheap filtering, not computed in the UI:

- `low`: fraudScore < 30
- `medium`: 30 ≤ fraudScore < 70
- `high`: fraudScore ≥ 70
- `unknown`: fraudScore = -1 (Claude scoring failed for this job)

### `employers.checks` JSONB shape

Open-ended object. v1 keys (more easily added later without migration):

```json
{
  "websiteReachable": true,
  "websiteStatusCode": 200,
  "applicationReachable": false,
  "addressGeocoded": true,
  "addressMatchConfidence": 0.82,
  "addressResolvedTo": "1055 W Georgia St, Vancouver, BC V6E 3P3, Canada",
  "addressFlags": ["matches_claimed_city"]
}
```

### `jobs.applicationFlags` — deterministic posting-level flags

`string[]` set during the scrape from the posting's "how to apply" section. v1 set:

| Flag | Triggered when |
|---|---|
| `mail_physical_resume` | "How to apply" mentions mailing a printed résumé to a PO box or street address |
| `whatsapp_telegram_only` | Apply via WhatsApp / Telegram / SMS as the only method |
| `generic_email_domain` | Contact email is gmail/yahoo/hotmail/outlook for a non-individual employer |
| `fee_to_apply` | Posting asks for an application/training/equipment fee upfront |
| `id_upfront` | Asks for SIN, passport, or other ID before any interview |
| `vague_company_only` | No website, no street address, no LinkedIn — only a name and a contact email |

Detection is regex/keyword-based at scrape time. Each match records the phrase that triggered it so the detail view can cite specific evidence.

### `jobs.signals` JSONB — Claude's structured output

```ts
signals: Array<{
  label:    string;            // short, e.g. "Address geocodes to vacant lot"
  weight:   number;            // -30..+30, negative = legitimacy, positive = fraud
  evidence: string;            // one-line citation from the input
}>
```

## Scraper pipeline

```
scripts/scrape.ts

  ├─ launch Playwright (chromium, headless)
  ├─ navigate to SEARCH_URL
  ├─ wait for listing cards (network idle + visible)
  ├─ extract listing rows → JobStub[]   (title, workbcId, sourceUrl, employer name)
  │
  ├─ for each stub (sequential, 1.5s delay between detail pages):
  │     ├─ open detail page (#/job-details/<id>)
  │     ├─ wait for body selectors
  │     ├─ parse: location, salary, postedAt, descriptionMd, applyUrl, applyMethodText
  │     ├─ regex flag detection on applyMethodText → applicationFlags[]
  │     ├─ if applyUrl is off-site:
  │     │     ├─ classify host  → atsProvider (see registry)
  │     │     ├─ fetch external page (Playwright tab, 15s timeout, 1 retry,
  │     │     │   2s spacing between fetches)
  │     │     └─ if fetched, append external body text to descriptionMd
  │     └─ push enriched job into in-memory list
  │
  ├─ dedupe + group jobs by employer name → EmployerStub[]
  │
  ├─ for each employer:
  │     ├─ lookup existing employers row by nameNormalized
  │     ├─ if missing OR checkedAt > 7 days OR --reverify-employers:
  │     │     ├─ HEAD probe website (follow redirects)
  │     │     ├─ HEAD probe applicationUrl (if distinct)
  │     │     ├─ geocode addressRaw via Nominatim (1 req/sec)
  │     │     └─ write checks{} + checkedAt
  │     └─ upsert row, get employerId
  │
  ├─ for each job, score via Claude (concurrency = 5)
  │
  └─ BEGIN; TRUNCATE jobs; INSERT all rows; COMMIT;
```

### ATS registry

Living list in `lib/ats-registry.ts`. v1 entries:

| Host pattern | `atsProvider` |
|---|---|
| `*.myworkdaysite.com`, `*.myworkdayjobs.com` | `workday` |
| `boards.greenhouse.io`, `*.greenhouse.io` | `greenhouse` |
| `jobs.lever.co` | `lever` |
| `*.bamboohr.com` | `bamboohr` |
| `*.icims.com` | `icims` |
| `*.taleo.net` | `taleo` |
| `jobs.smartrecruiters.com` | `smartrecruiters` |
| `jobs.ashbyhq.com` | `ashby` |
| anything else | `unknown` |

### External-fetch derived flags

| Flag | Meaning | Direction |
|---|---|---|
| `ats_known_provider` | Apply URL is on a recognized enterprise ATS | positive (lowers fraud score) |
| `external_apply_unreachable` | Apply URL returned non-2xx or timed out | negative |
| `external_apply_is_file` | Apply URL serves a binary (.doc, .pdf, .zip) | negative |
| `apply_domain_mismatch` | Apply URL host doesn't match employer's claimed website host | mild negative (informational) |

## Claude scoring

One call per job, concurrency 5. Structured output via tool-use forcing — Claude is required to return JSON matching the schema below. No prose parsing.

Output schema:

```ts
{
  fraudScore:  number,    // 0..100
  riskBand:    'low' | 'medium' | 'high',
  reasoning:   string,    // 2-4 sentences for the detail view
  signals: Array<{
    label:    string,
    weight:   number,     // -30..+30
    evidence: string,
  }>,
}
```

Prompt structure (the real prompt will be ~500 tokens):

```
You are auditing a job posting for fraud risk. Output a probability 0-100
and cite the signals you used. Both positive (legitimacy) and negative
(fraud) signals matter — weight accordingly.

POSTING:
  Title: {title}
  Employer: {employer.nameDisplay or "(hidden)"}
  Location: {location}
  Salary: {salary}
  Posted: {postedAt}
  Description (markdown):
  {descriptionMd}

EMPLOYER VERIFICATION (deterministic — trust these):
  {employer.checks as pretty JSON, or "(employer hidden — no checks)"}

POSTING FLAGS (deterministic — trust these):
  Application flags: {applicationFlags}
  ATS provider: {atsProvider}
  External apply reachable: {externalApplyOk}

SCORING GUIDANCE:
  - ats_known_provider → strong legitimacy signal
  - addressGeocoded=false OR addressMatchConfidence<0.5 → strong fraud signal
  - mail_physical_resume + software role → strong fraud signal
  - generic_email_domain + no website → strong fraud signal
  - websiteReachable=false → moderate fraud signal
  - Vague descriptions, urgency, salary outliers, ID-upfront → fraud
  Cite specific evidence in each signal entry.

BANDS: low <30, medium 30-69, high ≥70.
```

Model: `claude-haiku-4-5-20251001`. Fast, cheap, capable for structured judgment on a one-page posting. Expected cost per run ≈ pennies.

## Error handling

| Failure | Behavior |
|---|---|
| Playwright launch fails | Hard exit, log to stderr. Nothing to fall back to. |
| WorkBC search page won't load / 0 listings extracted | Hard exit. Likely site structure changed. Do NOT truncate existing DB. |
| Single detail page fails | Skip that job, log, continue. |
| External apply fetch fails | Set `externalApplyOk = false`, continue. WorkBC body is still scored. |
| Employer geocode/probe fails | Set the relevant check to `false`/`null`, continue. |
| Claude call fails | Retry once with exponential backoff. If still fails: `fraudScore = -1`, `riskBand = 'unknown'`, `reasoning = 'scoring failed'`. UI surfaces these in an "Unknown" tab. |
| Postgres write fails | Transaction rolls back. Site keeps showing the previous run. |

Key invariant: the final `TRUNCATE + INSERT` is in a single transaction. Either the new run lands atomically or the site keeps showing the previous one.

## Observability

- Structured JSONL log to `logs/scrape-<ISO>.jsonl`. One line per job: `{workbcId, stage, durationMs, ok, error?}`.
- End-of-run summary printed to stdout: jobs found, scored, failed, total Claude tokens, total wall time.

## Web UI

Next.js App Router. Three pages. Server components only — each does its own Drizzle query. No `/api/*` for v1.

### `/` — risk-banded tabs

- Tabs: `High (n)` / `Medium (n)` / `Low (n)` / `Unknown (n)`. URL state: `/?band=high`. Default band on first load: `high`.
- Header row: "Last scraped: {scrapedAt} · {scored} of {total} scored".
- Row content: score chip, title, employer name (or "employer hidden"), 1–3 flag icons.
- Sort within tab: `fraudScore DESC, title ASC`.
- Empty state ("no scrape run yet"): instruct user to run `npm run scrape`.

### `/j/[id]` — job detail

Three stacked sections:

1. **Header.** Title · Employer (links to `/e/[id]`) · Location · Salary · "View on WorkBC" link. Big score chip.
2. **Verdict.** Claude's `reasoning` prose. Bulleted `signals[]`: `[+/- weight] [label] — evidence`. Color-coded (red bar for positive weights, green for negative).
3. **Evidence panels** (collapsible, all closed by default):
   - **Application flags** — deterministic posting flags with the phrases that matched.
   - **Employer checks** — pretty-printed `employers.checks`.
   - **Posting body** — full `descriptionMd` rendered.

### `/e/[id]` — employer detail

- Name, website (linked, with status badge: `✓ 200` / `✗ unreachable`), address claimed, address resolved (Nominatim's canonical form), checked-at timestamp.
- List of all jobs from this employer in the current run, with score + title.

### Styling

Tailwind + shadcn/ui (Tabs, Card, Badge). Matches the `anki-srs` setup.

### Revalidation

Data only changes when the script runs. `export const dynamic = 'force-dynamic'` on each page (or a short revalidate window) is sufficient.

## Out of scope for v1

- Login / multi-user
- Filters beyond risk band (no search box, no salary filter, no employer filter)
- CSV export
- "Refresh" button in the UI — manual CLI only
- Charts / trends / historical view
- Notifications
- Multi-search-term scraping (the URL is hard-coded in v1)
- Real geocoding providers beyond Nominatim (Google Maps, etc.)
- Pagination beyond the first 50 results

All are easy to add later; none are needed to ship the core value.

## Repo layout

```
job-fraud/
├── app/
│   ├── page.tsx                  # / — tabs by risk
│   ├── j/[id]/page.tsx           # job detail
│   └── e/[id]/page.tsx           # employer detail
├── components/
│   ├── ScoreChip.tsx
│   ├── FlagIcons.tsx
│   └── ui/                       # shadcn primitives
├── db/
│   ├── schema.ts
│   ├── client.ts                 # drizzle client
│   └── migrations/
├── lib/
│   ├── ats-registry.ts
│   ├── application-flags.ts      # regex detectors
│   ├── geocode.ts                # nominatim wrapper
│   ├── http-probe.ts
│   └── scoring.ts                # claude call + schema
├── scripts/
│   └── scrape.ts                 # the whole pipeline
├── docs/
│   └── superpowers/specs/
│       └── 2026-05-29-job-fraud-design.md   # this file
├── drizzle.config.ts
├── package.json
└── README.md
```

## Required env vars

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `ANTHROPIC_API_KEY` | Claude API key |

## Open items deferred to the implementation plan

- Exact WorkBC DOM selectors (need to inspect the live SPA during implementation).
- Exact regex patterns for each `applicationFlags` detector.
- Nominatim user-agent string (their TOS requires identifying your app).
- shadcn/ui component install list.
- Drizzle config + first migration.

These are normal implementation-time details, not architectural unknowns.
