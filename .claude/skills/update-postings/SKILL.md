---
name: update-postings
description: Use when the user asks to update, refresh, or sync the job-fraud data — pull new WorkBC postings and get them judged — including on machines without an ANTHROPIC_API_KEY, or on a schedule.
---

# Update postings (scrape → judge loop)

Full data refresh = incremental scrape, then judge everything pending, until 0 pending. The
deployed site reads the production DB live — **no deploy or push is ever needed for a data
update**. Run from the `job-fraud` project directory; `.env` needs only `DATABASE_URL`
(Railway public proxy URL) for the keyless path.

## Procedure

1. **Scrape (never needs an API key).**
   - Last update <24h ago: `npm run scrape -- --recent day --skip-existing`
   - Within the last week: `npm run scrape -- --recent week --skip-existing`
   - Older/unknown: `npm run scrape -- --skip-existing` (full sweep; `--recent week` would
     miss anything posted before the window)

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
