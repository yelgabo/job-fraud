# Where the system can improve itself, and where it cannot

Written 2026-09-29, after the first composed judge run (973 postings) and the wiring of Jev.
The goal this doc serves: the site should get better without every improvement being steered by
hand. This says what stands in the way, in order of leverage, and what has to stay human.

## Where it stands

| Stage | Runs itself? | What decides |
| --- | --- | --- |
| Scrape | Yes, weekly cron (`scrape.yml`) | nothing to decide |
| Employer verification | No, needs a human to start a run | Claude web search, or an agent session |
| Text judgments | With the run | Jev, five fixed questions |
| Score | With the run | `lib/scoring/weights.ts`, pure code |
| Publish | Automatic once written | 10 minute cache |
| Review queue | Human files, human drains | owner judgement on the audit mirror |
| Weights | Never changed since transcription | nobody; there is nothing to fit them to |

The first composed run landed 916 low, 42 medium, 15 high (94.2 / 4.3 / 1.5 percent) against the
model era's 92.3 / 6.4 / 1.3. The scale did not move. That is the reassurance and also the
problem: the system reproduces its own past opinions and has no way to find out whether they were
right.

## Three things that stop it improving itself

**1. There is no supply of ground truth.** 21 human labels exist, 2 of them high. Every weight
is a transcription of an old prompt's ranges and `BASELINE` is deliberately unfitted, because
fitting to 21 labels would be fitting to noise and fitting to the 17,000 stored verdicts would be
fitting to the old model. Nothing the pipeline produces today becomes a label. The owner's review
queue decisions, which are the highest-quality judgements the system ever sees, are written as
free-text notes and then forgotten by the scoring side. The label worksheet in `docs/labelset.md`
has 59 postings still blank.

**2. Judging needs a human to press the button.** The scrape is on a cron; the judge is not,
because the workflow carries no Anthropic or TypeSafe key. So new postings pile up as pending
(973 this time, 14 weeks of scrape) until someone runs a session. The site is stale by exactly
that lag.

**3. A rubric change has no regression check.** `npm test` says nothing about whether the
composer still agrees with the labels. The 19/21 result lives in a findings doc and a scratch
script that was deleted. A weight edit today is verified by whoever remembers to re-run a
comparison. That is what makes every rubric change something a human has to steer.

## The loop, once those are fixed

```
scrape (cron)
  -> judge (cron, keyed, or a scheduled cloud agent on the keyless path)
  -> drift report per run (band mix, employer verdicts that flipped, new highs on old employers)
  -> anomalies auto-filed as JudgeRequests            <- the machine curates, the owner decides
  -> owner resolves a request with a band + reason    <- becomes a Label row, not just a note
  -> label harness in CI: composer vs labels          <- every rubric PR is measured
  -> weight proposals (an agent, offline, as a PR)    <- measured against the harness
  -> merge                                            <- the one human gate on published claims
  -> recompose (post-deploy, no inference)
```

Two human steps remain: resolving queued requests (which is labelling, and should be treated as
such) and merging rubric changes. Everything else can run without steering. The second step
should stay human for a reason that is not about capability: every merge changes published
claims about named real employers, and a system that rewrites those on its own judgement is a
different kind of system from the one the README describes.

## Improvements, ranked by what they unlock

**A. Turn the review queue into a label source.** A `Label` table (`workbcId`, `band`, `reason`,
`source` in {worksheet, review-queue}, `createdAt`), written by the audit page's resolve action
and by a one-off import of `docs/labelset.md`. Zero new work for the owner: draining the queue
already means deciding a band. Unlocks everything numeric. Small change, half a day.

**B. Finish the worksheet.** 59 labels sit blank in `docs/labelset.md`, drawn deliberately half
from composer-vs-stored disagreements. An hour of the owner's time roughly quadruples the eval
set and is the only way to get more than 2 highs. No code.

**C. Label harness in CI.** Snapshot each labelled posting's evidence (flags, checks, judgments)
into a fixture so the test needs no database, then assert the composer's agreement with the
labels does not drop below the current 19/21 (and later, the per-band recall). Every PR that
touches `lib/scoring/` is measured. This is the piece that turns "steer every rubric change"
into "review a number". One day.

**D. Judge on a schedule.** Two options, not exclusive:
- Keyed: add `ANTHROPIC_API_KEY` and `TYPESAFE_API_KEY` as repo secrets and a `judge.yml` that
  runs `npm run judge` after the Monday scrape with a `--limit`. Cheapest, deterministic, and the
  billing abort already protects it.
- Keyless: a scheduled cloud agent (the `schedule` skill) that runs the `update-postings` skill
  end to end, with `DATABASE_URL` and `TYPESAFE_API_KEY` in its environment. More expensive per
  posting, no Anthropic key in the repo.
Either way the site stops lagging the scrape by months.

**E. Drift report and auto-filed requests.** At the end of each judge run: band mix against the
corpus baseline, employers whose verdict changed band, postings that landed high for an employer
whose other postings are low, and postings where Jev's route judgment and the regex flag disagree
sharply. Anything past a threshold is written as a `JudgeRequest` with the reason in the note.
The owner then reviews a curated list instead of scanning the site. Half a day, and it is where
"self-improving" becomes visible.

**F. A deterministic registry check in stage 1.** BC's OrgBook (orgbook.gov.bc.ca) publishes
registration status for BC companies through a public API. Registered, active, incorporation
date, registered address: facts, free, no model. It would give `businessMatch` an evidence source
that does not depend on a web search reading a directory listing, and it is the natural home for
the "real company with no web presence" case that the README already names as a weakness. Needs
verifying against the live API before anything is built on it.

**G. Measure `brokerRouting`.** Every composed row now stores it. `npm run measure-questions`
over the 973 gives the stratified sample the doc has been waiting for, at no Jev cost since the
answers are already in `Job.judgments`. If it separates, it gets a weight through C.

**H. The known structural gaps**, unchanged from `docs/scoring-algorithm.md`: address
classification per address rather than per employer (Subway's 32 addresses share one verdict;
this run's Subway postings overwrote each other's cached verdict three times), Oracle Fusion in
the ATS registry, and aggregator mislocations (Houston TX listed as Houston BC, Delta PA as
Delta BC) which currently score as a location mismatch rather than being recognised as not a BC
job at all.

## What should stay human, and why

- **Labelling.** The whole numeric side is downstream of it, and the failure mode of letting a
  model label is fitting the composer to that model's opinions, which is the loop this project
  spent the last two weeks getting out of.
- **Merging rubric changes.** Published claims about named employers. The harness makes the
  decision a number; a person still makes it.
- **The public correction stance.** There is no public correction route by design. Any feedback
  channel on the site is a scope decision, not an optimisation, and it changes what the README
  promises.

## First three steps

1. A (label table, fed by the review queue) and B (finish the worksheet), because everything
   else is measured against them.
2. C (label harness in CI), so the next rubric change is the first one that does not need
   steering.
3. D (scheduled judge), so the site stops waiting for a session.

E, F and G follow once there is something to measure them against.
