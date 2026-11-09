# Implicit state machines in job-fraud

Written 2026-11-08 from `main` at 7e8f14e. Every claim below cites the code it was read from.
Nothing was run against production; where a step is inferred rather than observed, it says so.

## What this covers

job-fraud has no status column anywhere. Each lifecycle in the system is spread across nullable
columns, JSON keys, string prefixes, in-memory sets and, on the keyless path, files on disk. Code
that needs to know "what state is this in" re-derives it from those raw fields, and code that
moves a record forward writes whichever fields it happens to know about. This document maps the
six lifecycles that work this way, lists the combinations the encoding allows but the design does
not intend, and records the bugs that come out of them.

| Machine | Where the state lives | Readers that re-derive it |
|---|---|---|
| 1. Job verdict | `scoredAt`, `scoringVersion`, `judgments`, a `reasoning` prefix | about 35 |
| 2. Employer verification | keys inside `Employer.checks.web`, `checkedAt` | 4 |
| 3. Brand impersonation | recomputed from the apply URL; in-memory sets; a flag; a `reasoning` prefix | 4 guards |
| 4. Keyless run | which files exist in the run directory | 1 (apply) |
| 5. Judge request | `JudgeRequest.kind` string, `resolvedAt` | 3 |
| 6. Scheduled run | nothing persisted; cron status and stdout | 0 |

## Bugs found

These are the defects the mapping turned up, in the order they were found and judged on their own,
not weighed by how often they happen. Each is explained in its machine's section.

**Status, 2026-11-08.** Bugs 1 to 10 are fixed, together with four found later that happen in
normal weekly runs:

| Bug | Fix |
|---|---|
| 1, 2 | `Job.status` and `Job.verdictKind`; every verdict write goes through `lib/scoring/write-verdict.ts` |
| 3 | `scrape.ts` leaves `employerId` and `applicationFlags` alone on an impersonation |
| 4 | the fetch records each verdict's employer, and apply stores the verdict there |
| 5 | the fetch writes `manifest.json`; apply refuses an applied or unmanifested dir and never overwrites a verdict newer than the fetch; files sort numerically and match strictly |
| 6, 7 | `lib/shared/judge-requests.ts`: both judges resolve reruns and close requests whose posting is gone |
| 8 | the API judge holds a posting whose impersonation check failed, as keyless does |
| 9 | a posting with no employer is scored without an employer check on both paths |
| 10 | `judge.ts` takes pending postings oldest first |
| Silent failed runs | `JudgeRun` records every run; a 401/403 aborts; a run that scores nothing exits nonzero; the scheduler fails without a key |
| One address's verdict reused for another | verdicts record `addressChecked`; another address triggers a check, and within a run is held |
| Agent-chosen labels | keyless verdicts need one of the three tier labels; `source` from an agent is dropped |

A third round on 2026-11-09 fixed the rest of the open list: refetching changed postings and
sending them back to pending, guarded employer-verdict writes, saved impersonation answers,
`web.verifiedAt` and the employer-page date wording, `reverify-mail` re-scoring published postings
only, recompose skipping rows without judgments, `backfill-ats` scoring before it writes, deep
requests resolved only on a written verdict, the uncertain flag reaching the score, replica-safe
revalidation, the public refresh after a rerun, review requests written in one transaction without
duplicates, and the home page's scan date.

A fourth pass found more, listed under "A fourth pass: more implicit state" below; those are open.

Left as is, on purpose: the real company a posting is re-attributed to is not web-checked. Its only
posting presents as the other brand, so a check on it would call the real company a mismatch; two
employers are affected. Railway's edge cache still serves pages for up to 600 s after a purge.

1. **Fixed 2026-11-08: recompose now skips pending rows.** *Was:* `npm run recompose -- --apply`
   republished postings the owner sent back for a rerun, and the next judge run marked the rerun
   serviced. A rerun clears only `scoredAt`
   (`app/audit/[token]/j/[id]/actions.ts:33`). Recompose selects every row with a non-null
   `scoringVersion`, whatever its `scoredAt` (`scripts/recompose.ts:27`), and `composeVerdict`
   stamps `scoredAt = now` (`lib/scoring/verdict.ts:45`). The old judgments go back on the site,
   and `resolveRerunRequests` treats any `scoredAt` newer than the request as service
   (`scripts/judge.ts:227-239`).
