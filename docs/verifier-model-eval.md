# Which model should verify employers

Run 2026-10-26, before judging the 5,263-posting backlog. The question: on the keyless path
(`judge-keyless:fetch`, agents, `judge-keyless:apply`), which model's employer verdicts are good enough, and at
what cost. Opus 5.5 was the reference.

## Method

The 21 labelled postings in `docs/labelset.md`, in the `judge-keyless:fetch` batch format (two batches of
11 and 10), went to agents running Haiku 5.5, Sonnet 5.5 and Opus 5.5 with the agent prompt from
`.claude/skills/judge-postings/SKILL.md` unchanged. Each model's `web` verdicts replaced the
fixture's stored ones (`lib/eval/__fixtures__/labelled-evidence.json`), and the composer scored
them against the human labels with the same Jev judgments. "Stored" is the verdict already in
the database, written by the API path on Haiku 4.5.

## Result

| Verifier | Labels agree | High caught | Bands equal to Opus | Tokens for 21 postings | Web searches |
|---|---|---|---|---|---|
| Stored (API, Haiku 4.5) | 19/21 | 0/2 | 20/21 | n/a | n/a |
| Haiku 5.5 | 19/21 | 1/2 | 20/21 | 146.6k | 25 |
| Sonnet 5.5 | 19/21 | 0/2 | 20/21 | 116.4k | 9 |
| Opus 5.5 | **20/21** | **1/2** | 21/21 | 134.1k | 22 |
| Haiku 5.5, alarming verdicts re-checked by Opus | **20/21** | **1/2** | 21/21 | Haiku + 2 of 21 on Opus | |

What decided it was two postings:

- **#4 Megacity Construction** (labelled high). Haiku and Opus both found that the mailing
  address, 3444 Caldera Court in Langford, is a detached house listed for sale, which floors the
  score at 70. Sonnet called it `uncertain` and scored the posting 40, lower than the stored 65.
- **#5 Geoswift** (labelled medium). Opus and the stored verdict found a real Vancouver payments
  company. Haiku found nothing and answered `businessMatch: mismatch`, which scored 85, a High
  rating on a real employer. That is the error this site can least afford.

Sonnet's second batch ran 1 web search for 10 employers, so its verdicts there rest mostly on
what it already knew; its many `uncertain` answers are safe (neutral in the composer) but miss
the signal that matters. #18 (Thai Green Elephant, the immigration-broker case) is missed by
every verifier, as expected: nothing a verifier returns covers it.

## Cost

Token counts were close across models, so price per token decides. At API rates (input $/M:
Haiku 5.5 $0.10, Sonnet 5.5 $2, Opus 5.5 $4; output 5x) and counting every token at the input
rate, which is a lower bound, one posting cost about $0.0007 on Haiku, $0.011 on Sonnet and
$0.026 on Opus. The hybrid escalates when Haiku returns `businessMatch` or `locationMatch`
`mismatch`, or a residential, P.O. box or virtual address, which was 2 of 21 here: about $0.003
per posting. On a subscription these are usage, not dollars, but the ratios hold.

## Recommendation

Haiku first, Opus for any alarming verdict. Its accuracy matched Opus on this set at roughly an
eighth of the cost, and the escalation rule targets the exact failure Haiku showed: a confident
`mismatch` that would publish a High rating. Verify per employer, not per posting (599 of the
1,620 backlog employers have no cached verdict), which cuts the work by about two thirds before
any model choice.

## API run, 10 employers (2026-10-27)

`npm run compare-verifiers -- --employers 10` ran the API path (`verifyEmployerWeb`, the same
request `npm run judge` sends) on the first 10 employers a judge run would verify, with each model,
and logged the billed tokens and searches. Opus 5.5 is the reference.

| Model | Cost per employer | Same alarm call as Opus | Searches | Median time |
|---|---|---|---|---|
| Haiku 4.5 (the production verifier until this run) | $0.084 | 8/10 | 33 | 10 s |
| Haiku 5.5 | $0.032 | 10/10 | 27 | 7 s |
| Opus 5.5 | $0.193 | reference | 35 | 21 s |

Haiku 4.5's two misses were the same kind of error as the agent run's Geoswift: it called Peter
Lucas Project Management (Saskatoon) and Auvik Networks (Waterloo) a location mismatch because their
head offices are outside BC, which adds risk to real employers that hire in BC. Haiku 5.5 answered
`uncertain` on Auvik, which adds nothing. On Haiku 5.5 about 85% of the cost is the search fee
($10 per 1,000), not tokens, so the five-searches-per-employer cap is now the bigger cost lever.

## 1,000 pending postings, agent run (2026-10-27)

The next 1,000 pending postings came from 433 employers. 340 reused a cached verdict or were
presumed legitimate, so only 93 employers (113 postings) needed a web check; grouping by employer
saves more than any model choice. All 93 were verified by Opus and by Haiku helper agents with the
skill's prompt, and every posting was composed with the same Jev answers. Opus is the reference.
(Haiku's batches 3 to 5 first hit Claude Code's 200-search session cap and were rerun after it
refilled; 2 of Haiku's 93 verdicts failed validation.)

| Verifier | Same band as Opus (all 1,000) | Same band, checked employers' postings | Tokens, agent run |
|---|---|---|---|
| Haiku alone | 998 | 111/113 | 477k |
| Haiku, escalating alarming verdicts only (3 escalated) | 999 | 112/113 | ~492k |
| **Haiku, also escalating an `uncertain` mailing address (9 escalated)** | **1,000** | **113/113** | ~521k |
| Opus | reference | reference | 449k |

At list input prices that is about $0.22 for the tiered check against $1.79 for Opus. The two
cases that decided the rule:

- **Mellenger Interactive**: Haiku called a real Vancouver agency's office residential (a false High,
  80). Escalation sent it to Opus, which found the business address. Alarm escalation works.
- **Timberdale Supply**: Opus found the mailing address is a house (High, 70); Haiku said
  `uncertain`, which is not alarming, so the first rule never escalated it and it scored Low.
  Escalating an `uncertain` address on a posting that mails applications (6 of the 18 such
  employers here) closed that gap. This is `needsEscalation`.

## Decision

Adopted 2026-10-27: both judge paths verify employers with Haiku 5.5 and re-check with Opus 5.5
whenever `needsEscalation` says so (`verifyEmployerTiered` in the API judge; step 3b of the
judge-postings skill in the keyless judge, enforced by `judge-keyless:apply`). The full 93-employer API comparison has not been run; when it is, it shows how often the
escalation fires, which these 10 could not (none were alarming).

## Limits

21 postings, 2 of them high, one run per model. Agents are not deterministic, so a rerun could
move any row by one. The token counts include each agent's fixed overhead (system prompt, tool
definitions), which favours larger batches. This picks a default; it does not certify one.
Re-run with more labels (`docs/labelset.md` has 59 blank) before relying on the margins.
