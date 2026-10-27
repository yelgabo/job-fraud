# job-fraud - agent notes

Public review of WorkBC job postings (tech terms plus a city-wide Victoria pass), each rated on
whether it looks like a genuine attempt to hire locally. Next.js + Prisma/Postgres, a scraping CLI, and an LLM judging CLI. Live at
https://job-fraud-production.up.railway.app

Read `README.md` (why the postings are reviewed), then `docs/ARCHITECTURE.md`,
`docs/TECHNICAL_INFO.md` (setup, commands, scoring rubric) and `docs/CODEMAP.md` (file-by-file).
Those are the authoritative docs; this file only covers what they do not warn you about.

## Two things that make this repo higher-stakes than it looks

**1. This repository is public.** `yelgabo/job-fraud`, visibility `public` (verify:
`gh repo view yelgabo/job-fraud`). Commits, PR bodies, issue text and branch names are all visible
to anyone. Write them accordingly.

**2. It publishes judgements about named real employers.** Every posting on the live site carries a
Low/Medium/High risk band, the employer's name, and reasoning naming that employer. Changing a
scoring rule, a question, or a rescore script does not just change code, it changes published claims
about real organisations. No model chooses the number: the weight table is `lib/scoring/weights.ts`,
the composer `lib/scoring/compose.ts`, the published prose `lib/scoring/explain.ts`, the Jev text
questions `lib/ai/jev-judgments.ts`, the employer verdict prompt `lib/ai/verify-employer-web.ts`,
the impersonation check `lib/ai/check-impersonation.ts`, and the score-to-band cut-offs
`lib/shared/risk-band.ts`. `docs/scoring-algorithm.md` is the prose account and
`docs/TECHNICAL_INFO.md` summarises it; if you change the table, change both or they will disagree.
A weight change is `npm run recompose` over the composed rows (no inference); a question change
needs those rows re-judged. Adding a weight-table row without a `lib/shared/signal-labels.ts`
entry fails a test. The README's plain-language sections (why postings are reviewed, what the bands
mean, the caveats) are rendered live on the site's `/about` page (`app/about/page.tsx` +
`lib/shared/methodology.ts`), so a README edit is an edit to published site copy, and
`lib/shared/methodology.test.ts` pins the caveat wording.

## Do not run these casually

Nearly every script here spends money, hits WorkBC, or writes to the **production** database. There
is no separate staging DB: `.env`'s `DATABASE_URL` points at the live Railway Postgres, and the
deployed site reads that database, so **a local script run publishes with no deploy step** (public
pages are cached with 600 s revalidation, so visitors see it within about 10 minutes - immediately
if `REVALIDATE_TOKEN` is set, because scrape/judge/apply then POST `/api/revalidate` on success). Read
`docs/TECHNICAL_INFO.md` before running any of them, and do not run them
speculatively to "see what happens".

