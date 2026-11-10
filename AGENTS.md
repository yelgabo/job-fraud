# job-fraud - agent notes

Public review of WorkBC job postings (tech terms plus a city-wide Victoria pass), each rated on
whether it looks like a genuine attempt to hire locally. Next.js + Prisma/Postgres, a scraping
CLI, and an LLM judging CLI. Live at https://job-fraud-production.up.railway.app

Read `README.md` (why the postings are reviewed), then `docs/ARCHITECTURE.md`,
`docs/TECHNICAL_INFO.md` (setup, commands, scoring rubric) and `docs/CODEMAP.md`
(file-by-file). This file covers only what those do not warn you about.

## Two things that raise the stakes

**This repository is public.** Commits, PR bodies, issue text and branch names are visible to
anyone. Write them accordingly.

**It publishes judgements about named real employers.** Every posting on the live site carries
a Low/Medium/High band, the employer's name, and reasoning naming that employer. A change to a
scoring rule, a question or a rescore script changes published claims about real
organisations.

- Current verdicts are composed from the weight table (`lib/scoring/weights.ts`, composer
  `lib/scoring/compose.ts`, prose `lib/scoring/explain.ts`, band cut-offs
  `lib/shared/risk-band.ts`). No model picks the number. Legacy rows with
  `scoringVersion = null` (`verdictKind = MODEL`) were model-scored.
- `docs/scoring-algorithm.md` and `docs/TECHNICAL_INFO.md` both describe the table. Change both
  when the table changes, or they disagree.
- A weight change is `npm run recompose` over the composed rows, with no inference. A question
  change (`lib/ai/jev-judgments.ts`) needs those rows re-judged.
- A weight-table row with no `lib/shared/signal-labels.ts` entry fails a test.
- The README's plain-language sections render live on `/about` (`app/about/page.tsx`,
  `lib/shared/methodology.ts`), so a README edit changes published site copy and triggers a
  deploy. `lib/shared/methodology.test.ts` pins the caveat wording.

## Scripts write to production

There is no staging database. `.env`'s `DATABASE_URL` points at the live Railway Postgres and
the deployed site reads it, so a local script run publishes with no deploy step. Public pages
revalidate every 10 minutes, or immediately when `REVALIDATE_TOKEN` is set, because
scrape, judge and apply then call `POST /api/revalidate`. Data refreshes therefore never need
a deploy.

Read the full table in [docs/command-hazards.md](docs/command-hazards.md) before running any
script, and do not run one to see what happens. The short version:

- Safe: `npm run judge-keyless:fetch` (read-only, writes under `logs/`), `npm run eval:labels`
  (fixture only), `npm test`, `npm run build`.
- Writes to production, no model cost: `scrape` (also outbound traffic to WorkBC; `--dry-run`
  collects without writing), `backfill-categories` (every Job row), `backfill-posted-date` and
  `backfill-status` (dry run by default).
- Rewrites published verdicts: `judge` (`--rejudge` redoes everything, so bound it with
  `--limit`), `judge-keyless:apply` (`--dry-run` first), `recompose --apply`,
  `backfill-ats --include-judged`, `recheck-cached-verdicts --apply`, `rescan-impersonation`
  (writes confirmed impersonations as High).
- Rewrites published verdicts with no limit flag: `rescore-failed`, and `reverify-mail`, which
  also has no dry run and covers the postings most likely to be rated High.
- Read-only on the database but costs money per item: `compare-verifiers` (bound it with
  `--employers`), `compare-jev`, `measure-questions`, `eval:snapshot --ask-jev`.
- `eval:snapshot` rewrites the fixture under `lib/eval/__fixtures__/`, so re-measure
  `lib/eval/baseline.ts` in the same commit.

The helpers `rescore-failed`, `reverify-mail` and `rescan-impersonation` assume postings
already have scores and employers already have verdicts. Run `judge` first.

A judge run that hits an out-of-credit billing error aborts on purpose and leaves postings
pending (`lib/shared/anthropic-errors.ts`). Do not catch that error, because the alternative is
mass-writing `unknown` ratings.

## The two judge paths

The API judge is `npm run judge` and needs `ANTHROPIC_API_KEY`. The keyless judge is
`judge-keyless:fetch`, then helper agents, then `judge-keyless:apply`; agents in the Claude
Code session do the employer research.

- Both score the same way. A verifier supplies the employer verdict (`checks.web`), Jev answers
  the text questions when `TYPESAFE_API_KEY` is set, and `lib/scoring/verdict.ts` composes the
  number. Both investigate each employer once (`lib/signals/verification-plan.ts`).
- Employer checks are tiered: a cheap model first, and a stronger one when `needsEscalation`
  (`lib/ai/verify-employer-web.ts`) fires. Models, prices and `verifiedBy` labels are pinned in
  `lib/ai/verifier-models.ts`, not in env. Evidence and model history:
  `docs/verifier-model-eval.md`.
- The path is chosen by one predicate: whether `ANTHROPIC_API_KEY` is non-empty in `.env`
  (`lib/env.ts`). Leave the line commented out on a keyless machine. A placeholder or stale key
  selects the API judge and then every call returns 401, which is not a billing error, so the
  run continues with every employer check failing and those postings held pending.
- Keyless judging: use the `judge-postings` skill (`.claude/skills/judge-postings/SKILL.md`),
  which holds the steps, the verdict shape and the agent prompt. The `update-postings` skill
  wraps scrape plus judge and picks the path. `judge-keyless:apply` is the only database writer
  on that path and computes the score itself; any score an agent returns is dropped.
