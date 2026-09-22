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

---

# Addendum: the first 13 human labels

Added 2026-09-22, after 13 of the 80 worksheet postings were labelled by the repo owner.
Small, and the low band is over-represented (9 of 13), so nothing below separates the systems.
What it does do is settle one design question and vindicate the current scoring.

## Against real labels

| system | agrees with the human |
| --- | --- |
| current stored scoring | 13/13 |
| deterministic composer | 12/13 |
| deterministic + Jev judgments | 13/13 |

The current LLM scoring did not miss once. Every measurement before this compared systems to
each other; this is the first one against a person, and the incumbent won it.

Jev's single extra posting is #4, which it moved from 65 to 70 and over the high threshold.
That is the 5-point nudge already identified as a scale effect, not discrimination, and a
baseline change would have done the same. At this n the three systems are indistinguishable.

## The design error the labels exposed

The composer originally matched on 8 of 13. All five misses were the same mistake, and the
labeller's own words diagnose it: *"generic email means anyone can be pretending to be Tim
Hortons"*.

On posting #2, a Burger King listing taking applications at `burgerking6811@gmail.com`, the
composer scored 8:

```
generic_email_domain +20   business_match -15   location_match -5
jobs_listing -7            apply_address_business -5
```

The brand credits cancelled the warning. But confirming that Burger King is a real chain with a
careers page says nothing about whether *this posting* is from Burger King. When the application
route is a free consumer mailbox, employer verification is not reassurance, it is the
precondition for impersonation: the better known the brand, the more attractive it is to borrow.

The rubric in `lib/ai/scoring.ts` treats employer verification and application route as
independent additive signals. They are not independent. Brand credit is conditional on the
application actually going to the brand.

`composeScore` now withholds `business_match`, `location_match`, `jobs_listing` and
`apply_address_business` when `generic_email_domain` or `whatsapp_telegram_only` fires. The
penalties on those same fields still apply, and `apply_address_private` is never suppressed.

## It generalised rather than overfitted

The rule was derived from three labelled postings, which is exactly the shape of an overfit.
Checked against the separate 300-posting sample (one posting of overlap):

| | before the rule | after |
| --- | --- | --- |
| band agreement | 186/300 | 248/300 |
| stored-medium kept medium | 16/100 | 91/100 |
| stored-high kept high | 70/100 | 70/100 |
| stored-low leaked upward | 0/100 | 13/100 |

The medium band was where the composer was worst, and it was worst for this reason. A verified
brand contacted through gmail is most of what the medium band is.

`BASELINE` stays unfitted at 20. The gain here came from a structural rule with a stated reason,
not from moving a constant until the numbers improved.

## Still open

Posting #4 is the remaining miss: `3444 Caldera Ct, Langford` is a house, but the stored web
check recorded `applicationAddressType: "none"`, so the +40 private-address signal never fired
and no floor applied. The address classification failed upstream in `verifyEmployerWeb`, which
is a different bug from anything in the composer.

Posting #1 turned up a second upstream gap: `lib/signals/ats-registry.ts` knows Oracle's older
Taleo but not Oracle Fusion (`*.fa.*.oraclecloud.com`), so Marriott and every other Oracle
Fusion employer loses the -25 `ats_known_provider` credit.

Both are left alone until the worksheet is done, since fixing them mid-labelling would move the
scores the labels are meant to judge.

---

# Addendum 2: redesigned questions

Added 2026-09-22. Nothing is wired up; this measures candidate questions only.
Reproduce with `npm run measure-questions -- --per-band 100`. About 1.5 cents per run.

## Method change: measure separation before choosing a weight

The v1 set was designed, weighted, and only then measured, so a question that reads identically
on a Marriott ATS posting and a shell company still got a weight and still moved scores. No
weight can rescue a judgment that does not vary with risk, and that is checkable before any
weight exists.

`scripts/measure-questions.ts` reports, per question, the mean by band and Cohen's d between the
low and high bands, with no scoring involved. It also reports absolute spread, because a large d
over a meaningless range is a trap: `askBeforeHire` shows d = -0.30 while ranging from 0.03 to
0.08 across 300 postings, which is noise with a small standard deviation, not signal.

## Results, 300 postings

| question | low | medium | high | d(low,high) | spread |
| --- | --- | --- | --- | --- | --- |
| brandProminence (0-3) | 2.03 | 1.29 | 0.74 | **-1.58** | 0.00-3.00 |
| routePlausibleForEmployer | 0.74 | 0.49 | 0.53 | **-1.08** | 0.06-0.94 |
| employerIsOrganisation | 0.94 | 0.86 | 0.74 | **-0.78** | 0.02-0.99 |
| askBeforeHire | 0.05 | 0.04 | 0.05 | -0.30 | 0.03-0.08 |
| moneyThroughWorker | 0.03 | 0.03 | 0.03 | 0.14 | flat |
| payVsDuties | 1.91 | 1.99 | 1.91 | -0.02 | flat |

Compare v1, where four of seven were flat and `specificity` ran backwards.

## The confound, and it survives

Large brands use applicant tracking systems, and the composer already credits those, so strong
separation could just be re-reading `ats_known_provider`. Split the sample by whether a
free-mailbox flag fires, which holds the deterministic signals roughly constant inside each half:

| | disowned route (n=155), medium vs high | owned route (n=145), low vs rest |
| --- | --- | --- |
| brandProminence | -0.75 | -1.74 |
| employerIsOrganisation | -0.54 | -0.86 |
| routePlausibleForEmployer | +0.34 | -1.46 |