| Command | Why it is not casual |
|---|---|
| `npm run scrape` | Hits WorkBC's JSON APIs and upserts rows. No API key needed, no LLM cost, but it is outbound traffic to a public government service and it writes to prod. `--dry-run` collects without writing. |
| `npm run judge` | Anthropic `web_search` verification per unverified employer, then a Jev call per posting (when `TYPESAFE_API_KEY` is set, about $2 per corpus) and a composed score. `--rejudge` re-verifies and re-scores **everything** and rewrites every published verdict. Always bound it with `--limit` unless a full re-judge is the actual goal. |
| `npm run rescore-failed` | Re-scores every row with `riskBand="unknown"` (Jev + composer, no Anthropic key needed). **No limit flag** - it processes all of them. |
| `npm run reverify-mail` | Re-web-verifies every employer with a `mail_physical_resume` posting and re-scores all their postings. **No limit and no dry-run flag.** These are exactly the postings most likely to be rated High, so this rewrites the most consequential published claims. |
| `npm run recompose` | Recomputes score, band, signals and prose for every composed row (`scoringVersion` not null) from its stored judgments and the current weight table. No API calls, but `--apply` rewrites every one of those published verdicts. Dry run is the default. |
| `npm run rescan-impersonation` | Corpus-wide sweep; confirmed impersonations are re-attributed to a different company and written HIGH deterministically, bypassing the scoring model. Uses Opus. `--dry-run` lists candidates without web-checking or writing. |
| `npm run compare-verifiers` | Read-only against the DB (verdicts go to `logs/compare-verifiers-*/`, never to an Employer row), but each model makes a web-verification call per employer: tokens plus $10 per 1,000 searches. Needs `ANTHROPIC_API_KEY` in the environment, not in `.env`. Bound it with `--employers`. Models and prices live in `lib/ai/verifier-models.ts`. |
| `npm run compare-jev` / `npm run measure-questions` | Read-only against the DB, but each makes a Jev call per sampled posting. |
| `npm run eval:snapshot` | Read-only against the DB; rewrites the label-harness fixture in `lib/eval/__fixtures__/`, which moves the evidence under every label, so re-measure `lib/eval/baseline.ts` in the same commit. `--ask-jev` adds a Jev call per posting without stored judgments. (`npm run eval:labels` is free: fixture only.) |
| `npm run judge-keyless:apply` | The single DB writer for the keyless judge. Stores each agent `web` verdict on its employer, then asks Jev (when keyed) and composes every posting the fetch grouped under it: overwrites `fraudScore`/`riskBand`/`reasoning`/`signals`/`judgments`/`scoringVersion`/`scoredAt`. Publishes verdicts. `--dry-run` validates and reports what it would score without writing. |
| `npm run backfill-categories` | No API calls, but it updates **every** Job row. |
| `npm run backfill-ats` | Re-classifies stored apply hosts after an ATS registry change. Pending rows only by default: no API calls, publishes nothing. `--include-judged` also changes judged rows and **re-scores** each one (stored Jev judgments, or a fresh Jev call when none are stored), so it rewrites published ratings; confirmed impersonations keep their score. Dry run is the default. |
| `npm run recheck-cached-verdicts` | Re-checks cached employer verdicts with Opus 5.5, stores them and re-scores the employer's **judged** postings (stored Jev judgments, or a fresh Jev call; confirmed impersonations skipped). Default selection: unconfirmed alarming verdicts from before the tiers (pending postings need no script: `verificationAction` re-checks them). `--residential`: every `residential` verdict, to sort out `home_business`. A bare run lists and is free; `--propose` runs Opus and saves verdicts to `logs/` for review without writing; `--apply --from <file>` stores reviewed verdicts and re-scores, rewriting published ratings. About $0.21 per employer; `ANTHROPIC_API_KEY` in the environment. Runs 2026-10-27: 73 pending-side verdicts (47 no longer alarming); 218 published-side employers (179 changed, 346 postings re-scored: 169 lowered, 12 raised, $45.63); `--residential` gave 4 `home_business` verdicts, applied after owner review; `--ids` re-checked 38 verdicts that had hit the old 5-search cap (19 changed, 77 postings re-scored). |
| `npm run backfill-posted-date` | No API calls, and it touches no published judgement (only `Job.postedDate`, which drives the site's date filter), but `--apply` can update **every** Job row. Dry run is the default: a bare run reports counts and writes nothing. |
| `npm run judge-keyless:fetch` | The only genuinely safe one: read-only, writes files under `logs/` and nothing else. |

A judge run that hits an out-of-credit billing error aborts on purpose and leaves postings
`pending` rather than mass-writing `unknown` (`lib/shared/anthropic-errors.ts`). Do not "fix" that
by catching it.

## The two judge paths: the API judge and the keyless judge

Names used throughout this repo: **the API judge** is `npm run judge` (needs `ANTHROPIC_API_KEY`);
**the keyless judge** is `judge-keyless:fetch` -> helper agents -> `judge-keyless:apply` (no
Anthropic key; employer research is done by agents in whatever Claude Code session runs it).

Both paths score the same way: a verifier supplies the employer verdict (`checks.web`), Jev answers
the text questions when **`TYPESAFE_API_KEY`** is set (otherwise the route judgment falls back to the
regex flags and the row stores `judgments = null`), and `lib/scoring/verdict.ts` composes the number.
Both group pending postings by employer with `planByEmployer` / `verificationAction`
(`lib/signals/verification-plan.ts`), so each employer is investigated once, cached verdicts are
reused (except one that breaks the tier rule, which is checked again), and an employer whose postings all apply through its own ATS tenant is presumed legitimate.
Both use the **tiered employer check**: Haiku 5.5 first, and Opus 5.5 instead whenever
`needsEscalation` (`lib/ai/verify-employer-web.ts`) says so: a business or location `mismatch`, a
residential / P.O. box / virtual / `home_business` address, or a mailing address the first model
left `uncertain`.
On 1,000 pending postings that matched an all-Opus run on every band at about an eighth of the
cost (`docs/verifier-model-eval.md`). Every verdict records `web.verifiedBy`.

Which path runs is decided by one predicate: **is `ANTHROPIC_API_KEY` set in `.env`?** "Set" means
non-empty, which is all `lib/env.ts` checks. `.env.example` therefore ships that line commented out,
and leaving it commented is what keeps a keyless machine on the keyless path. A placeholder or stale
key answers the predicate "yes" and then every Anthropic call 401s; a 401 is not a billing error, so
the run does not abort, it writes a failed verdict plus a `scoredAt` timestamp per posting and those
postings stop showing as pending. `.env.example`'s comment on that variable has the detail.

What still differs:

| | API judge | Keyless judge |
|---|---|---|
| Tier escalation | done by code (`verifyEmployerTiered`) | done by the orchestrating session (skill step 3b); `judge-keyless:apply` **rejects** a verdict needing escalation unless `verifiedBy` is `opus-5.5` or `haiku-5.5>opus-5.5` |
| Brand-impersonation check (Opus 5.5, API call) | yes, per posting | **no** (needs the key) |
| Web search limit | per-search billing ($10 / 1,000), none per session | Claude Code's WebSearch: about 200 per session, refilling about 100 an hour |
| Prompt | `lib/ai/verify-employer-web.ts` | the skill's "Agent prompt" |

Use the API judge for bulk and scheduled runs (the `job-fraud-scheduler` service runs it weekly once
the key is on that service). Use the keyless judge without a key, or for a small high-scrutiny set
such as `deep` review requests.

**Keyless step 1 - fetch (read-only, no key).**

```bash
npm run judge-keyless:fetch -- --limit 200 --batch-size 15
```

`--limit N` caps how many pending postings are read (oldest `scrapedAt` first; omit for all).
They are grouped by employer, and `logs/judge-<timestamp>/` gets `batch-001.json`, ... holding one
item per employer that needs a web check (`--batch-size` employers per file, default 15), plus
`cached.json` listing the postings whose employer needs none. It prints `DIR=<dir> BATCHES=<n>`
and writes nothing to the database. A batch item is the employer's representative posting (one
that gives a mailing address when any does):

