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
`employer.checks.web`; Stage 2 scores each pending job (`scoreJob`, no web search) reusing that
verdict + the posting's own flags/NOC/apply fields. Far cheaper/faster at scale than per-job
agents (e.g. ~1,046 employer web-searches for 2,425 jobs instead of 2,425). Use this for bulk and
for scheduled runs. The agent-orchestrated flow below is an optional "deep per-posting" alternative.

## Deep path (optional): Model B — agent-orchestrated

This judges via dispatched fraud-detection agents (richer per-posting investigation, no employer
dedup — more expensive). Use for a small, high-scrutiny subset.
the orchestrating session fetches pending postings, dispatches parallel fraud-detection agents
(each web-investigates its batch), then applies their verdicts as the **single DB writer**
(agents never write the DB → no races/deadlocks). Safe to run repeatedly or on a schedule.

Run from the `job-fraud` project directory.

## Procedure

1. **Fetch pending.** Run `npm run judge:fetch -- --limit N --batch-size 15` (omit `--limit` for
   all pending). It does the batching itself: it writes `logs/judge-<ts>/batch-001.json`,
   `batch-002.json`, … and prints `DIR=<dir> BATCHES=<n>`. If it reports 0 pending, stop — nothing
   to judge.

2. **Dispatch one `general-purpose` agent per batch file, all in a single message** (so they run
   concurrently — a "few at a time" wave is fine for large sets; e.g. 5-8 agents per wave).
   Give each agent the **Agent prompt** below followed by its batch file's JSON. Each agent returns
   a JSON array of verdicts. Do NOT let agents write to the database.

3. **Write each agent's verdict array** to `verdicts-<n>.json` **inside the batch dir**. A
   directory argument picks up every `verdicts*.json` in it and ignores the `batch-*.json` inputs,
   so there is nothing to merge.

4. **Apply (single writer).** Run `npm run judge:apply -- logs/judge-<ts>/`. It zod-validates each
   verdict and updates the job (`fraudScore`, `riskBand`, `reasoning`, `signals`, `scoredAt`) and
   the employer's `checks.web`; invalid verdicts are skipped, not fatal. `riskBand` is derived from
   `fraudScore`, never taken from the verdict.

5. For large corpora (e.g. 500), repeat steps 1-4 in waves until `judge:fetch` reports 0 pending.

## Verdict shape (one object per posting; agents return a JSON array of these)

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

Enums — `websiteReachable`/`hasJobsListing`: `yes|no|unknown`; `businessMatch`/`locationMatch`:
`match|mismatch|uncertain`; `applicationAddressType`: `business|residential|po_box|virtual|none|uncertain`.
`fraudScore` 0-100; `signals[].weight` -30..+30. `web` is optional but expected when an employer name
exists — and it is all-or-nothing: a partial `web` object fails validation and the **whole verdict is
skipped**, leaving that posting pending. Field-by-field requirements: `AGENTS.md`, "The keyless judge
path".

## Agent prompt (paste, then append the batch JSON)

You are a fraud analyst auditing WorkBC job postings. For EACH posting in the JSON below, use web
search to investigate the employer, then score fraud risk. Return ONLY a JSON array of verdicts
(one per posting, exact shape above) — no prose outside the JSON.

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

Scoring (fraudScore 0-100: low <30, medium 30-69, high ≥70; signals weighted -30..+30):
- `applicationAddressType` residential/po_box/virtual → VERY STRONG fraud (+35..45); alone it
  should push toward HIGH, and with a mail-resume instruction it should land HIGH.
- generic free-email domain (gmail/outlook/yahoo/etc.) → +15..25. A company-domain email
  (jobs@theircompany.com) is NORMAL — never "generic".
- mail_physical_resume + software role → +20.
- businessMatch mismatch → +20..30; match → −10..20. locationMatch mismatch → +10..15.
- crypto_payment / banking_info_upfront → +20..30.
- Detailed responsibilities, real benefits, recognizable employer, known ATS → legitimacy.
- A check you cannot determine is NEUTRAL (uncertain/unknown) — never penalize missing info.

Be skeptical but fair: a real, verifiable company with a normal application method is low risk;
postings from unverifiable individuals using free email + mail-to-a-home are high risk.

## Scheduling

This skill is session-driven (it dispatches agents), so a scheduled run should invoke an agent
session that runs this skill end-to-end. Pair with a periodic `scrape` so new postings accumulate
as pending, then this skill judges them.
