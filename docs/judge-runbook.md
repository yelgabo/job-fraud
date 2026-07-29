# Judge runbook (Model B — agent-orchestrated)

Evaluation is decoupled from scraping. `scrape` only collects raw postings (score fields null =
pending). **Judging** is owned by a single worker that fans out parallel fraud-detection helpers
and is the **single DB writer** (helpers never touch the DB → no races).

## Steps

1. **Fetch pending** → `npm run judge:fetch -- --limit N [--batch-size B]`. The script does the
   batching itself: it writes a timestamped directory `logs/judge-<ts>/` containing
   `batch-001.json`, `batch-002.json`, ... at `--batch-size` postings each (default `15`), then
   prints `DIR=<dir> BATCHES=<n>`. `--limit N` caps how many pending postings are dumped; omit it
   for all pending. Each batch file is an array of `{workbcId, title, employer, location, salary,
   postedAt, atsProvider, externalApplyOk, flags[], descriptionExcerpt}`. Nothing is written to the
   database. If `BATCHES=0`, stop, there is nothing to judge.
2. **Fan out helpers (parallel).** One worker owns the whole judging run: it does the fetch, spawns
   its own helper agents (one per `batch-NNN.json` file, dispatched together so they run
   concurrently), collects their verdicts, and runs apply itself. Do not hand the batches off to
   separate top-level sessions; a single owning worker is what makes the run survive a restart and
   stay visible while it is in flight. Give each helper the agent prompt below plus the contents of
   its batch file. Each helper web-searches and returns a JSON array of verdicts. Helpers never
   write to the database.
3. **Assemble.** Write each helper's returned array as `verdicts-<n>.json` **inside the batch
   directory** (`logs/judge-<ts>/`). No manual merging into one file is needed.
4. **Apply (single writer)** → `npm run judge:apply -- logs/judge-<ts>/`. The argument may be a
   file or a directory, and several may be passed at once; a directory contributes every file in it
   matching `/verdicts.*\.json$/i`, so the `batch-*.json` inputs are ignored. Validates each verdict
   (zod) and updates the job (`fraudScore`, `riskBand`, `reasoning`, `signals`, `scoredAt`) plus
   the employer's `checks.web`. `riskBand` is derived from `fraudScore`, not taken from the verdict.
   Skips invalid verdicts without aborting the run; those postings simply stay pending.
5. **Loop.** Re-run `judge:fetch` until it reports `0 pending`. Re-judge anytime by clearing
   `scoredAt` (or just re-running helpers and re-applying; apply overwrites).

## Verdict shape (what each agent returns, one per posting)

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

Enums: `websiteReachable/hasJobsListing` = yes|no|unknown; `businessMatch/locationMatch` =
match|mismatch|uncertain; `applicationAddressType` = business|residential|po_box|virtual|none|uncertain.

## Agent prompt (paste + append the batch JSON)

> You are a fraud analyst auditing WorkBC job postings. For EACH posting in the JSON below, use
> web search to investigate the employer, then score fraud risk. Return ONLY a JSON array of
> verdicts (one per posting, shape above) — no prose outside the JSON.
>
> For each posting:
> 1. Web-search the employer's official website. Set `websiteUrl`/`websiteReachable`. Note their
>    real office address.
> 2. `businessMatch`: is this a REAL company that could plausibly employ this role? Any industry
>    counts (a ridesharing/retail/healthcare firm hiring a dev is a "match"). "mismatch" ONLY for
>    fake/shell/parked/impersonating/unverifiable entities — NOT for "industry ≠ job function".
> 3. `locationMatch`: does the company's stated location agree with the posting's?
> 4. `hasJobsListing`: does their site have a careers/jobs section? (bonus only — do NOT hunt for
>    this exact posting)
> 5. `applicationAddressType`: if the posting (see `flags` evidence / description) tells applicants
>    to MAIL materials somewhere, web-search that address and classify it: business (real office),
>    residential (a home/apartment/unit), po_box, virtual (mail-forwarding), none, uncertain.
>
> Scoring (fraudScore 0-100: low <30, medium 30-69, high ≥70; signals weighted -30..+30):
> - `applicationAddressType` residential/po_box/virtual → VERY STRONG fraud (+35..45); alone it
>   should push toward HIGH, and with a mail-resume instruction it should land HIGH.
> - generic free-email domain (gmail/outlook/yahoo/etc.) → +15..25. A company-domain email
>   (jobs@theircompany.com) is NORMAL — never "generic".
> - mail_physical_resume + software role → +20.
> - businessMatch mismatch → +20..30; match → −10..20. locationMatch mismatch → +10..15.
> - crypto_payment / banking_info_upfront → +20..30.
> - Detailed responsibilities, real benefits, recognizable employer, known ATS → legitimacy.
> - A check you can't determine is NEUTRAL (uncertain/unknown) — never penalize missing info.
>
> Be skeptical but fair: a real, verifiable company with a normal application method is low risk.
> Postings from unverifiable individuals using free email + mail-to-a-home are high risk.