2. **Fixed 2026-11-08: both judges call `keepImpersonationVerdict`, which leaves a confirmed
   impersonation uncomposed and republishes it unchanged when a rerun sent it back to pending.**
   *Was:* re-judging a confirmed impersonation replaced its 90 with an ordinary composed score. The
   impersonation write re-attributes the posting to the real company
   (`lib/ai/resolve-impersonation.ts:125,150-164`). A rerun, a deep request or `--rejudge` sends it
   back through `judge.ts` or `judge-keyless-apply.ts`, neither of which calls
   `isImpersonationVerdict`. The apply-host check now compares the tenant with the re-attributed
   name, which was derived from the tenant or named by the model, so it normally returns
   `no-check` (`resolve-impersonation.ts:72-73`) and `buildVerdict` composes a normal score. The
   composer gives `apply_host_mismatch` no weight, so nothing restores the 90. Four other
   re-scorers do guard (`recompose.ts:39`, `reverify-mail.ts:57`, `recheck-cached-verdicts.ts:60`,
   `backfill-ats.ts:39`). Inferred, not run: when the re-attributed name does not resemble the
   tenant, the check would fire again instead.
3. **A full re-scrape undoes a re-attribution but keeps the impersonation verdict.** The scrape
   upsert recomputes `employerId` from the claimed name and replaces `applicationFlags`
   (`scripts/scrape.ts:164,172,186,193`) without touching the score or reasoning. The result is a
   High "Brand impersonation" row attributed back to the impersonated brand, with no mismatch
   flag. The scheduler passes `--skip-existing` (`scripts/scheduled-refresh.sh:13-14`), so only a
   manual full scrape does this.
4. **Keyless apply writes a verdict onto the wrong employer when the representative posting was
   re-attributed in the same run.** Impersonation results are applied first
   (`scripts/judge-keyless-apply.ts:123-163`); the verdict loop then reads `job.employerId` afresh
   and stores `checks.web` on it (`:208,217-219`). If that posting was just re-attributed, the
   claimed employer's verdict lands on the real company's row, and the claimed employer is never
   updated.
5. **Re-applying an old keyless directory overwrites newer verdicts.** The verdict path stores
   `checks.web` with `checkedAt = now` whether or not its postings are still pending and with no
   newer-than check (`judge-keyless-apply.ts:217-219`). Running apply twice also inserts every
   search log again (`:223-225`).
6. **A deep request whose posting is gone stays open forever.** Apply throws "no such posting"
   (`judge-keyless-apply.ts:209`), counts it as skipped, and no code closes the request.
7. **The keyless path never resolves rerun requests.** Only `judge.ts` does
   (`judge.ts:227-239`); `judge-keyless-apply.ts:104` queries deep requests only, and the skill
   tells the operator to stamp reruns by hand (`.claude/skills/update-postings/SKILL.md:59,66`), so
   a rerun can be marked resolved with no re-score behind it.
8. **The API and keyless paths treat a failed impersonation check in opposite ways.** The API
   judge falls through to normal scoring (`judge.ts:183-186`); keyless holds the posting
   (`judge-keyless-apply.ts:170-175`).
9. **Employer-less postings are skipped on one path and half-checked on the other.** `judge.ts:62`
   gives them no employer check. `planByEmployer` marks them `"web"`
   (`lib/signals/verification-plan.ts:73,81`), so keyless fetch emits them, but apply discards the
   verdict because `job.employerId` is null (`judge-keyless-apply.ts:217`) and scores on `{}`.
10. **`judge.ts` takes `--limit` rows with no `orderBy`** (`judge.ts:47-51`), so which pending
    postings are judged, and which an employer decision sees, is not deterministic. Keyless fetch
    takes the oldest first.

## 1. The Job verdict

**Made explicit on 2026-11-08.** `Job.status` and `Job.verdictKind` now carry this machine, every
reader filters on them, and `lib/scoring/write-verdict.ts` is the only writer of the verdict
columns. Its guards stop a composed verdict replacing an impersonation and stop a recompute
republishing a pending row. The tables below describe the encoding as it was, and still explain
how `scripts/backfill-status.ts` derives the columns. Bugs 3 to 10 are not fixed by this.

### States

