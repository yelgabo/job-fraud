# job-fraud - agent notes

Public review of WorkBC tech job postings, each rated on whether it looks like a genuine attempt to
hire locally. Next.js + Prisma/Postgres, a scraping CLI, and an LLM judging CLI. Live at
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
scoring rule, a prompt, or a rescore script does not just change code, it changes published claims
about real organisations. The rubric and its prompt live in `lib/ai/scoring.ts`
(`temperature: 0`), the employer verdict prompt in `lib/ai/verify-employer-web.ts`, the
impersonation check in `lib/ai/check-impersonation.ts`, and the score-to-band cut-offs in
`lib/shared/risk-band.ts`. The same rubric is duplicated in prose in `docs/TECHNICAL_INFO.md`,
`docs/judge-runbook.md` and `.claude/skills/judge-postings/SKILL.md`; if you change one, change all
of them or they will disagree. Treat any rubric edit as a change that needs the corpus re-judged,
not a code tweak.

## Do not run these casually

Nearly every script here spends money, hits WorkBC, or writes to the **production** database. There
is no separate staging DB: `.env`'s `DATABASE_URL` points at the live Railway Postgres, and the
deployed site reads that database live, so **a local script run publishes immediately, with no
deploy step**. Read `docs/TECHNICAL_INFO.md` before running any of them, and do not run them
speculatively to "see what happens".

| Command | Why it is not casual |
|---|---|
| `npm run scrape` | Hits WorkBC's JSON APIs and upserts rows. No API key needed, no LLM cost, but it is outbound traffic to a public government service and it writes to prod. `--dry-run` collects without writing. |
| `npm run judge` | Anthropic calls: a `web_search` verification per unverified employer plus a scoring call per posting. `--rejudge` re-verifies and re-scores **everything** and rewrites every published verdict. Always bound it with `--limit` unless a full re-judge is the actual goal. |
| `npm run rescore-failed` | Re-scores every row with `riskBand="unknown"`. **No limit flag** - it processes all of them. |
| `npm run reverify-mail` | Re-web-verifies every employer with a `mail_physical_resume` posting and re-scores all their postings. **No limit and no dry-run flag.** These are exactly the postings most likely to be rated High, so this rewrites the most consequential published claims. |
| `npm run rescan-impersonation` | Corpus-wide sweep; confirmed impersonations are re-attributed to a different company and written HIGH deterministically, bypassing the scoring model. Uses Opus. `--dry-run` lists candidates without web-checking or writing. |
| `npm run compare-judge` | Read-only against the DB, but it still makes live Anthropic web-search + scoring calls for a hard-coded list of companies in `scripts/compare-judge.ts`. |
| `npm run judge:apply` | The single DB writer for the agent path. Overwrites `fraudScore`/`riskBand`/`reasoning`/`signals`/`scoredAt` and the employer's `checks.web`. No LLM cost, but it publishes verdicts. |
| `npm run backfill-categories` | No API calls, but it updates **every** Job row. |
| `npm run judge:fetch` | The only genuinely safe one: read-only, writes files under `logs/` and nothing else. |

A judge run that hits an out-of-credit billing error aborts on purpose and leaves postings
`pending` rather than mass-writing `unknown` (`lib/shared/anthropic-errors.ts`). Do not "fix" that
by catching it.

## The keyless judge path (`judge:fetch` -> agents -> `judge:apply`)

There are two ways to judge, and the choice is decided by one predicate: **is `ANTHROPIC_API_KEY`
set in `.env`?**

- **Key present:** `npm run judge`. One process, dedups by employer (one web search per company,
  not per posting), cheapest at scale. Use for bulk and scheduled runs.
- **No key:** the path below. Judging happens *outside this codebase* - in whatever agent session
  is orchestrating - so no `ANTHROPIC_API_KEY` is needed anywhere. `.env` needs only
  `DATABASE_URL`. Also the right path for a small, high-scrutiny subset even when a key is
  available, because each posting gets its own investigation instead of a shared employer verdict.

Both paths write the same fields. They are interchangeable per posting; you can judge some rows one
way and some the other.

**Step 1 - fetch (read-only, no key).**

```bash
npm run judge:fetch -- --limit 200 --batch-size 15
```

`--limit N` caps how many pending postings are dumped (omit for all pending). `--batch-size B`
postings per file, default `15`. It selects `scoredAt: null` ordered by `scrapedAt` ascending and
writes `logs/judge-<timestamp>/batch-001.json`, `batch-002.json`, ... then prints
`DIR=<dir> BATCHES=<n>`. It writes nothing to the database. Source: `scripts/judge-fetch.ts`.

Each batch file is a JSON array of:

```json
{
  "workbcId": "49588691",
  "title": "...", "employer": "...", "location": "...", "salary": "...", "postedAt": "...",
  "atsProvider": "workday", "externalApplyOk": null,
  "flags": [{ "flag": "mail_physical_resume", "evidence": "..." }],
  "descriptionExcerpt": "first 1800 chars of the description"
}
```

**Step 2 - judge.** Dispatch one agent per batch file, several in one message so they run
concurrently. The agent prompt to use verbatim is in `.claude/skills/judge-postings/SKILL.md`
("Agent prompt"); do not improvise one, it encodes the rubric. Agents never touch the database.
`docs/judge-runbook.md` is the longer-form version of these four steps.