```json
{
  "workbcId": "49588691",
  "title": "...", "employer": "...", "location": "...", "salary": "...", "postedAt": "...",
  "atsProvider": "workday", "externalApplyOk": null,
  "flags": [{ "flag": "mail_physical_resume", "evidence": "..." }],
  "descriptionExcerpt": "first 1800 chars of the description",
  "employerPostings": ["49588691", "49588702"]
}
```

`employerPostings` is for the apply step, not the helper.

**Keyless step 2 - judge.** One worker owns the whole run: it fans out helper agents on **Haiku**,
one per batch file, several in one message, then sends every verdict that needs escalation to
helpers on **Opus** (skill step 3b) and sets `verifiedBy`. The agent prompt to use verbatim is in
`.claude/skills/judge-postings/SKILL.md` ("Agent prompt"). Helpers never touch the database and
never score. `docs/judge-runbook.md` is the longer form.

**Keyless step 3 - apply (the single DB writer, and the only place a score is computed on this path).**

```bash
npm run judge-keyless:apply -- --dry-run logs/judge-<timestamp>/   # check first, writes nothing
npm run judge-keyless:apply -- logs/judge-<timestamp>/
```

Write each helper's returned array as `verdicts-<n>.json` **inside the batch dir**. A directory
argument reads its `verdicts*.json`, its `batch-*.json` (for `employerPostings`) and its
`cached.json`. For each verdict, apply stores `web` on the employer once and scores exactly that
employer's fetched postings; then it scores the `cached.json` postings from their cached or
presumed verdict, re-deciding each employer against all its current pending postings first (an
employer that now needs a check stays pending). A verdict is logged and skipped, and its postings
stay pending, when it fails zod (`VerdictSchema` in `scripts/judge-keyless-apply.ts`) or breaks the
tier rule (`tierViolation`). The score is **not** taken from the verdict; any `fraudScore`,
`signals` or `reasoning` an agent returns is dropped.