| State | Encoding |
|---|---|
| Pending, never judged | `scoredAt` null, all scoring fields null (`scrape.ts:193` create) |
| Pending, sent back | `scoredAt` null, but score, band, reasoning, signals, judgments and `scoringVersion` from the earlier verdict are kept (`actions.ts:33`) |
| Judged by a model (legacy) | `scoredAt` set, `scoringVersion` null, not an impersonation. May carry `fraudScore = -1` and band `unknown` (`lib/shared/risk-band.ts:4`) |
| Composed with Jev | `scoringVersion` 1 or 2, `judgments` set |
| Composed without Jev | `scoringVersion` set, `judgments` null: composed with no `TYPESAFE_API_KEY`, or a row whose answers were lost in the 2026-10-23 column drop (`scripts/backfill-ats.ts:7-8`) |
| Confirmed impersonation | `scoringVersion` null, score 90, band high, `reasoning` starts with `Brand impersonation:`, `employerId` re-attributed; `judgments` is not cleared (`resolve-impersonation.ts:150-164`) |
| Under deep review | any judged state plus an open `JudgeRequest(kind="deep")`; the posting stays published (`lib/shared/deep-requests.ts:5`) |

`scoringVersion` 2 is the current weight table (`lib/scoring/weights.ts:15`); 1 is the previous
table on rows not yet recomposed. The schema comment (`prisma/schema.prisma:75-77`) still
describes only 1.

### Transitions

Every writer that produces a verdict writes all the scoring fields in one update through
`composeVerdict` (`verdict.ts:38-46`) or the impersonation write. The exception is
`backfill-ats.ts`, which writes band and flags first (`:43`) and rescores second (`:54`); if the
rescore fails, the old score stays on the new inputs (`:58-60`).

| Writer | From | To |
|---|---|---|
| `scrape.ts:193` create | none | pending, never judged |
| `scrape.ts:193` update | any | same state, with new `employerId`, flags, description; scoring untouched |
| `judge.ts:205`, `judge-keyless-apply.ts:184` | pending (or anything, with `--rejudge` or a deep request) | composed |
| `applyImpersonationVerdict` | any | confirmed impersonation |
| `recompose.ts:51` | any row with `scoringVersion` set, pending included | composed v2 |
| `rescore-failed.ts:19` | band `unknown` | composed |
| `reverify-mail.ts:59` | any row with a mail flag, pending included | composed, fresh Jev call |
| `recheck-cached-verdicts.ts:166` | judged | composed |
| `actions.ts:33` (rerun) | judged | pending, sent back |

### Combinations the encoding allows

- **`scoringVersion` null means two different things**, a legacy model verdict or a confirmed
  impersonation. A `reasoning` string prefix is the only way to tell them apart
  (`resolve-impersonation.ts:15`), and that prefix check is what bug 2 is missing.
- **"Composed without Jev" mixes two kinds of row.** `recompose.ts:43-44` recomposes a row with
  null judgments on regex flags alone, while `rescoreVerdict` asks Jev again
  (`verdict.ts:82`). The two re-scorers can give the same row different scores.
- **A pending row can carry a full old verdict** (the sent-back state). Any writer that selects
  without a `scoredAt` filter can republish it, which is bug 1.
- **A published verdict can describe inputs the row no longer has.** A scrape update rewrites the
  description and flags but never sends the row back to pending (`scrape.ts:193`).
- **A score inconsistent with its band, or a judged row with no band:** no current writer
  produces either; every writer derives the band with `bandFor`. Legacy rows only.

### Readers

About 35 places test `scoredAt` directly, including every public page (`postings-filter.ts:103`,
`app/page.tsx:71-72`, `app/analysis/page.tsx:48-53`, `app/companies/page.tsx:37,62`,
`app/e/[id]/page.tsx:46`, `app/j/[id]/page.tsx:20`, `components/JobReport.tsx:56`), the audit pages
and most scripts. Others test `scoringVersion` (`recompose.ts:27`), band `unknown`
(`rescore-failed.ts:11`, `app/page.tsx:72`), `fraudScore >= 0` (`export-labelset.ts:42`,
`compare-jev.ts:73`, `measure-questions.ts:111`) or the impersonation prefix (four scripts).

## 2. Employer verification

### States

