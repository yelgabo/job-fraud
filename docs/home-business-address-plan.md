# Plan: a separate address type for home-based businesses

Status: adopted 2026-10-27 at +25, with the guard requiring both `businessMatch` and `locationMatch` to be `match`. The owner checked both cases: Watts publishes the same address on its own site (home business); Inex Reno has nothing tying it to the address (residential).

## The problem

Any residential mailing address floors a posting's score at 70 (High), whatever else the web check
established (`FLOORS.apply_address_private` in `lib/scoring/weights.ts`). The rule cannot tell a
sole trader who mails from the address it publishes everywhere apart from a posting that sends
applications to an unexplained home.

The two `deep` review requests of 2026-09-24 are the cases. Both were re-investigated by Opus on
2026-10-27 and both remain High (70):

- **Watts Plumbing & Drains Inc** (posting 50251171). Real Victoria plumber, incorporated 2018,
  BBB A+. The mailing address, #415-3277 Quadra St, is the company's own published office on its
  website, BBB and Yellow Pages, and the building is a residential condo block. With the address
  signal removed this posting scores 20.
- **Inex Reno** (posting 50323578). No website, reviews or BC registry record; the address is on a
  street of detached homes with no business listed. This is the case the floor exists for.

## Why the floor exists, and what a change gives up

The site rates whether a posting is a genuine attempt to hire locally (README, "Why these postings
are worth reviewing"). A posting that only accepts paper applications at a home address deters
local applicants whether or not the business behind it is real, and a sham LMIA advertisement can
come from a real small business. So "the business is real" does not answer "is this a real local
hiring effort". The README's own example of High is "mail a résumé to a Surrey apartment".

What the floor gets wrong is narrower: it charges a home-based business the same as an address
nobody can connect to the employer, and the published reasoning ("applications are mailed to a
private home") reads as concealment when the address is the one the business advertises.

## Proposal

1. **New `applicationAddressType` value `home_business`**: the mailing address is a residence, and
   independent sources (the employer's own site, BBB, a business directory) list it as the
   employer's business address. Added to the enum in `lib/shared/json-schemas.ts`, the tool schema
   and prompt in `lib/ai/verify-employer-web.ts`, and the keyless "Agent prompt" in
   `.claude/skills/judge-postings/SKILL.md`. `residential` keeps its meaning for every other home.

2. **Scoring** (`lib/scoring/weights.ts`, `lib/scoring/compose.ts`): a new signal
   `apply_address_home_business` at **+25 with no floor**, plus a `lib/shared/signal-labels.ts`
   entry ("Applications are mailed to the home address the business itself publishes"). It still
   counts against the posting, for the reason above; it no longer forces High.

3. **Guard in the composer**: `home_business` counts as `home_business` only when
   `businessMatch` and `locationMatch` are both `"match"`. Otherwise it is scored as `residential`, floor included, so a
   verifier that over-uses the new value cannot lower the rating of an employer it could not
   verify. Inex Reno (`businessMatch: "uncertain"`) stays High under this rule.

4. **Escalation**: `needsEscalation` also fires on `home_business`, because it is the verdict that
   lowers a rating relative to `residential`:
   Haiku's `home_business` gets an Opus second look, and `tierViolation` makes the keyless apply
   step reject a `home_business` verdict that Opus did not give.

5. **`SCORING_VERSION` to 2**, since the same inputs can now produce different numbers.

6. **Docs and site copy**: `docs/scoring-algorithm.md` (floors), `docs/TECHNICAL_INFO.md`, and the
   README's High bullet, which is live `/about` copy: "mail your application to a private home or
   PO box" becomes "...to a private home or PO box that the business does not publish as its own
   address". `lib/shared/methodology.test.ts` pins caveat wording and will need its expectation
   updated if a pinned sentence moves.

## Effect, measured on today's data

79 employers have a `residential` verdict (all from Opus after the 2026-10-27 cleanup), covering
113 published postings (105 High, 6 Medium, 2 Low) and 32 pending.

Simulated on those 113 with the composer, as if **every** residential verdict became
`home_business`, which is an upper bound:

| Address weight, no floor | High | Medium | Low |
|---|---|---|---|
| Today (+40, floor 70) | 105 | 6 | 2 |
| +40 | 46 | 65 | 2 |
| **+25 (proposed)** | **4** | **97** | **12** |
| +15 | 0 | 100 | 13 |
| 0 | 0 | 52 | 61 |

The real number is smaller, because only employers whose address is independently listed as their
own move. A crude search of the stored summaries for wording like "its own listed address" matched
12 employers (14 postings), and some of those matches mean the opposite. The Opus re-check in the
rollout gives the real count.

At +25, Watts moves from High (70) to Medium (45). A home-based business lands in Medium, "worth a
second look", rather than Low, which matches the "something unusual" definition of Medium.

## Rollout

1. Implement 1 to 6 behind tests: enum and schema, composer guard, escalation, labels, a compose
   test for each of `home_business` with and without `businessMatch: "match"`.
2. Re-check the 79 residential employers with Opus under the new prompt (a mode of
   `npm run recheck-cached-verdicts`, about $17), **dry run first**, writing the proposed verdicts
   to `logs/` only.
3. The owner reviews the employers that move to `home_business` before anything is written.
4. Apply: store the verdicts and re-score their published postings with `rescoreVerdict`
   (`lib/scoring/verdict.ts`). Pending postings pick the verdicts up on the next judge run.
5. Record the counts here and in `docs/scoring-algorithm.md`.

## Decisions for the owner

- Whether to make the change at all, given the cost described under "what a change gives up".
- The weight: +25 keeps a home-based business in Medium; +15 does the same with less margin from
  Low; 0 treats mailing to a published home office as neutral.

There is no labelled evidence on home-based businesses (the 21 labels hold 2 Highs), so the weight
is a judgement, like every other number in `weights.ts`.
