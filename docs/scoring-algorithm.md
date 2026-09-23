# The scoring algorithm

Written 2026-09-22. Supersedes the stage-2 design in `docs/jev-scoring-sketch.md`, which assumed
text judgments carry most of the signal. Measurement said otherwise; see
`docs/jev-comparison-findings.md` for the numbers behind every claim here.

Status: all four stages are live as of 2026-09-23. Both judging paths (`npm run judge` and
`judge:apply`) go through `lib/scoring/verdict.ts`: Jev answers the stage 2 questions when
`TYPESAFE_API_KEY` is set, `composeScore` produces the number, `explainVerdict` the prose, and the
row stores `judgments` and `scoringVersion = 1`. `npm run recompose` reweights without inference.

## Shape

Four stages, and the important rule is that **no model produces the score**. Models supply
evidence and judgments; code turns those into a number.

```
0. collect      scrape -> regex flags, ATS classification, NOC category          free
1. retrieve     Claude + web_search -> employer verdict, address classification  ~60% of spend
2. judge text   Jev -> typed judgments about the posting                         ~$2 / corpus
3. compose      pure code -> fraudScore, riskBand, signals[]                     free
```

Before 2026-09-23 stage 1 fed a Haiku call that read a prose rubric and returned a score, and the
agent path let an agent return a score directly. Rows from that era have `scoringVersion = null`.

## Stage 0: collect

`lib/signals/application-flags.ts` regexes the description for `generic_email_domain`,
`mail_physical_resume`, `crypto_payment`, `banking_info_upfront`, `fee_to_apply`, `id_upfront`,
`whatsapp_telegram_only`. `lib/signals/ats-registry.ts` classifies the apply host, and
`categoryForNoc` buckets the occupation. Deterministic, already running at scrape time.

Known gap: the ATS registry knows Oracle's Taleo but not Oracle Fusion
(`*.fa.*.oraclecloud.com`), so Marriott and every other Fusion employer loses the -25 credit.

## Stage 1: retrieve

This is the only stage that can establish facts about the world, and it is where the money goes.
Jev cannot participate: asked to classify 120 mailing addresses it answered "business" 119 times
at mean confidence 0.96, including all four the web search had established as residential. A
house on a suburban court and a small shop are the same string without a map.

Produces `businessMatch`, `locationMatch`, `hasJobsListing`, `applicationAddressType`.

Two fixes shipped, one outstanding:

- The representative posting is now chosen by evidence, not array position, so an employer's
  mailing address actually reaches the verifier (`lib/shared/mail-evidence.ts`).
- A cached `"none"` is re-verified when a posting contradicts it.
- **Outstanding:** `applicationAddressType` is stored per employer but describes one address.
  61 employers mail to more than one, covering 519 postings; A&W has 13 addresses under a
  `business` verdict and one of them is a P.O. box. It belongs in a table keyed on the
  normalised address, verified once and reused wherever that address appears.

## Stage 2: judge text

Ask only what measurement says discriminates. The first attempt shipped seven questions of which
four were flat across all bands and one ran backwards, so the rule now is that a question earns
its place by separating bands *before* anyone gives it a weight. `npm run measure-questions`
reports mean by band, Cohen's d, and absolute spread, with no scoring involved.

**`routePlausibleForEmployer`** (Noul) is the primary, and the only text judgment with strong
independent support. Against the human labels it separates low (mean 0.85, range 0.62-0.95) from
medium (mean 0.30, range 0.10-0.52) with a single overlap. It asks whether the application route
fits this employer, which is the one thing the regex structurally cannot know:

| posting | brandProminence | routePlausible | human |
| --- | --- | --- | --- |
| Marriott, Oracle careers site | 3.00 | 0.83 | low |
| Burger King, `burgerking6811@gmail.com` | 3.00 | 0.10 | medium |
| Browns Crafthouse, small local pub | 1.26 | 0.77 | low |

Gmail is unremarkable for a neighbourhood pub and alarming for a national chain. The regex sees
one flag for both.

**`employerIsOrganisation`** (Noul) supports it: d = -0.78 overall and -0.54 inside the
free-mailbox group, so it is not just re-reading the ATS flag.