| State | Encoding |
|---|---|
| Unchecked | `checks` has no `web` key; `checkedAt` null |
| Presumed from an own-ATS match | `web.source = "ats-tenant-match"`, no `verifiedBy`, fixed values, confidence 0.8 (`verification-plan.ts:37-47`) |
| Haiku | `web.verifiedBy = "haiku-5.5"` (`lib/ai/verify-employer-web.ts:247`) |
| Haiku then Opus | `web.verifiedBy = "haiku-5.5>opus-5.5"` (`:251`) |
| Opus only | `web.verifiedBy = "opus-5.5"` (`scripts/recheck-cached-verdicts.ts:119`) |
| Before the tiers | no `verifiedBy`; `source` absent or `"web"` (`scripts/local-verify-apply.ts:60`) |
| Failed | not stored. An in-memory set (`judge.ts:105,142`) holds the employer's postings back for that run only |
| Needs a re-check | not stored. Recomputed each run by `verificationAction` from `staleAts`, `missedAddress` and `tierViolation` (`verification-plan.ts:21-28`) |

Writers: presumption at `judge.ts:93` and `judge-keyless-apply.ts:266`; web checks at
`judge.ts:133`, `judge-keyless-apply.ts:219`, `reverify-mail.ts:46` and `local-verify-apply.ts:61`;
the Opus re-check at `recheck-cached-verdicts.ts:161`.

### Combinations the encoding allows

- **`checkedAt` does not mean "web-checked".** Presumption stamps it too, and `/e/` shows it as
  "Checked" (`app/e/[id]/page.tsx:88-90`). `reverify-mail` writes a new verdict without stamping
  it (`reverify-mail.ts:45-46`). Keyless apply stamps the time of the write, not of the
  research, so an old file is stamped as current.
- **`verifiedBy` and `source` are whatever the agent sends.** The schema accepts any string
  (`lib/shared/json-schemas.ts:28`), `tierViolation` trusts the label
  (`verify-employer-web.ts:224`), and a keyless verdict carrying `source: "ats-tenant-match"` is
  then treated everywhere as presumed (`components/EmployerChecks.tsx:90`,
  `recheck-cached-verdicts.ts:68`).
- **The mailing-address type is stored per employer, not per address.** A cached `business` for
  one address is reused for a new posting that mails to another; `missedAddress` only fires on a
  cached `none` (`verification-plan.ts:24`).
- **Concurrent runs lose updates.** `judge.ts:132` merges into the `checks` it loaded at the start
  of the run, with no version check.

## 3. Brand impersonation

| State | Encoding |
|---|---|
| Needs a check | not stored; recomputed from the employer name, the apply URL and the ATS registry (`lib/signals/impersonation-plan.ts:14-20`, `resolve-impersonation.ts:72-73`) |
| Held for a missing answer | keyless only: an in-memory set (`judge-keyless-apply.ts:119,170-175`); in the database just `scoredAt` null |
| Cleared (same or affiliate) | not stored. The API cache lasts one process (`resolve-impersonation.ts:32`), the keyless set one apply (`judge-keyless-apply.ts:118`). A posting that returns to pending pays for the Opus check again |
| Uncertain | the flag `apply_host_mismatch_review` in `applicationFlags`, written separately from the score (`resolve-impersonation.ts:111-115`), then normal scoring |
| Impersonation | the confirmed-impersonation Job state above |

Two consequences follow beyond bugs 2, 3 and 8. The real company a posting is re-attributed to is
never verified, because the posting is already scored and nothing queues the new employer. And in
`judge.ts` the uncertain flag is missing from the in-memory row the score is built from
(`judge.ts:189`); the score is unaffected today only because that flag has no weight.

## 4. The keyless run directory

Fetch writes `batch-NNN.json`, `cached.json` and `impersonation-NNN.json`
(`scripts/judge-keyless-fetch.ts:58,60,69`). Helpers add `verdicts*.json` and
`impersonation-result*.json`. Apply classifies files by name (`judge-keyless-apply.ts:47-57`).
The run's state is exactly which files are present, so there is no record of which fetch a
directory belongs to or whether it has been applied.

- **Truncated JSON** aborts apply before any write (`:90-95,122-123`). That part is safe.
- **Applying twice** re-scores nothing, because scoring filters on `scoredAt` null, but it
  rewrites `checks.web` and `checkedAt` and duplicates every search log (bug 5).
- **An old directory** overwrites newer verdicts (bug 5). Only `cached.json` is re-decided at
  apply time (`:259-261`).
- **Two verdicts for one employer** apply in `readdirSync` order, which is lexicographic, so
  `verdicts-10.json` runs before `verdicts-2.json`. The first scores the postings; the second only
  overwrites `checks.web`.
- **File matching is loose.** The verdict regex is unanchored (`:57`), and an
  `impersonation-*.json` that is neither an item file nor a result file falls through to the
  verdict list (`:52`).
