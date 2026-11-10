# Judge runbook

Scraping collects raw postings. The orchestrating session fetches pending postings,
assigns investigation batches and applies verdicts as the single database writer.
Agents never write to the database, and no agent chooses a score.

This is the keyless judge; `npm run judge` (the API judge) does the same in one process when
`ANTHROPIC_API_KEY` is set. Use the [judge-postings skill](../.claude/skills/judge-postings/SKILL.md)
for the maintained procedure, verdict shape and agent prompt. `npm run judge-keyless:fetch` writes
`logs/judge-<timestamp>/batch-NNN.json` (one item per employer to investigate) and `cached.json`
(postings whose employer needs no check), and prints `DIR=... BATCHES=...`. Helpers run on Haiku;
verdicts that need escalation go to Opus helpers (skill step 3b). Save verdicts beside their batches
as `verdicts-NNN.json`, check with `npm run judge-keyless:apply -- --dry-run <dir>`, then apply the
directory once after all its batches finish.

For scraping followed by judging, use the
[update-postings skill](../.claude/skills/update-postings/SKILL.md).

An agent's job is evidence: the employer verdict (`web`) that the composer consumes.
`npm run judge-keyless:apply` stores it, asks Jev the text questions (`TYPESAFE_API_KEY`),
and composes the score from the weight table in `lib/scoring/weights.ts`, exactly as
`npm run judge` does. The rules and the measurements behind them are in
[scoring-algorithm.md](scoring-algorithm.md).

## API judge and keyless judge: differences and step detail

Moved from `AGENTS.md` on 2026-11-10 so the instruction file holds only rules. The text is as it stood then.

What still differs:

| | API judge | Keyless judge |
|---|---|---|
| Tier escalation | done by code (`verifyEmployerTiered`) | done by the orchestrating session (skill step 3b); `judge-keyless:apply` **rejects** a verdict needing escalation unless `verifiedBy` is `opus-5.5` or `haiku-5.5>opus-5.5` |
| Brand-impersonation check (Opus 5.5) | API call per posting | Opus helper agents per employer-tenant pair (skill step 3c); `judge-keyless:apply` holds a posting that needs the check until an `impersonation-result-*.json` clears it |
| Search trail in `EmployerWebSearchLog` | verbatim API search blocks | the helper's own `searchLog` (queries and result URLs), labelled agent-reported on `/audit` |
| Web search limit | per-search billing ($10 / 1,000), none per session | Claude Code's WebSearch: about 200 per session, refilling about 100 an hour |
| Prompt | `lib/ai/verify-employer-web.ts` | the skill's "Agent prompt" |

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
