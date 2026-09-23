# Plan: extract the score composer

Status: implemented 2026-09-23, with two departures. Stage 2 judgments come from Jev rather than a
rewritten Haiku prompt (step 3), so `lib/ai/scoring.ts` was deleted instead of rewritten; and the
published prose is generated after composition from the signals (`lib/scoring/explain.ts`), which
is the first of the two options under "Risks". Everything else landed as written; the current
account is `docs/scoring-algorithm.md`. Written 2026-09-21.

Out of scope, deliberately: adopting Jev (see `docs/jev-scoring-sketch.md`), building a labelled
eval set, and rescoring the existing archive. This plan is worth doing on its own and is a
prerequisite for the first two.

## Why

The final 0-100 is chosen by a model on both judging paths, and the two paths do not even choose it
the same way.

`npm run judge` sends the rubric to Haiku as prose and reads `fraudScore` out of the tool call.
The agent path never runs `lib/ai/scoring.ts` at all: the judge-postings skill tells the agent to
read it as guidance, the agent returns its own `fraudScore`, and `scripts/judge-apply.ts:64` writes
that number straight to the database. The only thing checked is that it is an integer in 0-100 with
signal weights inside `[-30, +45]`.

So the same posting can get a different number depending on which path drained the queue, and
nothing in the system can detect that. Eleven of the thirteen rubric lines are arithmetic over
values the pipeline already computed; the model is being asked to do that arithmetic in prose, from
a prompt, twice, differently.

Three specific things this fixes:

**Floors become enforceable.** The rubric says a residential or PO-box application address "should
push a posting toward the HIGH band (>=70)". A prompt can ask. Code decides.

**The null-versus-false rule stops being a matter of persuasion.** The prompt spends five lines and
capital letters explaining that `null` means not checked. `=== false` cannot misread it.

**Scoring becomes testable.** A pure function gets unit tests with fixed inputs. The prompt never
could.

## Shape

One new directory, `lib/scoring/`, holding two files.

`lib/scoring/weights.ts` is the entire tuning surface: one table, no logic. A reweight is a diff to
this file.

`lib/scoring/compose.ts` exports one pure function:

```ts
export function composeScore(input: ComposeInput): ComposeResult
```

```ts
type Judgments = {
  specificity: number            // 0..3
  employerSubstantiation: number // 0..3
  payPlausibility: number | null // 0..3, null when the posting states no pay
  urgency: number                // 0..1
  preHireAsk: number             // 0..1
  moneyHandling: number          // 0..1
  roleCoherence: number          // 0..1
}

type ComposeInput = {
  judgments: Judgments
  checks: Checks                    // lib/shared/json-schemas.ts, includes checks.web
  flags: ApplicationFlag[]          // lib/signals/application-flags.ts
  atsProvider: string | null
  externalApplyOk: boolean | null
  category: Category                // lib/signals/job-category.ts
}

type ComposeResult = {
  fraudScore: number    // 0..100
  riskBand: RiskBand    // via the existing bandFor()
  signals: Signal[]     // closed label vocabulary, weights within [-30, +45]
}
```

The `Judgments` shape is deliberately the Jev question set from `docs/jev-scoring-sketch.md`, so
that swap later is a change of producer and nothing else.

## The weight table

Transcribed from the current rubric in `lib/ai/scoring.ts`. Ranges collapse to single integers,
because a range only existed so a model could pick within it.

| id | condition | weight |
| --- | --- | --- |
| `ats_known_provider` | apply host matches the employer's own ATS tenant | -25 |
| `business_match` | `web.businessMatch === "match"` | -15 |
| `business_mismatch` | `=== "mismatch"` | +25 |
| `location_match` | `web.locationMatch === "match"` | -5 |
| `location_mismatch` | `=== "mismatch"` | +12 |
| `jobs_listing` | `web.hasJobsListing === "yes"` | -7 |
| `apply_address_business` | `web.applicationAddressType === "business"` | -5 |
| `apply_address_private` | `in {residential, po_box, virtual}` | +40 |
| `address_not_geocoded` | `addressGeocoded === false` or `addressMatchConfidence < 0.5` | +20 |
| `address_city_match` | `addressMatchesCity === true` | -5 |
| `address_city_mismatch` | `=== false` | +15 |
| `website_unreachable` | `checks.websiteReachable === false` | +12 |
| `generic_email_domain` | flag present | +20, and +5 more when `websiteReachable === false` |
| `crypto_payment` | flag present | +25 |
| `banking_info_upfront` | flag present | +25 |
| `fee_to_apply` | flag present | +20 |
| `id_upfront` | flag present | +20 |
| `whatsapp_telegram_only` | flag present | +20 |
| `mail_resume_software_role` | `mail_physical_resume` and category in {Software & Data, IT & Infrastructure} | +20 |

Every condition is an explicit comparison against `true` or `false` or a named enum value. A `null`
matches nothing and contributes nothing, which is the null-versus-false rule enforced by the type
system instead of by a paragraph.

Text judgments contribute on a continuous scale:

| id | contribution |
| --- | --- |
| `vague_description` | `(1 - specificity/3) * 15` |
| `unsubstantiated_employer` | `(1 - employerSubstantiation/3) * 10` |
| `pay_implausible` | `(1 - payPlausibility/3) * 15`, skipped when null |
| `urgency_pressure` | `urgency * 10` |
| `pre_hire_ask` | `preHireAsk * 25` |
| `money_handling` | `moneyHandling * 25` |
| `role_incoherent` | `(1 - roleCoherence) * 12` |

Each contribution rounds to an integer, signals with weight 0 are dropped, the sum clamps to 0-100.