**Step 3 - apply (the single DB writer).**

```bash
npm run judge:apply -- logs/judge-<timestamp>/          # a dir, or
npm run judge:apply -- logs/judge-<timestamp>/verdicts-1.json
```

Write each agent's returned array as `verdicts-<n>.json` **inside the batch dir** - a directory
argument picks up every file in it matching `/verdicts.*\.json$/i` and so ignores the
`batch-*.json` inputs. Several files or dirs can be passed at once. Each verdict is zod-validated
against `VerdictSchema` in `scripts/judge-apply.ts`; an invalid one is logged and skipped, the run
continues, and that posting simply stays pending for the next wave. `riskBand` is **not** taken
from the verdict, it is derived from `fraudScore` by `bandFor()`.

Verdict shape (authoritative schemas: `scripts/judge-apply.ts` + `lib/shared/json-schemas.ts`):

```json
{
  "workbcId": "49588691",
  "fraudScore": 18,
  "reasoning": "2-4 sentences grounded in the evidence.",
  "signals": [{ "label": "...", "weight": -20, "evidence": "..." }],
  "web": {
    "websiteUrl": "https://acme.com",
    "websiteReachable": "yes",
    "businessMatch": "match",
    "locationMatch": "match",
    "hasJobsListing": "yes",
    "applicationAddressType": "business",
    "confidence": 0.85,
    "summary": "<=400 chars"
  }
}
```

`fraudScore` integer 0-100. `signals` required (may be empty), each `{label, weight, evidence}`.
`web` optional; when present it overwrites the employer's cached `checks.web`, so a careless verdict
poisons every other posting by that employer. Enums: `websiteReachable`/`hasJobsListing`
`yes|no|unknown`; `businessMatch`/`locationMatch` `match|mismatch|uncertain`;
`applicationAddressType` `business|residential|po_box|virtual|none|uncertain`.

**Step 4 - loop.** Re-run `judge:fetch` until it reports `0 pending`.

`.claude/skills/update-postings/SKILL.md` wraps the whole scrape-then-judge loop, including which
path to pick. Use it rather than reinventing the sequence.

## Pipeline order

`scrape` (collect, pending) -> `judge` (evaluate) -> web app (read-only). Within `judge`:
employer web-verify (once per employer, skipped for employers whose postings all apply via their
own matching ATS tenant) -> brand-impersonation pre-check per posting -> per-posting scoring.
Postings are `pending` while `scoredAt` is null and the site shows only judged ones. Running the
stages out of order is not possible from the CLI; the sequencing risk is the *helpers*
(`rescore-failed`, `reverify-mail`, `rescan-impersonation`), which assume postings already have
scores and employers already have verdicts. Run `judge` first.

Models are pinned in the source, not in env: `claude-haiku-4-5-20251001` for verification and
scoring, `claude-opus-4-8` for the impersonation check. Grep `const MODEL` in `lib/ai/`.

## Deploying: the wrong-service hazard

Railway project `compassionate-charisma` (`270b9771-1a6c-48ea-9f22-d1f6a84fa31f`) hosts **ten
services in the `production` environment**: six apps - `job-fraud`, `cocodessert`, `anki-srs`,
`claude-sync`, `nuggies`, `kimbo` - plus three Postgres instances (`Postgres`, `Postgres-t4uu`,
`Postgres-W9v4`) and a `Redis`. Verify with:

```bash
railway service list -p 270b9771-1a6c-48ea-9f22-d1f6a84fa31f -e production --json
```

`railway up` deploys to the **linked** service (`railway up --help`: "-s, --service <SERVICE>
Service to deploy to (defaults to linked service)"). The link is stored per absolute directory in
`~/.railway/config.json`, **not** in the repo - there is no `.railway/` here. So the main checkout
is linked to the `job-fraud` service, but a git worktree, a fresh clone, or any other path is not,
and a `railway link` there can attach the project without a service. In that state a bare
`railway up` can push this code onto `cocodessert` or `kimbo`.

**Always name the service explicitly:**

```bash
railway up --service job-fraud --detach
```

Normal deploys come from GitHub push (the service's source is `yelgabo/job-fraud`). `railway up` is
only the fallback when auto-deploy does not fire. **Data refreshes never need a deploy** - the site
reads the production database live.

## `prisma db push --accept-data-loss` runs on every deploy

`railway.json` `deploy.startCommand` is:

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
- Locally, `npm run db:push` (`prisma db push`, **without** `--accept-data-loss`) will stop and ask
  before anything destructive. Do not add the flag to the local script to get past a prompt; the
  prompt is the warning.

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

Tests are colocated `*.test.ts` under `lib/`; there is no vitest config file, so defaults apply.
They cover parsers, schemas and the Anthropic callers with a mocked SDK - **no test touches the
database or the network**, so `npm test` passing says nothing about whether the pipeline works
against real data. `__fixtures__/` is saved WorkBC HTML used only by the legacy parser tests in
`lib/workbc/scrape-workbc.test.ts`; the live pipeline uses the JSON API and does not parse HTML.
`.env.example` still lists `NOMINATIM_USER_AGENT`, left over from the removed geocoding code.

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

Last commit 2026-07-03; the project has been idle since. There is no CI configuration in the repo
(no `.github/`), so nothing runs automatically on push except the Railway deploy.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
