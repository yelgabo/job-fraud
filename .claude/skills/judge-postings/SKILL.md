---
name: judge-postings
description: Evaluate pending (unjudged) job-fraud postings by dispatching parallel fraud-detection agents and applying their verdicts as the single DB writer. Use when there are pending postings in the job-fraud DB to score, or on a schedule after scraping. Decoupled from scraping — scrape collects, this judges.
---

# Judge postings

Scraping only collects raw postings (`scoredAt` null = pending). Judging evaluates them.

## Fast path (recommended): deduped Node judge

`npm run judge -- [--limit N] [--rejudge] [--emp-concurrency 4] [--score-concurrency 8]`

`scripts/judge.ts` is a single-process (single DB writer, no races) evaluator that **dedups by
employer**: Stage 1 web-verifies each DISTINCT pending employer once (`verifyEmployerWeb`) →
`employer.checks.web`; Stage 2 asks Jev the text questions (`TYPESAFE_API_KEY`) and composes the
score in code (`lib/scoring/verdict.ts`) from that verdict + the posting's own flags/NOC. Far cheaper/faster at scale than per-job
agents (e.g. ~1,046 employer web-searches for 2,425 jobs instead of 2,425). Use this for bulk and
for scheduled runs. The agent-orchestrated flow below is an optional "deep per-posting" alternative.

## Deep path (optional): Model B — agent-orchestrated

This judges via dispatched fraud-detection agents (richer per-posting investigation, no employer
dedup — more expensive). Use for a small, high-scrutiny subset.
One worker owns the whole judging run: it fetches the pending postings, fans out its own helper
agents (each web-investigates its batch), collects their verdicts, and applies them itself as the
**single DB writer** (helpers never write the DB → no races/deadlocks). Do not hand the batches off
to separate top-level sessions; the single owning worker is what makes the run survive a restart
and stay visible while it is in flight. Safe to run repeatedly or on a schedule.

Run from the `job-fraud` project directory.

## Procedure

1. **Fetch pending.** Run `npm run judge:fetch -- --limit N [--batch-size B]` (omit `--limit` for
   all pending). Batching is automatic: it creates `logs/judge-<ts>/` holding `batch-001.json`,
   `batch-002.json`, ... at `--batch-size` postings each (default `15`), and prints
   `DIR=<dir> BATCHES=<n>`. It is read-only. If `BATCHES=0`, stop, there is nothing to judge.

2. **Read** the `batch-NNN.json` files in that directory. Each is already a batch array; do not
   re-split them.

3. **Fan out helpers (parallel).** The worker that ran the fetch dispatches one helper agent per
   batch file, all in a single message so they run concurrently; a "few at a time" wave is fine for
   large sets, e.g. 5-8 helpers per wave. The parallelism is the same as before, only the ownership
   differs: the owning worker spawns the helpers and stays with the run instead of handing batches
   to separate top-level sessions.
   Give each helper the **Agent prompt** below followed by its batch as JSON. Each helper returns a
   JSON array of verdicts. Do NOT let helpers write to the database.

4. **Assemble.** The owning worker `Write`s each helper's returned verdict array as
   `verdicts-<n>.json` **inside the same `logs/judge-<ts>/` directory**. Merging everything into
   one file is optional, the apply step takes a directory.

5. **Apply (single writer).** Run `npm run judge:apply -- logs/judge-<ts>/`. The argument may be a
   verdicts file or a directory, and several may be passed at once; a directory contributes every
   file matching `/verdicts.*\.json$/i`, so the `batch-*.json` inputs are ignored. It zod-validates
   each verdict, stores `web` on the employer, asks Jev the text questions, and composes the score
   (`fraudScore`, `riskBand`, `reasoning`, `signals`, `judgments`, `scoringVersion`, `scoredAt`) the
   same way `npm run judge` does. Invalid verdicts are skipped, not fatal, and those postings stay pending.
   Apply each completed wave serially using its explicit verdict file paths, or apply the
   directory once after all its waves finish, to avoid reapplying earlier waves.

6. For large corpora (e.g. 500), repeat steps 1-5 in waves until `judge:fetch` reports 0 pending.

## Scoring policy

No agent and no model chooses a score. The number is composed by
[lib/scoring/compose.ts](../../../lib/scoring/compose.ts) from the weight table in
[lib/scoring/weights.ts](../../../lib/scoring/weights.ts); the residential, PO-box and
virtual mailing-address signal is +40 with a floor at 70 there. An agent's output is
the employer verdict below, which is the evidence the composer consumes. Any
`fraudScore`, `signals` or `reasoning` in a verdict is dropped by `judge:apply`. Do not
tune weights or rescore existing data unless the current task requests it.

## Verdict shape (one object per posting; agents return a JSON array of these)

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
    "summary": "<=400 chars"
  }
}
```

Enums — `websiteReachable`/`hasJobsListing`: `yes|no|unknown`; `businessMatch`/`locationMatch`:
`match|mismatch|uncertain`; `applicationAddressType`: `business|residential|po_box|virtual|none|uncertain`.
`web` is optional but expected when an employer name exists; omit it only when nothing
could be established, since a present `web` overwrites the employer's cached verdict for
every posting by that employer.

## Agent prompt (paste, then append the batch JSON)

You are a fraud analyst auditing WorkBC job postings. For EACH posting in the JSON below, use web
search to investigate the employer and record what you established. You do not score: the score
is computed later from your findings. Return ONLY a JSON array of verdicts (one per posting, exact
shape above) — no prose outside the JSON.

For each posting:
1. Web-search the employer's official website → `websiteUrl`/`websiteReachable`; note their real
   office address.
2. `businessMatch`: is this a REAL company that could plausibly employ this role? Any industry
   counts (a ridesharing/retail/healthcare firm hiring a dev = "match"). Use "mismatch" ONLY for
   fake/shell/parked/impersonating/unverifiable entities — NOT for "industry ≠ job function".
3. `locationMatch`: does the company's stated location agree with the posting's?
4. `hasJobsListing`: does their site have a careers/jobs section? (bonus only — do NOT hunt for
   this exact posting)
5. `applicationAddressType`: if the posting (see `flags` evidence / description) tells applicants
   to MAIL materials somewhere, web-search that address and classify: business (real office),
   residential (home/apartment/unit), po_box, virtual (mail-forwarding), none, uncertain.

Report what you could establish and nothing more: `uncertain` / `unknown` are correct answers
when the search did not settle it, and they are treated as neutral. `summary` is shown on the
site as evidence, so keep it factual and under 400 characters.

Be skeptical but fair: `businessMatch` "mismatch" is for fake, shell, parked or impersonating
entities, not for a company whose industry differs from the role.

## Scheduling

This skill is worker-driven: one worker owns a run end to end (fetch, helper fan-out, assemble,
apply), so a scheduled run should hand the whole skill to a single worker rather than splitting the
batches across sessions. Pair with a periodic `scrape` so new postings accumulate as pending, then
this skill judges them.