- **Dry run does not re-attribute**, so in the bug 4 case it reports the claimed employer while a
  real run writes to the real company.

## 5. Judge requests

`kind` is a free string (`schema.prisma:109`); any form value other than `"deep"` becomes
`"rerun"` (`actions.ts:25`). There is no foreign key to `Job` and no uniqueness, so a posting can
hold several open requests of either kind. Creating a request is three separate writes with no
transaction (`actions.ts:27,28,33`).

| State | Encoding |
|---|---|
| Open rerun | `kind = "rerun"`, `resolvedAt` null; the posting's `scoredAt` cleared at creation |
| Open deep | `kind = "deep"`, `resolvedAt` null; the posting stays published |
| Resolved | `resolvedAt` set |

Resolution is inferred, not recorded against a specific judgment: a rerun resolves when the
posting's `scoredAt` is newer than the request (`judge.ts:227-239`), whoever wrote it, which is
how bug 1 closes a request with no re-judge. A deep request resolves in keyless apply when the
verdict names the posting and that posting was scored in the run (`judge-keyless-apply.ts:231-239`);
`scored.add` runs before the database write (`:177` vs `:182-184`), so a failure later in the same
employer's batch can leave a re-scored posting with its request still open. A rerun takes the
posting off the public site at once, but `revalidatePath` only refreshes the audit page
(`actions.ts:35`), so cached public pages keep showing it for up to ten minutes.

## 6. The scheduled run

There is no record of a run. `scripts/scheduled-refresh.sh` scrapes twice and judges when
`ANTHROPIC_API_KEY` is non-empty (`:13-20`); its outcome exists only in `railway cron list` and
stdout, and logs go to the container's disk (`scripts/logger.ts:19`).

- **A run that judged nothing looks like success.** A stale key makes every web check fail with a
  401; those postings are held back and the process exits 0 (`judge.ts:168`). A missing key skips
  judging entirely. This is how the backlog of 730 pending postings found on 2026-11-06 built up
  unnoticed for more than a week.
- **"Last scan" on the site is `max(scrapedAt)`** (`app/page.tsx:73,92,160`), and `scrapedAt` is
  set only on insert (`schema.prisma:79`), so it moves when a new posting arrives, not when a run
  happens.
- **Revalidation is purge then warm as two separate requests** (`lib/shared/request-revalidation.ts:21-58`).
  With two replicas, the warm can land on the replica that was not purged
  (`docs/launch-runbook.md:33-34`, `lib/shared/warm-targets.ts:34`).

## Smaller string-typed states

`riskBand` is a string typed only in TypeScript as `low | medium | high | unknown`
(`risk-band.ts:1-4`), and `unknown` is a failure state that `rescore-failed` reprocesses.
`atsProvider` has three states (null, `"unknown"`, a provider name). `externalApplyOk` is a
`Boolean?` that scrape only ever writes as null (`scrape.ts:184-187`), so it carries no state at
all. `postedDate` null covers both a missing and an unparseable date
(`lib/shared/posted-date-backfill.ts:36-41`). None of these has caused a defect.

## A fourth pass: more implicit state

Found from `main` at bcedb7b, after the three rounds of fixes above. Every claim was read in the
code. The counts come from read-only queries against production on 2026-11-08.

**Status, 2026-11-09.** Delisting and the verdict snapshot are accepted as they are. These are fixed:

| Problem | Fix |
|---|---|
| Presumed shown as verified | `lib/shared/employer-check.ts` is the one test of `source`; `/companies`, `/analysis`, `/e/`, the employer checks panel and both audit pages use it, and `/analysis` counts presumed companies apart from web-checked ones |
| `scoredAt` doing four jobs | `Job.judgedAt`, set only by judgment writes and impersonation verdicts, kept across a send-back, and shown as "Reviewed on"; `scoredAt` stays the publication time and the rerun clock |
| Pending page says "never evaluated" | `lib/shared/verdict-state.ts`: a withheld row says it is being re-evaluated, and the audit mirror shows the withheld verdict |
| No scrape record | `ScrapeRun`, written by `lib/shared/scrape-run.ts`; a scrape that finds nothing, fetches nothing or throws exits nonzero, the scheduler judges anyway and then fails; "last scan" reads the latest finished run |
| Refetch overwrites evidence | `keepJudgeFlags` keeps `apply_host_mismatch_review` while the apply link is unchanged; no employer enrichment on an impersonation; a name found only in the detail creates its employer, and no name keeps the earlier one |