**`brokerRouting`** (Noul) is promising and unmeasured at scale. On the 8 postings whose contact
email mentions immigration or LMIA, it scores 0.89-0.92 where an ordinary employer routes hiring
through a consultancy and 0.16-0.19 where an immigration firm hires its own staff. A keyword
cannot make that split. n = 8, so it needs a proper discrimination run before it gets a weight.

**`brandProminence`** (Score) is stored, never weighted. It reads 2.30 on human-labelled lows and
2.37 on mediums, because the medium band **is** big brands. It is an input to a comparison, not a
risk signal, and weighting it directly repeats the mistake that sank `specificity`.

Dropped on evidence: `specificity` (inverted, tracks employer size), `payVsDuties`,
`moneyThroughWorker`, `employerSubstantiation`, `urgency`, `roleCoherence`. `askBeforeHire` is
dead here (0.03 to 0.08 across 300 postings) but is the only cover for what would matter if
WorkBC moderation lapsed; keeping it is a tail-risk call, not a claim this data supports.

## Stage 3: compose

`composeScore` in `lib/scoring/compose.ts`. Pure, 28 tests, same input always same output.

1. **Deterministic signals** from a weight table (`lib/scoring/weights.ts`), every condition an
   explicit comparison against `true`, `false`, or a named enum. A `null` check matches nothing,
   which is the null-versus-false rule enforced by the type system instead of by a paragraph in
   a prompt asking a model to please remember it.

2. **Conditional legitimacy.** Brand credits (`business_match`, `location_match`, `jobs_listing`,
   `apply_address_business`) are withheld when the route is disowned. Confirming Burger King is
   real says nothing about whether *this posting* is from Burger King; on a free-mailbox route,
   employer verification is the precondition for impersonation rather than a reassurance.
   Penalties on the same fields still apply. This single rule took band agreement from 186 to
   248 of 300 and medium-band retention from 16 to 91 of 100.

3. **Address signals only for postings that mail.** The employer-level verdict never touches a
   sibling that applies online.

4. **Judgment contributions**, each scaled so a rubric level at or above acceptable costs zero.

5. **Floors.** A private mailing address floors the score at 70. "Any serious violation" is not a
   weighted sum, and a prompt could only ever ask a model to honour it.

6. **Band** via the existing `bandFor`.

### The route threshold

`routeDisowned` is a threshold of 0.57 on `routePlausibleForEmployer` when judgments are present,
and the `generic_email_domain` / `whatsapp_telegram_only` flags when they are not. Measured end to
end in the composer (addendum 7 of the findings doc): against the 21 labels the threshold ties the
live system and the flag switch at 19/21 with the same two misses, keeps all 62 stored highs, and
leaks 2 of 100 stored lows into medium where the flag switch leaked 13. Agreement with stored
mediums falls (240 to 217 of 300), which is the intended effect: those are the small businesses on
gmail the old system and the flag switch both penalised as if they were chains.

Weighted Nouls contribute nothing at or below 0.5. Without that, a clean posting reading 0.05 on
`askBeforeHire` rounded to a +1 signal whose label said money was requested.

## Where it stands against reality

Against 21 human labels: stored scoring 19/21, deterministic composer 19/21, composer with the v1
Jev questions 17/21. The composer has caught up to the current system without any model in
stage 2, and the v1 questions were costing two.

Both remaining misses are diagnosed. Megacity is the address bug, now fixed upstream. The Thai
Green Elephant cook is the immigration-broker pattern, which **nothing** currently catches,
including the live system, and which `brokerRouting` scores at 0.91.

## What is not settled

Every weight in the table is transcribed from the old prose rubric, and `BASELINE` is deliberately
left unfitted at 20. Sweeping it moves agreement from 186 to 231 of 300, which is fitting to the
current model's opinions rather than to fraud. 21 labels, 2 of them high, cannot support weight
fitting. More labels weighted toward medium and high are the gate on everything numeric here.

## Order of work

Done: the route threshold (2), and wiring the composer into both paths with `fraudScore` removed
from the agent verdict (3).

1. Measure `brokerRouting` properly with `npm run measure-questions`; it is stored on every
   composed row now, so the next judge run produces the sample for free.
2. Move address classification to a per-address table.
3. Add Oracle Fusion to the ATS registry.
4. Fit weights, once there are enough labels to fit them to. `npm run recompose` applies them.