Then the floors, applied after the sum:

- `apply_address_private` floors the score at 70
- `preHireAsk > 0.8` floors the score at 70

Floors exist because "any serious violation" is not a weighted sum. Every number above is a
placeholder carried over from the prompt's ranges. They get set properly against the eval set,
which is separate work.

## Label vocabulary

Composer signals use the ids above as labels, which makes the vocabulary closed for the first time.
`lib/shared/signal-labels.ts` currently normalizes free text written by a model and falls back to
rendering it verbatim. That contract stays exactly as it is, because historical rows keep their
free-text labels forever and must keep rendering. What changes is that new rows only ever use ids
already in the `PLAIN` map, so the fallback stops being load-bearing for new data.

Adding a weight-table row without adding its `PLAIN` entry should fail a test.

## Steps

**1. Composer and weights, wired to nothing.** `lib/scoring/weights.ts`, `lib/scoring/compose.ts`,
and `lib/scoring/compose.test.ts`. Table-driven tests: one case per weight-table row asserting the
signal fires with the right weight, one asserting `null` checks contribute nothing, one per floor,
one for clamping at both ends, and one asserting every weight-table id has a `signal-labels.ts`
entry. Nothing else in the repo changes and nothing behaves differently. This step ships alone.

**2. Schema.** Add to `Job`:

```prisma
judgments      Json?
scoringVersion Int?
```

`judgments` stores the raw `Judgments` object so a reweight never needs inference. `scoringVersion`
marks which era produced the row, so analysis can separate model-chosen scores from composed ones
without guessing. Both nullable, so existing rows stay valid. `npm run db:push`.

**3. Rewrite the Haiku path.** `buildPrompt` in `lib/ai/scoring.ts` loses the entire SCORING
GUIDANCE block, the null-versus-false paragraph, the employer checks and the posting flags. It
keeps the posting text and asks for the seven judgments and the prose reasoning. The tool schema
returns `{judgments, reasoning}` and no longer accepts `fraudScore` or `signals`. `scripts/judge.ts`
calls `composeScore` and writes its output.

The prompt gets much shorter, since everything it no longer needs to be told is the deterministic
half.

**4. Shadow compare before switching.** `scripts/compare-judge.ts` is already the read-only A/B
pattern. Extend it to score already-judged postings through the composer and print band agreement
and the score delta distribution, writing nothing. Read the postings that move by a band by hand.

This measures agreement with the current model, which is imitation and not accuracy. That is a
real limit and it is why the eval set is the next piece of work. What this comparison can still
catch is a weight-table transcription error, which is the failure mode of this step.

**5. Rewrite the agent path.** In `.claude/skills/judge-postings/SKILL.md`, the verdict shape drops
`fraudScore` and `signals` and gains `judgments`. It keeps `web`, which is retrieval output the
composer consumes, and `reasoning`. The agent prompt loses "read `lib/ai/scoring.ts` for the
maintained scoring guidance" and the scoring-policy section, because there is no longer any weight
for an agent to choose. `scripts/judge-apply.ts` validates the new shape and calls `composeScore`.

Both paths now produce a score the same way. That is the point of the whole plan.

**6. Recompose script.** `scripts/recompose.ts`, wired as `npm run recompose`. Reads every job with
non-null `judgments`, recomputes score, band and signals from the current weight table and the
current `checks`, writes them back, requests revalidation. No API key, no network, no inference.
A `--dry-run` flag prints the band movement without writing.

This is the payoff. Changing a weight becomes editing one table and running this.

**7. Docs and the one rendering bug.** `components/JobReport.tsx:125` computes the signal bar width
as `Math.abs(s.weight) / 30`, which has been wrong since weights started reaching 45: a +45 signal
and a +30 signal both clamp to a full-width bar. Divide by `MAX_SIGNAL_WEIGHT`.

The README's "How each posting is rated" section is the published methodology, sliced onto `/about`
by `lib/shared/methodology.ts`. It should gain a sentence saying the number is computed from a
fixed, published weight table rather than chosen by a model, since that becomes true here and it is
a straightforwardly better thing to be able to tell a visitor. `docs/ARCHITECTURE.md`,
`docs/TECHNICAL_INFO.md` and `docs/judge-runbook.md` all describe the current flow and need
updating. `docs/signal-range-repair.md` stays as the historical record of why the range is what it
is.

## Two eras in the data

Postings scored before step 5 have no stored `judgments`, so `recompose` cannot touch them. They
keep a model-chosen score forever unless they are re-judged, which costs web searches and money.

Recommendation: leave them and mark them. `scoringVersion` null means model-chosen, 1 means
composed. Any analysis that compares score distributions across time has to filter on it, and the
column is what makes that possible rather than a footnote someone forgets.

Re-judging the archive is a separate decision with a real invoice attached. It should not be
smuggled into this plan.

## Risks

**A transcription error in the weight table is silent.** It produces plausible scores that are
wrong. Step 4 exists for this and the per-row tests in step 1 are the real defence.

**Reasoning prose can now contradict the score.** The model writes the prose without knowing the
final number. A posting can get a composed 74 alongside reasoning that reads as reassuring. Options
are to generate the prose after composition from the top signals, or to accept the mismatch and
treat the prose as an evidence summary rather than a verdict. Worth deciding at step 3 rather than
discovering on the site.

**The judgment set may be missing something the free-text signals were catching.** Today a model
can invent a signal for anything it notices. After this it can only answer the seven questions.
Reading the signals on existing high-band postings and checking that each one maps to a weight-table
row or a judgment is the way to find out, and it belongs in step 1 before the table is fixed.
