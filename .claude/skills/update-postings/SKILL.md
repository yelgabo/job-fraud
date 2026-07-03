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
update**. Run from the `job-fraud` project directory; `.env` needs only `DATABASE_URL`
(Railway public proxy URL) for the keyless path.

## Procedure

0. **Drain the review queue** (owner flags from the /audit admin pages, `JudgeRequest` table).
   - `kind: "rerun"` rows need no action here — flagging already cleared the job's `scoredAt`,
     so step 3's normal judging covers them. Stamp `resolvedAt` after the posting is re-scored.
   - `kind: "deep"` rows: for each, dispatch ONE fraud-analyst agent (judge-postings prompt)
     with just that posting, appending the request's `note` as "Owner context: <note>" so the
     agent investigates the owner's concern. Apply via `judge:apply`, then stamp `resolvedAt`.
   - Query/stamp with `npx tsx --env-file=.env -e` one-liners on `prisma.judgeRequest`.

1. **Scrape (never needs an API key).**
   - Last update <24h ago: `npm run scrape -- --recent day --skip-existing`
   - Within the last week: `npm run scrape -- --recent week --skip-existing`
   - Older/unknown: `npm run scrape -- --limit 5000 --skip-existing` (pages through ALL
     results for the search terms; `--recent week` would miss anything posted before the
     window). The explicit `--limit` matters: without `--recent`/`--location` the stub cap
     defaults to 50, which only skims the newest page.

   `--skip-existing` detail-fetches only workbcIds not already in the DB; new rows land with
   `scoredAt` null (= pending).

2. **Pick the judge path by one predicate — is `ANTHROPIC_API_KEY` set in `.env`?**
   - **Key present:** `npm run judge` (fast path: dedups by employer, single process).
   - **No key (keyless agent flow):** use the **judge-postings** skill's agent-orchestrated
     path — `npm run judge:fetch -- --batch-size 15` writes `logs/judge-<ts>/batch-*.json`;
     dispatch one general-purpose agent per batch (all in one message, waves of 5-8) with the
     agent prompt from that skill; write each agent's array as `verdicts-<n>.json` in the same
     dir; apply with `npm run judge:apply -- logs/judge-<ts>/` (the dir expands to its
     `verdicts*.json`). Agents never write the DB; `judge:apply` is the single writer.

3. **Loop.** Re-run `judge:fetch` until it reports 0 pending (invalid verdicts are skipped by
   apply and stay pending — re-dispatch just those).

4. **Verify.** `judge:fetch` printing `0 pending` is done. Spot-check the live site if asked.
