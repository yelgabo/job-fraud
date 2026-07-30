---
name: update-postings
description: Use when the user asks to update, refresh, or sync the job-fraud data — pull new WorkBC postings and get them judged — including on machines without an ANTHROPIC_API_KEY, or on a schedule.
---

# Update postings (scrape → judge loop)

Full data refresh = incremental scrape, then judge everything pending, until 0 pending.
**Judging follows scraping automatically — one user request covers the whole loop.** Do not
stop to ask whether to judge, which judge path to use, or whether the pending count is "too
big": pick the path by the key predicate in step 2 and run waves until drained. Scale is not
a stop condition — a larger pending count just means more waves, and applying verdicts after
every wave means progress is never lost if the session is interrupted. Report cost/count
when done, not as a question before starting. The
deployed site reads the production DB: **no deploy or push is ever needed for a data
update**. Public pages are cached with 600 s revalidation; when `REVALIDATE_TOKEN` is set in
`.env`, the scrape/judge/apply CLIs refresh that cache immediately at the end of a successful
run (POST `/api/revalidate`), otherwise visitors see new results within about 10 minutes.
Run from the `job-fraud` project directory.

## Credentials

`.env` is gitignored, so a fresh clone or a new worktree does not have one. Create it
(`cp .env.example .env`) and set `DATABASE_URL`. For the keyless path that is the only
variable needed: `.env.example` ships `ANTHROPIC_API_KEY` commented out, so **leave it
commented, and do not paste a placeholder or a stale key in to fill the line**. Any non-empty
value routes the run down the keyed path. AGENTS.md ("The keyless judge path") owns the
predicate and what a bad key does to the pending queue.

Get the value from Railway:

```bash
railway variables --service Postgres-t4uu --json
```

Use **`DATABASE_PUBLIC_URL`**, not `DATABASE_URL`. The Railway-internal `DATABASE_URL` host
only resolves inside Railway; copying it to a laptop produces a DNS/connection failure that
looks like the database is down.

## Cadence

Scraping is incremental and only ever sees what WorkBC has listed at the moment it runs. A
posting that appears and expires between two runs is never collected and is invisible
forever. The interval between runs therefore does not just control freshness, it decides how
much of the corpus is never seen at all. Choose it with that in mind.

## Procedure

0. **Drain the review queue** (owner flags from the /audit admin pages, `JudgeRequest` table).
   - `kind: "rerun"` rows need no action here — flagging already cleared the job's `scoredAt`,
     so step 3's normal judging covers them. Stamp `resolvedAt` after the posting is re-scored.
   - `kind: "deep"` rows: for each, dispatch ONE fraud-analyst agent (judge-postings prompt)
     with just that posting, appending the request's `note` as "Owner context: <note>" so the
     agent investigates the owner's concern. Apply via `judge:apply`, then stamp `resolvedAt`.
   - Query/stamp with `npx tsx --env-file=.env -e` one-liners on `prisma.judgeRequest`.

1. **Scrape (never needs an API key). A full refresh is TWO passes, not one.**

   ```bash
   npm run scrape -- --search-terms "software engineer,software" --recent week --skip-existing  # term pass
   npm run scrape -- --location "Victoria" --search-terms "" --limit 5000 --skip-existing       # city pass
   ```

   The two passes collect different postings (the city pass is by far the larger), so both
   are needed. Run the commands exactly as written: every flag above is load-bearing,
   including the explicit `--search-terms` on both passes (the pinned keywords on the term
   pass, the empty `--search-terms ""` on the city pass) and the explicit `--limit`.
   `docs/TECHNICAL_INFO.md` ("Commands") owns the scrape contract - what each pass covers,
   flag semantics, cap defaults, both term-pass variants, and the `WORKBC_SEARCH_TERMS`
   precedence trap that makes the explicit `--search-terms` mandatory on both passes.

   The term pass above is the routine weekly incremental variant, and it is the one this
   update flow uses. `--recent week` only sees postings from its one-week window, so after a
   gap longer than a week, or a gap of unknown age, run the full-depth catch-up variant
   instead:

   ```bash
   npm run scrape -- --search-terms "software engineer,software" --limit 5000 --skip-existing  # term pass, catch-up
   ```

   When the last update was under 24h ago, `--recent day` is a cheaper top-up on either pass
   (city pass still with `--search-terms ""`).

2. **Pick the judge path by one predicate: is `ANTHROPIC_API_KEY` set in `.env`?** AGENTS.md
   ("The keyless judge path") owns that predicate; a freshly copied `.env` answers "no" (see
   Credentials).
   - **Key present:** `npm run judge` (fast path: dedups by employer, single process).
   - **No key (keyless agent flow):** use the **judge-postings** skill's agent-orchestrated
     path. `npm run judge:fetch -- --batch-size 15` writes `logs/judge-<ts>/batch-*.json`.
     **One session owns the whole run:** it fans out parallel helpers, one per batch file,
     several in a single message so they run concurrently (waves of 5-8 helpers for large
     sets), collects their verdicts, and is the **single DB writer**. Do not hand batches off
     to separate top-level sessions. Give each helper the agent prompt from that skill; write
     each helper's returned array as `verdicts-<n>.json` in the same dir; apply with
     `npm run judge:apply -- logs/judge-<ts>/` (the dir expands to its `verdicts*.json`).
     Helpers never write the DB; `judge:apply` is the single writer.

3. **Loop.** Re-run `judge:fetch` until it reports 0 pending (invalid verdicts are skipped by
   apply and stay pending — re-dispatch just those).

4. **Verify.** `judge:fetch` printing `0 pending` is done. Spot-check the live site if asked.