- A helper's `web` verdict overwrites the employer's cached verdict for all its later postings.
  Do not write partial or guessed verdicts; a partial `web` object fails validation and the
  posting stays pending.
- Use the API judge for bulk and scheduled runs. Use the keyless judge without a key, or for a
  small high-scrutiny set such as `deep` review requests.

Differences between the paths and the step-by-step detail:
[docs/judge-runbook.md](docs/judge-runbook.md).

## Writers of verdict columns

Pipeline order is `scrape` (collect, pending), then `judge`, then the read-only web app.
Column semantics (`status`, `scoredAt`, `judgedAt`, `verdictKind`) and the refetch rule are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), "Verdict and status columns".

- Only `lib/scoring/write-verdict.ts` writes the verdict columns. A new scorer calls it and
  does not use `prisma.job.update`, because it refuses to let a composed verdict replace an
  impersonation or to recompute a pending row.
- Employer verdicts go through `storeEmployerWeb` in `lib/shared/employer-verdict.ts`, which
  will not overwrite a verdict another run stored after the writer read the employer.
- `Job.status` decides whether the site shows a posting, and every reader filters on it. A new
  query needs the same filter.

## Deploying

Every push to `main` deploys the `job-fraud` web service once the Tests workflow passes. A push
that touches only `docs/`, `AGENTS.md`, `CLAUDE.md`, `.claude/` or `.agents/` is outside the
watch paths and does not deploy. `README.md` does deploy, because `/about` reads it. Build and
start settings live on the Railway service, not in the repo; read them with `railway api` on
`serviceInstance` before changing them.

`railway up` is the fallback when auto-deploy does not fire. The Railway project hosts other
apps and databases, and the link lives per directory in `~/.railway/config.json`, so a
worktree or fresh clone is not linked to the service and a bare `railway up` there can push
this code onto another app. Always name the service:

```bash
railway up --service job-fraud --detach
```

**`prisma db push --accept-data-loss` runs at every start.** There is no `prisma/migrations/`
directory; `prisma/schema.prisma` is the only source of truth. Every deploy force-syncs the
production database to the schema on that commit with no prompt, so a removed or renamed
field, a narrowed type or a new required column without a default destroys production data at
deploy time.

- Before merging a schema change, read what the deploy would apply:
  `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`
- Deploying an older commit drops newer columns. Before any `railway up`, run that
  `migrate diff` from the checkout being deployed and stop if it prints a `DROP`. This erased
  stored Jev answers on 2026-10-23.
- CI fails a push whose schema diff contains a `DROP` unless the message says
  `[allow-schema-drop]`.
- `npm run db:push` fails locally by design: the local login `jobfraud_local` can read and
  write rows and cannot change the schema.

**No database-backed page may be prerendered at build time.** The Railway builder has no route
to Postgres, so a page that queries during `next build` fails every later deploy. `/`,
`/companies` and `/analysis` keep `force-dynamic`, and `/j/[id]` and `/e/[id]` use an empty
`generateStaticParams`. Before merging a page change, check the build output: a
database-backed route marked `○ (Static)` or `● (SSG)` breaks the deploy. Design:
`docs/superpowers/specs/2026-07-29-pagination-and-caching-design.md`. Edge CDN behaviour and
the purge command: `docs/TECHNICAL_INFO.md`, "Railway edge CDN".

## Scheduled refresh

The `job-fraud-scheduler` cron service runs both scrape passes and then `npm run judge` weekly
(`scripts/scheduled-refresh.sh`), so it publishes new verdicts with no human involved. Each
run writes a `JudgeRun` and a `ScrapeRun` row whose outcome is the record of what happened.
Settings and how to trigger or inspect a run: `docs/TECHNICAL_INFO.md`, "Scheduled refresh".
Dated history: `docs/TECHNICAL_INFO.md`, "Repository state and deploy history".

## Running and verifying

```bash
npm install
cp .env.example .env     # DATABASE_URL required; ANTHROPIC_API_KEY only for the API judge
npm run dev              # http://localhost:3000
npm run build            # prisma generate + next build (full type-check)
npm test                 # vitest run
```

- `DATABASE_URL` must be Railway's public proxy URL; `*.railway.internal` resolves only inside
  Railway.
- `AUDIT_TOKEN` gates the `/audit/<token>` pages. Unset, they return 404.
- No test touches the database or the network, so a passing `npm test` says nothing about
  whether the pipeline works against real data. `.github/workflows/test.yml` is the only
  workflow.

## When a published judgement looks wrong

There is no public correction process: no contact route, no appeals page, no takedown path. Do
not invent one or imply one exists.

The owner-only queue is the token-gated admin mirror at `/audit/<AUDIT_TOKEN>/j/<workbcId>`,
the app's only write path (`app/audit/[token]/j/[id]/actions.ts`). It takes a `ReviewNote`
(append-only comment) or a `JudgeRequest`: `kind="rerun"` sends the posting back for the next
judge pass, and `kind="deep"` queues a per-posting agent investigation. Step 0 of the
`update-postings` skill drains that queue. File a suspected wrong judgement there and do not
hand-edit a score in the database.

`docs/CODEMAP.md` predates `ReviewNote`, `JudgeRequest` and the admin review page;
`prisma/schema.prisma` and `app/audit/` are authoritative.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project. Point
to the authoritative file or command instead of repeating what the codebase shows. Rewrite or
prune existing entries in preference to appending, and put dated history in `docs/`.