The rest of this section is as found.

### A posting that leaves WorkBC

No state exists for a posting WorkBC has removed. No code deletes a `Job` or marks it delisted. A
failed detail fetch is counted and skipped (`scripts/scrape.ts:171-176`, `lib/workbc/workbc-api.ts:131-133`).
The refetch only reaches postings the current search returns (`scrape.ts:100-109`), so a removed
posting is never fetched again and simply stays published. The employer page lists it under
"Postings in this scan" (`app/e/[id]/page.tsx:146`).

There are 16,785 of 23,750 published postings that nothing has fetched in 60 days. Many of them
come from older, broader scrapes and fall outside the cron's three searches, so the database
cannot tell a posting that was taken down from one that is still listed but out of the search.
That missing distinction is the problem. A scam posting WorkBC took down keeps its public rating
indefinitely.

### The job page shows the employer's current verdict, not the one its score used

A posting's score and signals are stored on the posting, but the "Employer checks" panel on its
page renders the employer's live `checks.web` (`components/JobReport.tsx:175`,
`components/EmployerChecks.tsx:84-87`). The two drift apart whenever the employer is checked
again. The mailing-address row shows the problem most clearly. It shows the employer's
`applicationAddressType` on every posting, including postings that apply online, which the
composer deliberately does not score on it (`lib/scoring/compose.ts:94-99`). It also shows it on
postings that mail to a different address from the one the verdict checked.

Recompute writers have the same gap. `recompose` and `recheck-cached-verdicts` score published
postings against the employer's current verdict without testing `addressChecked`
(`scripts/recompose.ts:47`), so a posting that mails to address A can be recomposed with the type
found for address B. No row is affected yet, because no stored verdict carries `addressChecked`
until Monday's run. The 68 employers whose postings give more than one address are the ones
exposed once it does.

### "Presumed real" shown as "verified"

`checks.web.source = "ats-tenant-match"` marks a presumption, but only the employer page and the
date wording read it (`lib/shared/verification-date.ts:13-15`, `EmployerChecks.tsx:91`).
`/companies` prints "✓ verified" for any `businessMatch: "match"` (`app/companies/page.tsx:175-181`),
`/analysis` counts presumptions as web-checked companies (`app/analysis/page.tsx:102-106`), and
the audit pages show `businessMatch` with no source. This affects 380 of the 4,283 employers that
have a verdict. The same company is "✓ verified" on `/companies` and "no web check was made" on
its own page.

### `scoredAt` does four jobs

`scoredAt` is the publication flag's partner, the judgment time, the clock rerun resolution
compares with (`lib/shared/judge-requests.ts:17`), and the public "Reviewed on" date
(`components/JobReport.tsx:56`). Writers that review nothing still stamp it. A recompose stamps
it on every row through `composeVerdict` (`lib/scoring/verdict.ts:45`), and `republishVerdict`
stamps it on an unchanged impersonation (`lib/scoring/write-verdict.ts:69-71`). A send-back
clears it, and no other column keeps the date of the original judgment. After
`npm run recompose -- --apply`, every recomposed posting reads "Reviewed on" the recompose date.

### A pending posting that holds a verdict says it was never evaluated

`PENDING` with a non-null `verdictKind` means "sent back, old verdict kept". Both job pages read
only `status` and print "This posting hasn't been evaluated yet" (`app/j/[id]/page.tsx:20-29`,
`app/audit/[token]/j/[id]/page.tsx:126-133`). The audit banner also says "queued for the next
judge run" for postings that are held back. No row is in this state today. Postings held for an
unchecked address or a failed impersonation check will be in it for a week at a time.

### The scrape run has no record

`JudgeRun` covers judging only. A scrape in which every detail fetch fails exits 0 and prints a
failure count (`scrape.ts:171,247`), which is the silent-failure pattern `JudgeRun` fixed for
judging. The manual skill's routine pass (`--recent week --skip-existing`, no refetch;
`.claude/skills/update-postings/SKILL.md:72`) and the cron's pass (`--refetch-after-days 28`;
`scripts/scheduled-refresh.sh`) leave the database in different states, and "last scan" cannot
tell them apart (`lib/shared/last-scan.ts:7-11`).

### The refetch overwrites evidence that other writers added

The new refetch rewrites rows that earlier scrapes never touched again, so these are new
exposures:

- A non-impersonation update replaces `applicationFlags` wholesale (`scrape.ts:221,235`) and drops
  `apply_host_mismatch_review`, which `resolve-impersonation.ts:161-165` added. Flags are left out
  of `contentChanged`, so the row stays published without its review marker. No row has the flag
  today.
- The employer enrichment uses the `employerId` derived from the posting's claimed name
  (`scrape.ts:196-202`). On a refetched impersonation, it writes the impersonator's mailing
  address onto the brand's `Employer.addressRaw`. The guard at `:231-235` covers only the `Job`.
- When a stub carries no employer name, `employerId` is written as null (`scrape.ts:126,196-197`),
  which counts as a content change and sends the posting back to be scored with no employer
  check. This is inferred. How often a stub lacks a name is unknown.

### Judge runs: crashed and "failed" runs that are neither

- An exception outside the guarded spots, such as a database error in the presumption loop
  (`scripts/judge.ts:100-104`) or in keyless apply's employer-less scoring
  (`scripts/judge-keyless-apply.ts:347`), leaves the run `RUNNING` forever. The audit page cannot
  tell that run from a live one. Nothing stops two runs at once either. The run table could serve
  as a lease but is not used as one.
- `runOutcome` derives the outcome from counts (`lib/shared/judge-run.ts:7-10`), and
  `pendingAtStart` counts every pending posting in the database. A keyless apply whose postings
  the Monday cron already judged scores nothing, while newer postings are pending, so the run is
  recorded `FAILED` and exits 1 when nothing went wrong.

### Keyless waves conflict with `applied.json`

The judge-postings skill says to apply each wave by its explicit verdict files
(`.claude/skills/judge-postings/SKILL.md:111-112`). An explicit file adds its directory to the
applied set (`judge-keyless-apply.ts:71-73`), and apply marks every directory applied (`:390`).
The second wave is therefore refused unless `--force` is passed, which also turns off the
double-apply guard. Explicit verdict files without their batch files also score only the named
posting (`:322`). This came in with the third round's manifest change.

### A third judge path that bypasses the guards

`local-verify-fetch` decides "needs a check" with `if (web) continue`
(`scripts/local-verify-fetch.ts:59-62`) instead of `verificationAction`. `local-verify-apply`
writes with a raw `update` (`scripts/local-verify-apply.ts:60-61`) instead of `storeEmployerWeb`,
and sets no `verifiedBy`, `verifiedAt` or `addressChecked`. `local-score-fetch` writes no
manifest, so keyless apply refuses its output. Neither path has docs beyond `package.json`. Its
verdicts heal on the next real run, since they fail `tierViolation` or count as having missed an
address, but that second check is paid for twice and the concurrency guard does not cover it.

### Smaller ones

- **Search logs are not tied to the verdict they produced.** A log is stored even when
  `storeEmployerWeb` refused the verdict (`judge.ts:150-158`, `judge-keyless-apply.ts:309-320`).
  Impersonation searches land on the real company, which has no `checks.web`. The audit index
  treats the newest log as the current verdict's (`app/audit/[token]/page.tsx:28-31`).
- **Labels join the fixture by section number.** `measureAgreement` never checks `workbcId`
  (`lib/eval/agreement.ts:51,61`). `export-labelset` overwrites the worksheet and key in
  `docs/labelset` by default, and its draw has no `orderBy`, so the same seed does not give the
  same postings (`scripts/export-labelset.ts:17,41,135-136`). After a re-export, old labels are
  scored against different postings without an error.
- **Freshness lives in three caches.** These are the edge
  (`s-maxage=600, stale-while-revalidate=31535400`, `middleware.ts:7`), each replica's data cache,
  and ISR. `reverify-mail`, `backfill-categories` and `local-verify-apply` change public data
  without calling `requestRevalidation`. `docs/launch-runbook.md:48-52` records 50 minutes of
  stale counts, so the "up to 600 s" written above understates it.
- **Home-page counts and rows are separate cache entries.** They expire on their own timers
  (`app/page.tsx:48-59`), so after a missed purge the tab counts and page rows can come from
  different snapshots, and postings repeat or vanish across pages.
- **`backfill-categories` rewrites `category` on published rows without re-scoring**
  (`scripts/backfill-categories.ts:9,18`), and `category` feeds `composeScore`.