`brandProminence` and `employerIsOrganisation` keep separating inside the gmail group, where
every posting looks the same to the regex. That is incremental information, not a restatement.
`routePlausibleForEmployer` saturates there, which makes sense: inside the disowned group every
route is already implausible.

## Against the 13 human labels

| human label | n | brandProminence | employerIsOrganisation | routePlausibleForEmployer |
| --- | --- | --- | --- | --- |
| low | 8 | 2.30 | 0.98 | **0.87** |
| medium | 4 | 2.37 | 0.91 | **0.27** |
| high | 1 | 0.48 | 0.92 | **0.37** |

`routePlausibleForEmployer` separates the human's low band from the human's medium band with no
overlap at all: every low sits between 0.77 and 0.95, every medium between 0.10 and 0.40.

It also explains what the other two cannot. `brandProminence` is 2.30 on lows and 2.37 on
mediums, because the medium band **is** big brands. Prominence is not a risk signal by itself
and must not be weighted as one; it is an input to a comparison. `routePlausibleForEmployer`
performs that comparison inside one question:

| posting | brandProminence | routePlausible | human |
| --- | --- | --- | --- |
| Marriott, Oracle careers site | 3.00 | 0.83 | low |
| Burger King, `burgerking6811@gmail.com` | 3.00 | 0.10 | medium |
| Tim Hortons, `tims.squamish@gmail.com` | 3.00 | 0.20 | medium |
| Browns Crafthouse, small local pub | 1.26 | 0.77 | low |

That is the labeller's own reasoning, computed. And it is something no deterministic rule can
reach: the regex knows "gmail", and cannot know that gmail is unremarkable for a neighbourhood
pub and alarming for a national chain.

## What this implies for the composer

`composeScore` currently approximates this with a binary `routeDisowned` switch driven by
`generic_email_domain`. That is the right idea at the wrong resolution: it penalises Browns
Crafthouse exactly as hard as Tim Hortons. A continuous `routePlausibleForEmployer` would grade
it, and the evidence says it would grade it correctly.

Recommended set if text judgments are adopted: **`routePlausibleForEmployer`** as the primary,
**`employerIsOrganisation`** as support, and **`brandProminence`** stored but never weighted
directly, since its value is as context for the first. Drop `payVsDuties` and `moneyThroughWorker`
outright. `askBeforeHire` is dead on this corpus at a 0.05-point spread, but it is the only
question covering the thing that would matter most if WorkBC moderation ever lapses, and it costs
effectively nothing to keep asking; keeping it is a judgment call about tail risk, not a claim
supported by this data.

## Caveats

The 300-posting separation is measured against stored bands, which remain an unvalidated
reference. The 13/13 agreement between stored bands and the human labels is the only reason to
trust them even this far.

The label check is 8 lows, 4 mediums, and 1 high. The low-versus-medium separation is clean and
the high band is a single posting, so nothing here says anything reliable about high-band
behaviour. More labels, weighted toward medium and high, would change what can be claimed.

No weights have been set and nothing has been wired into either judging path.

---

# Addendum 3: 21 labels (12 low, 7 medium, 2 high)

## Scores

| system | agrees with the human |
| --- | --- |
| current stored scoring | 19/21 |
| deterministic composer | 19/21 |
| deterministic + Jev v1 | 17/21 |

Stored and the composer now tie, and v1 judgments are actively costing two.

`routePlausibleForEmployer` holds up: low mean 0.85 (range 0.62-0.95), medium mean 0.30
(range 0.10-0.52). One overlap point at #15/#17, so a threshold near 0.57 splits 20 of 21.

## Two new signals the labels surfaced

**Immigration-broker routing (#18).** Generalised into a question, this works and a keyword
cannot. Of 8 postings whose contact email mentions immigration/LMIA/visa, the question scores
0.89-0.92 on the three where an ordinary business or household routes hiring through a
consultancy (a nanny, a restaurant cook, a delivery driver), and 0.16-0.19 on the four where
an immigration firm is hiring its own staff. A regex on "immigration" flags all eight. Base
rate check: those 8 are 25% low band against a corpus that is 92% low.

**Shared contact email (#22).** Weaker than it looked, and the specific case was wrong:
`hrjobs179@gmail.com` is used by one employer across four postings, all INNOV8's own. Corpus
wide, 53 emails serve more than one employer, covering 268 postings, and the band mix is the
same as sole-use emails (67/31/2 against 65/30/5). Most are franchise groups: one address for
five Red Barn Market locations, five Browns Socialhouse locations, four Popeyes franchisees.
The discriminating version is reuse across *unrelated* employers, which does exist
(`employment.ssii@gmail.com` serves Edo Japan, Booster Juice and Nanda Barber; another serves
Barcelos, Pizza Pizza, Subway, and two tire shops), but separating that from franchise reuse
needs a name-relatedness judgment that has not been built or measured.

## Next session

1. Decide a `routePlausibleForEmployer` threshold and whether it replaces the binary
   `routeDisowned` switch in `composeScore`, which currently penalises a neighbourhood pub
   using gmail as hard as a national chain using gmail.
2. Measure `brokerRouting` for discrimination on a full stratified sample, as
   `npm run measure-questions` does for the others. n=8 is not a basis for a weight.
3. Still unresolved from addendum 1: Oracle Fusion missing from the ATS registry, and
   Megacity's residential address recorded as `applicationAddressType: "none"`.
