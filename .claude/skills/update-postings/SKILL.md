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
deployed site reads the production DB live — **no deploy or push is ever needed for a data
update**. Run from the `job-fraud` project directory.

## Credentials

`.env` is gitignored, so a fresh clone or a new worktree does not have one. Create it
(`cp .env.example .env`) and set `DATABASE_URL`. For the keyless path that is the only
variable needed.

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
   npm run scrape -- --limit 5000 --skip-existing                          # term pass
   npm run scrape -- --location "Victoria" --limit 5000 --skip-existing    # city pass
   ```

   The two passes collect different postings, so both are needed. `scripts/scrape.ts:60`
   applies the default search term `"software engineer"` **only when no `--location` is
   given**; passing a location empties the term instead, so the city pass pulls every posting
   in those cities regardless of title. Measured on 2026-07-28: the term pass added **42** new
   postings, the city pass added **411**. Running only the term pass loses roughly ninety
   percent of a refresh.

   `--location` takes a comma-separated list (`"Victoria,Saanich"`) if the sweep should cover
   more cities.

   The explicit `--limit` matters: without `--recent` or `--location` the stub cap defaults to
   50, which only skims the newest page.

   Cheaper incremental variants, when the last full refresh is recent and the goal is just to
   top up (run each as both passes too):
   - Last update <24h ago: add `--recent day`
   - Within the last week: add `--recent week`

   `--recent` asks WorkBC server-side for recently-posted jobs only, so it misses anything
   posted before the window; a catch-up or an unknown-age gap needs the plain `--limit 5000`
   form above.

   `--skip-existing` detail-fetches only workbcIds not already in the DB; new rows land with
   `scoredAt` null (= pending).

2. **Pick the judge path by one predicate — is `ANTHROPIC_API_KEY` set in `.env`?**
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