- **Dead employer columns.** No code writes `Employer.website` or the top-level `checks` probe
  keys; production has 0 of each. The `/e/` header reads them (`app/e/[id]/page.tsx:63-70`), so
  every employer shows "no website" above a web section that names its site. `applicationUrl` is
  written and never read.

### Order to fix

1. Delisting. Fixing it means recording when the cron last saw a posting in a search
   (`lastListedAt`) and, for postings it no longer sees, a detail fetch that tells a removed
   posting from a still-listed one. That needs a measurement first: how many of the 16,785 the
   detail API still returns.
2. The verdict snapshot. Store the employer verdict a score used (or its `addressChecked` and
   address type) on the posting, render the page from it, and have recompute writers refuse a
   posting whose address the current verdict did not check.
3. One-line fixes: read `source` on `/companies`, `/analysis` and the audit pages; show the old
   verdict on a pending page; keep `apply_host_mismatch_review` across a refetch; skip the
   employer enrichment on impersonations; let a keyless dir take several explicit waves.
4. A `ScrapeRun` row beside `JudgeRun`, and a `finishJudgeRun` in each script's top-level catch.

## What to make explicit

The goal is that the published rating is never wrong and every change to it is deliberate. Three
approaches were weighed.

- **A. One `Job.status` enum** (pending, published, impersonation, under review) replacing the
  `scoredAt` test. This is the textbook fix, but it touches about 35 readers, needs a backfill of
  23,751 rows, and on its own fixes none of bugs 1-3: those come from writers that do not check
  what they are about to overwrite, not from readers misreading state.
- **B. Keep the timestamps, add one `verdictKind` column, and route every scoring write through
  one guarded function.** `verdictKind` (`model`, `composed`, `impersonation`) replaces both the
  ambiguous `scoringVersion = null` and the `reasoning` prefix. A single `writeVerdict(job, next)`
  refuses to replace an `impersonation` verdict unless the caller says it is re-checking
  impersonation, and refuses to publish a row with an open rerun unless the write is a fresh
  judgment. Every scoring writer except `backfill-ats.ts` already funnels through
  `composeVerdict` or `applyImpersonationVerdict`, so the guard has two call sites to wrap.
- **C. Guards only:** add `isImpersonationVerdict` to `judge.ts` and `judge-keyless-apply.ts`, and
  a `scoredAt: { not: null }` filter to `recompose.ts`. This fixes bugs 1 and 2 in a few lines but
  leaves the next re-scorer to remember both rules, which is exactly how the current two got
  missed.

**Recommendation: B, starting with C's three lines as a same-day patch.** B fixes the class of
bug rather than the instances, at the cost of one column and one backfill derived from fields
that already exist (`scoringVersion` and the prefix). A is worth revisiting only if a new public
state appears that `scoredAt` cannot express.

The other machines need less:

| Machine | Change | Fixes |
|---|---|---|
| Keyless run | Fetch writes a `manifest.json` (run id, fetch time, item checksums); apply refuses a directory whose manifest is missing or already applied, records the apply, and stores `checks.web` only when the verdict is newer than the employer's current one. Capture each verdict's `employerId` at fetch time instead of re-reading it after impersonation writes. Anchor the file regexes and sort numerically. | 4, 5 |
| Impersonation | An `ImpersonationCheck` table keyed by claimed employer and tenant, holding the relationship and when it was decided. Held, cleared and uncertain become durable, the two paths read the same answer, and a cleared pair is not paid for twice. Queue the re-attributed company for verification. | 8, Opus re-spend |
| Employer verification | Stamp `checkedAt` inside `web` when the research happens; let the orchestrator, not the agent, set `verifiedBy`; strip `source` from agent verdicts in the zod schema. | provenance gaps |
| Judge requests | A Prisma enum for `kind`, a partial unique index on open `(workbcId, kind)`, resolution recorded by the writer that services it (store the `scoredAt` it produced), keyless apply resolving reruns, and closing requests whose posting is gone. | 6, 7 |
| Scheduled run | A `JudgeRun` row per run (path, started, finished, counts scored, held and failed, outcome), written by `judge.ts` and keyless apply, with the homepage's "last scan" and an alert reading it. A run that scored zero with postings pending becomes visible. | the silent backlog |

Bug 3 (re-scrape undoing a re-attribution) is fixed by B's guard only if the scrape upsert stops
writing `employerId` on rows whose `verdictKind` is `impersonation`; that is a one-line condition
in `scrape.ts` and belongs in the same change.
