# Job Fraud Scanner — WorkBC

Scrapes the [WorkBC](https://www.workbc.ca) software-jobs search page, runs deterministic
employer- and posting-level checks, scores each posting for fraud risk with Claude, and shows
the results in risk-banded tabs.

**Live:** https://job-fraud-production.up.railway.app

The scrape is a **local CLI job** (it needs Playwright + an Anthropic key). The deployed web app
only reads the database, so production never runs the scraper or holds an API key.

## How it works

```
WorkBC search ─▶ parse listing stubs ─▶ per-job: fetch detail (Playwright)
   │                                        ├─ parse title/employer/location/salary/description
   │                                        ├─ detect application flags (regex)         lib/application-flags.ts
   │                                        └─ follow external apply link → ATS classify lib/ats-registry.ts
   ├─ dedupe employers by normalized name (lib/normalize-employer.ts)
   ├─ employer checks: website probe (lib/http-probe.ts) + geocode (lib/geocode.ts)
   ├─ score each posting with Claude (tool-use, temp 0)          lib/scoring.ts
   └─ atomic TRUNCATE + INSERT into Postgres                     scripts/scrape.ts
```

Risk band is derived from the score deterministically (`lib/risk-band.ts`): `low <30`, `medium
30–69`, `high ≥70`, `unknown` for scoring failures.

## Quickstart

```bash
npm install
npx playwright install chromium        # only needed to run the scraper
cp .env.example .env                    # then fill in DATABASE_URL + ANTHROPIC_API_KEY
npx prisma db push                      # create the Employer/Job tables
npm run scrape                          # scrape + score live WorkBC postings
npm run dev                             # view the UI at http://localhost:3000
```

`DATABASE_URL` must be reachable from your machine — for the Railway Postgres use its
**public** URL (the TCP-proxy host), not the `*.railway.internal` one.

## Scraper flags

```bash
npm run scrape                                   # full live run
npm run scrape -- --limit 30                     # process only the first 30 stubs (smoke test)
npm run scrape -- --reverify-employers           # re-run employer checks even if cached (<7 days)
npm run scrape -- --dry-run                       # parse + score but DO NOT write to the DB
npm run scrape -- --fixtures __fixtures__         # OFFLINE: read saved HTML, no Playwright/network
npm run scrape -- --capture-fixtures __fixtures__ # live run that also saves HTML into __fixtures__
```

- **Offline mode** (`--fixtures`) replays the HTML in `__fixtures__/` — no browser, no WorkBC,
  no geocoding. Great for iterating on parsing/scoring without hitting the live site. It still
  uses the database and (unless `--dry-run`) calls Claude.
- To refresh the captured fixtures, run `--capture-fixtures __fixtures__` against the live site.

## Adding a new application-flag detector

Edit [`lib/application-flags.ts`](lib/application-flags.ts): add an entry to `DETECTORS` with a
`flag` name and one or more `patterns` (regexes). The matched text becomes the flag's `evidence`,
which the UI shows. Add a label/icon in [`components/FlagIcons.tsx`](components/FlagIcons.tsx) and
a case in [`lib/application-flags.test.ts`](lib/application-flags.test.ts). The scoring prompt in
[`lib/scoring.ts`](lib/scoring.ts) reads the deterministic flags array, so new flags feed into the
score automatically.

## Testing

```bash
npm test          # vitest — pure helpers + parsers against real __fixtures__
npm run build     # prisma generate + next build (type-checks the whole app)
```

## Deploy

Pushed to `main` → Railway auto-builds (`railway.json`, RAILPACK). The start command runs
`prisma db push` then `next start`. The web service needs only `DATABASE_URL` (a reference to the
Postgres service); it does **not** need `ANTHROPIC_API_KEY`. To refresh production data, run the
scraper locally pointed at the same database — the site reads it live.

## Attribution

Geocoding © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (via Nominatim).
Source job data: WorkBC. Risk scores are heuristic and for screening only — not a determination of
fraud.
