# Jev versus the current scoring: measured

Run on 2026-09-21 against 300 stored verdicts, 100 from each risk band, newest first.
Reproduce with `npm run compare-jev -- --per-band 100`. Read-only, writes nothing.
Total Jev spend for the whole experiment: about 2 cents.

## The headline

The seven text judgments in `docs/jev-scoring-sketch.md` add nothing to this corpus that a
constant does not. The sketch's premise was wrong.

| configuration | band agreement | stored-high kept high | stored-low leaked up |
| --- | --- | --- | --- |
| deterministic checks only, no model | 186/300 | 70/100 | 0/100 |
| deterministic + all seven Jev judgments | 183/300 | 77/100 | 12/100 |
| deterministic only, baseline constant 32 | 187/300 | 78/100 | 13/100 |

Jev appears to buy 7 extra high-band postings. Raising a single constant by 12 points buys 8,
with no model call, no API key, and no latency. The apparent gain was a scale shift, not
discrimination.

## Why the judgments do not discriminate

Mean judgment values by the band the current system assigned:

| dimension | stored low | stored medium | stored high |
| --- | --- | --- | --- |
| specificity (0-3, higher is better) | 0.77 | 2.28 | 2.15 |
| employerSubstantiation (0-3) | 1.84 | 2.22 | 2.08 |
| payPlausibility (0-3) | 1.91 | 1.98 | 1.91 |
| urgency (probability) | 0.05 | 0.05 | 0.05 |
| preHireAsk | 0.05 | 0.04 | 0.05 |
| moneyHandling | 0.03 | 0.03 | 0.03 |
| roleCoherence | 0.69 | 0.77 | 0.74 |

Four dimensions are flat to two decimal places. Ablating each one individually confirms it:
dropping `employerSubstantiation`, `urgency`, `preHireAsk` or `moneyHandling` changes the
outcome on zero of 300 postings.

`urgency`, `preHireAsk` and `moneyHandling` sit near zero everywhere because the text they
describe is not in this corpus. WorkBC postings are moderated. "Wire us a deposit, message us
on Telegram" does not survive to the database. The fraud that does survive looks like an
ordinary posting with a free email address and a mailing address that turns out to be a house.

`specificity` is worse than useless: it runs **backwards**. Low-risk postings score 0.77 and
high-risk ones score 2.15. Two thirds of the low band applies through an ATS, and large-employer
ATS boilerplate ("We Elevate... Quality of urban life") is genuinely vague, while someone
inventing a job often writes plenty of concrete-sounding detail. Vagueness here is a
company-size signal wearing a fraud signal's clothes. It is the single largest source of false
promotions: `vague_description` at +15 is the top signal on almost every low-band posting Jev
pushed into medium.

The one slice where text should be all there is makes it worse, not better. On the 15 postings
where no deterministic signal fires at all, deterministic-only matches the stored band on 12;
adding the judgments matches on 0, with mean absolute error rising from 6.5 to 29.6.

## What actually separates the bands

The `contactChannel` choice, which is the one question that reads like a fact rather than an
impression:

| stored band | dominant contact channel |
| --- | --- |
| low | 66% applicant tracking system or portal |
| medium | 90% free consumer email |
| high | 51% free consumer email, 31% postal mail |

All of which the pipeline already knows without a model, from `lib/signals/application-flags.ts`
and `lib/signals/apply-host.ts`.

## What this does and does not establish

**Does:** this question set, weighted this way, does not reproduce or improve on the current
system, and one of its dimensions is actively harmful on this corpus.

**Does not:** that Jev judges text badly. Jev answered exactly what it was asked. The questions
were aimed at blatant scam copy that this corpus does not contain, and at "vagueness", which
turns out to track employer size. A question set aimed at what actually distinguishes these
postings might do better. That is a different experiment.

**Also does not:** that either system is *correct*. Every number here measures agreement with the
current model's opinions, and the current model is fed the same deterministic checks in its
prompt, so "code reproduces the model" is partly circular: it mostly shows the model follows its
own rubric. Nothing here has been compared against a posting known to be fraudulent.

That last point is the binding constraint. Fitting anything to these numbers would be fitting to
an unvalidated reference. `BASELINE` in `lib/scoring/weights.ts` is therefore left at its
transcribed value with the sweep recorded as evidence rather than adopted as a target:

| baseline | agreement | high kept | low leaked | medium kept |
| --- | --- | --- | --- | --- |
| 20 | 186/300 | 70/100 | 0/100 | 16/100 |
| 28 | 188/300 | 71/100 | 0/100 | 17/100 |
| 32 | 187/300 | 78/100 | 13/100 | 22/100 |
| 36 | 231/300 | 79/100 | 26/100 | 78/100 |

36 looks best and is the most dangerous number in the table. The corpus is 92 percent low band,
so a 26 percent leak is roughly four thousand postings changing what the site tells a visitor,
justified by nothing but closer agreement with a reference that has never been checked.

## Two bugs this run found

Both were caught by reading the first eight results, and both are fixed.

`moneyHandling` fired on restaurant managers. The question asked about "receiving, holding,
forwarding or converting money on behalf of the employer", which describes operating a till.
Rewritten to the mule pattern specifically: funds or parcels passing through the worker's own
account, card, or home address.

Every Score dimension charged points at rubric level 2, the level whose text says the posting is
fine. `pay_implausible+5` appeared on nearly every posting. Levels at or above acceptable now
charge zero, in `shortfall()` in `lib/scoring/compose.ts`.

## Next

Label the postings. `npm run export-labelset` writes `docs/labelset.md`: 80 postings, half drawn
from where the current scoring and the composer disagree and half at random, with the stored
score and band deliberately withheld so the labels are not anchored to the thing being judged.
`docs/labelset.key.json` holds the mapping and should stay unread until the sheet is filled in.

With labels, every number in this document can be recomputed against something real, and
`BASELINE` and the weight table can be fitted to fraud rather than to agreement.