Verdict shape (authoritative schemas: `scripts/judge-keyless-apply.ts` + `lib/shared/json-schemas.ts`):

```json
{
  "workbcId": "49588691",
  "web": {
    "websiteUrl": "https://acme.com",
    "websiteReachable": "yes",
    "businessMatch": "match",
    "locationMatch": "match",
    "hasJobsListing": "yes",
    "applicationAddressType": "business",
    "confidence": 0.85,
    "summary": "<=400 chars",
    "verifiedBy": "haiku-5.5"
  }
}
```

`web` overwrites the employer's cached `checks.web`, so a careless verdict poisons every later posting
by that employer. Enums: `websiteReachable`/`hasJobsListing` `yes|no|unknown`;
`businessMatch`/`locationMatch` `match|mismatch|uncertain`; `applicationAddressType`
`business|residential|home_business|po_box|virtual|none|uncertain`. `WebVerificationSchema` requires
`websiteReachable`, `businessMatch`, `locationMatch`, `hasJobsListing`, `confidence` and `summary`;
`websiteUrl` is required but nullable; `applicationAddressType` defaults to `"none"`; `source` and
`verifiedBy` are optional. A partial `web` object fails zod and the posting stays pending.

**Keyless step 4 - loop.** Re-run `judge-keyless:fetch` until it reports nothing pending.

`.claude/skills/update-postings/SKILL.md` wraps the whole scrape-then-judge loop, including which
path to pick. Use it rather than reinventing the sequence.

## Pipeline order

`scrape` (collect, pending) -> `judge` (evaluate) -> web app (read-only). Within `judge`:
employer web-verify (once per employer, skipped for employers whose postings all apply via their
own matching ATS tenant) -> brand-impersonation pre-check per posting -> per-posting Jev text
judgments -> composed score (`lib/scoring/verdict.ts`).
Postings are `pending` while `scoredAt` is null and the site shows only judged ones. Running the
stages out of order is not possible from the CLI; the sequencing risk is the *helpers*
(`rescore-failed`, `reverify-mail`, `rescan-impersonation`), which assume postings already have
scores and employers already have verdicts. Run `judge` first.

Models are pinned in the source, not in env. Employer verification is **tiered** since 2026-10-26:
Haiku 5.5 checks every employer, and when its verdict would raise a rating (a business or location
`mismatch`, or a residential / P.O. box / virtual mailing address) or it left a posting's mailing
address `uncertain`, Opus 5.5 checks again and its verdict is used instead (`needsEscalation`, `verifyEmployerTiered`; models and prices in `lib/ai/verifier-models.ts`,
the evidence in `docs/verifier-model-eval.md`). Each verdict records `web.verifiedBy`. The keyless
agent path does the same with Haiku and Opus helper agents (`.claude/skills/judge-postings/SKILL.md`,
step 3b). Opus 5.5 also runs the brand-impersonation check (`lib/ai/check-impersonation.ts`, an
API call in the API judge and `rescan-impersonation` only; moved from Opus 4.8 on 2026-10-27 without
a side-by-side comparison), and
TypeSafe's default Jev model for the text judgments (`lib/ai/jev-judgments.ts`). Nothing scores:
`scoringVersion` on the row says which era produced its number (null = a model chose it).

## Deploying: the wrong-service hazard

The Railway project that hosts this site also hosts **several other apps and databases** alongside
the `job-fraud` service. From a directory already linked to the project, verify with:

```bash
railway status                 # which project, environment and service this directory is linked to
railway service list --json    # every service in the linked environment
```

`railway up` deploys to the **linked** service (`railway up --help`: "-s, --service <SERVICE>
Service to deploy to (defaults to linked service)"). The link is stored per absolute directory in
`~/.railway/config.json`, **not** in the repo - there is no `.railway/` here. So the main checkout
is linked to the `job-fraud` service, but a git worktree, a fresh clone, or any other path is not,
and a `railway link` there can attach the project without a service. In that state a bare
`railway up` can push this code onto one of the other apps in the project.

**Always name the service explicitly:**

```bash
railway up --service job-fraud --detach
```

Normal deploys come from GitHub push (the service's source is `yelgabo/job-fraud`, trigger reconnected 2026-10-26). `railway up` is
only the fallback when auto-deploy does not fire. The web service also sits behind Railway's edge
CDN cache (enabled 2026-10-26, resting state `auto`); what it caches, the escalation levers and the
purge command are documented in `docs/TECHNICAL_INFO.md` ("Railway edge CDN"). **Data refreshes never need a deploy** - the site
serves pages cached up to 10 minutes, so refreshed data appears within the revalidation window (or
immediately, when the run could call `POST /api/revalidate` with `REVALIDATE_TOKEN` set).

## `prisma db push --accept-data-loss` runs on every deploy

The `job-fraud` service's start command (a service setting since 2026-10-26; `railway.json` was
removed because Railway stops reading it on 2026-12-01) is:

```
npx prisma db push --accept-data-loss --skip-generate && npx next start -p ${PORT:-3000}
```

There is no `prisma/migrations/` directory. `prisma/schema.prisma` is the only source of truth and
`db push` is the only thing that applies it. Consequences:

- Every deploy force-syncs the production database to whatever `schema.prisma` is on that commit.
- `--accept-data-loss` suppresses the interactive confirmation Prisma would normally require. A
  removed field, a renamed field, a narrowed type or a new required column without a default will
  **drop or destroy production data silently, at deploy time**, with no prompt and no migration to
  review or revert.
- Reviewing a PR that touches `schema.prisma` means asking "what does `db push` do to the live data
  when this merges?" `prisma migrate diff` is read-only and answers it:
  `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`
  prints the SQL that the deploy would apply. Read it before merging.
- Locally, `npm run db:push` fails: the local login (`jobfraud_local`, below) cannot change the
  schema, by design. Schema changes reach production only through a deploy. CI fails a push whose
  schema diff contains a `DROP` unless the message says `[allow-schema-drop]`.
- **Deploying an older commit drops newer columns.** This has happened. On 2026-10-23 the
  incident redeploy used `railway up` from a backport branch whose schema predated
  `Job.judgments` and `Job.scoringVersion`; its `db push` dropped both, erasing the Jev answers
  for every composed row (no backup covered them). The columns were re-added empty on
  2026-10-26. Before any `railway up`, run the `migrate diff` above from that checkout and stop
  if it prints a `DROP`. The web service has no GitHub deploy trigger (none has fired since
  2026-07-30), so it runs whatever was last uploaded: `main` at 048c2c2 since 2026-10-26.

## No DB-backed page may be prerendered at build time

The Railway builder has no private-network route to Postgres and the service's `DATABASE_URL` is
`*.railway.internal`, so a page that queries the database during `next build` fails every future
deploy. That is why `/`, `/companies` and `/analysis` keep `force-dynamic` and cache via
`unstable_cache` (`middleware.ts` makes `/` and `/companies` edge-cacheable and canonicalises their
URLs; `docs/TECHNICAL_INFO.md`, "Railway edge CDN"), and why `/j/[id]`/`/e/[id]` use an **empty** `generateStaticParams` for their
ISR. Check the build-output route markers before merging a page change: any DB-backed route shown
as `○ (Static)` or prerendered `● (SSG)` will break the deploy. Design and cache semantics:
`docs/superpowers/specs/2026-07-29-pagination-and-caching-design.md`.

## Running and verifying

```bash
npm install
cp .env.example .env     # DATABASE_URL required; ANTHROPIC_API_KEY only for the keyed paths
npm run dev              # http://localhost:3000
npm run build            # prisma generate + next build (full type-check)
npm test                 # vitest run
```

`DATABASE_URL` must be Railway's **public** proxy URL; `*.railway.internal` only resolves inside
Railway. `AUDIT_TOKEN` gates the unlinked `/audit/<token>` pages - unset means they 404
(`app/audit/[token]/guard.ts`, `lib/env.ts`).

Tests are colocated `*.test.ts` under `lib/` plus component render tests next to `components/`;
`vitest.config.ts` only maps the `@/` path alias and JSX, everything else is vitest defaults.
They cover parsers, schemas and the Anthropic callers with a mocked SDK - **no test touches the
database or the network**, so `npm test` passing says nothing about whether the pipeline works
against real data. `__fixtures__/` is saved WorkBC HTML used only by the legacy parser tests in
`lib/workbc/scrape-workbc.test.ts`; the live pipeline uses the JSON API and does not parse HTML.

## When a published judgement looks wrong

There is **no public correction process** - no contact route, no appeals page, no takedown path.
The README states plainly that a rating is a screening signal, that it can be wrong, and that
ratings are produced automatically. Do not invent a correction mechanism, and do not imply one
exists.

What does exist is an owner-only queue, reachable through the token-gated admin mirror at
`/audit/<AUDIT_TOKEN>/j/<workbcId>`, which is the app's only write path
(`app/audit/[token]/j/[id]/actions.ts`, token re-checked server-side on every action):

- a `ReviewNote` (append-only comment on a posting), and
- a `JudgeRequest`: `kind="rerun"` clears `scoredAt` immediately so the next judge pass re-scores
  it, or `kind="deep"` queues it for a per-posting agent investigation with the owner's note passed
  through as context. `resolvedAt` is stamped by the run that services it.

Step 0 of `.claude/skills/update-postings/SKILL.md` drains that queue. If you believe a published
judgement is wrong, file it there rather than hand-editing a score in the database.

Note that `docs/CODEMAP.md` predates the `ReviewNote`/`JudgeRequest` models and the admin review
page; `prisma/schema.prisma` and `app/audit/` are authoritative.

## Repository state

`.github/workflows/test.yml` is the only workflow (tsc, vitest, build on push/PR; no DB, no
network). The weekly refresh runs inside Railway as the **`job-fraud-scheduler`** cron service
(Mondays 12:17 UTC, start command `scripts/scheduled-refresh.sh`): both scrape passes, then
`npm run judge -- --limit $JUDGE_LIMIT` when `ANTHROPIC_API_KEY` is set on that service. It reaches
Postgres over the private network, so it publishes new verdicts with no human involved and keeps
working if the public TCP proxy is removed again. Its settings live on the Railway service;
`docs/TECHNICAL_INFO.md` ("Scheduled refresh") lists them and how to trigger or
inspect a run. Postgres was private between 2026-10-22 (credential-rotation incident) and
2026-10-26, when a new public TCP proxy was added for local runs; an old `.env` holding
`zephyr.proxy.rlwy.net` points at nothing. Since 2026-10-27 local `.env` files connect as
**`jobfraud_local`**, a login that can only read and write rows in the app's tables (no DDL, no
superuser, no `TRUNCATE`), with `sslmode=require`; default privileges cover tables a deploy adds.
The `postgres` superuser password lives only in Railway's variables. `log_connections` is on, so
Railway's Postgres logs show every connection and its source address. Rotating the superuser
password is planned in `docs/postgres-credential-rotation-plan.md`, not done.

The `job-fraud` web service deploys from GitHub: every push to `main` deploys once the Tests
workflow passes, except a push that only touches `docs/`, `AGENTS.md`, `CLAUDE.md`, `.claude/` or
`.agents/` (the service's watch paths, set 2026-10-27; the list must start with `**`, since a first rule
of `/**` matched nothing and skipped every deploy). `README.md` still deploys: `/about` reads it. Its build and start settings live on the service, not in the repo (there is no
`railway.json`); read them with `railway api` on `serviceInstance` before changing them.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
