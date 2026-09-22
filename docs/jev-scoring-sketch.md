# Sketch: moving stage-2 scoring to Jev

Status: design sketch, nothing implemented. Written 2026-09-21.

Target: `lib/ai/scoring.ts` (the per-posting Haiku call) and the composition step in
`scripts/judge.ts`. Stage 1 (`verifyEmployerWeb`) and the impersonation pre-check are out of
scope; both need web retrieval, which Jev does not do.

## The problem this addresses

`buildPrompt()` in `lib/ai/scoring.ts` asks one model to do three different jobs at once:

1. read the posting text and form judgments about it
2. read the deterministic check values and map them to weights
3. add the weights up and emit a 0-100 score

Only the first is a language task. The second and third are arithmetic over a rubric that is
written out in the prompt, and a model does arithmetic worse than code does, non-deterministically,
and for money.

The cost of that shows up whenever a weight changes. `docs/signal-range-repair.md` records the
September 12 change to the address-risk contribution: the prompt text, the tool JSON schema, the
Zod bound and the tests all had to move together, and the rubric line still only *asks* the model
to respect a floor ("on its own it should push a posting toward the HIGH band"). A prompt cannot
guarantee a floor. Code can.

Splitting the two halves means a weight change becomes a recompute over stored numbers, with no
inference, no spend and no run-to-run drift.

## What moves where

Each line of the current rubric, and where it belongs:

| Current rubric line | Belongs in |
| --- | --- |
| `ats_known_provider` legitimacy | code (already deterministic, `lib/signals/apply-host.ts`) |
| `addressGeocoded` / `addressMatchConfidence` | code (already a boolean and a float in `checks`) |
| `addressMatchesCity` | code |
| `crypto_payment`, `banking_info_upfront` | code (regex flags), with a Jev cross-check |
| `web.businessMatch` / `locationMatch` / `hasJobsListing` | code, over stage-1 output |
| `web.applicationAddressType` | code, over stage-1 output |
| `mail_physical_resume` + software role | code (`categoryForNoc` already gives the role bucket) |
| `generic_email_domain` | code (regex flag), with a Jev cross-check |
| `websiteReachable` | code |
| vague description, urgency, salary outlier, ID upfront, fee to apply | **Jev** |
| detailed responsibilities, named team, real benefits, recognizable employer | **Jev** |

Two of the thirteen lines are language judgments. The rest are `if` statements that are currently
being paid for by the token.

## The question set

Independent judgments over the same state, so they go in one request. `client.systemOne` types each
answer from its own question, so `answers.urgency.score` is a compile error and
`answers.urgency.noul` is not. This snippet typechecks against `@typesafe-ai/sdk` 0.6.0.

```ts
import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk"

const SPECIFICITY = score("How concretely the posting describes the actual work.", [
  "No duties are named at all. The text covers only pay, benefits, or the company in general terms, or runs to a couple of lines.",
  "Duties appear only as generic phrases that would fit almost any job, such as data entry, admin tasks, or assisting the team. No tools, systems, or deliverables are named.",
  "Several specific duties are named, with some tools, systems, or processes, but the day-to-day work is still partly unclear.",
  "Specific duties, the tools or systems used, who the role works with or reports to, and requirements a candidate could be screened against.",
] as const)

const EMPLOYER_SUBSTANTIATION = score(
  "How much checkable detail about the employer the posting text itself carries.",
  [
    "Nothing checkable. The employer is named only in passing, or not at all.",
    "A company name and an industry, with nothing that could be looked up or confirmed.",
    "Some checkable detail, such as a street address, a named team or manager, or a described benefits plan.",
    "Several checkable details, such as a street address, a named hiring contact, a licence or registration number, a union or benefits plan, or a described office and team.",
  ] as const,
)

const PAY_PLAUSIBILITY = score("How the stated pay compares with the duties described.", [
  "Far above what the described duties command, such as a high hourly rate for unskilled or vaguely described work.",
  "Somewhat higher than the described duties would command, with no explanation.",
  "In the normal range for these duties in this labour market.",
  "At or below the normal range for these duties.",
] as const)

const URGENCY = noul(
  "The posting pressures the reader to act or start immediately, for example by saying that positions are filling fast, that hiring is immediate, or that applicants must reply within hours.",
)

const PRE_HIRE_ASK = noul(
  "Before any interview or job offer, the posting asks the applicant to send money, banking details, a void cheque, or government identification, or to pay for training, equipment, or a background check.",
)

const MONEY_HANDLING = noul(
  "The duties involve receiving, holding, forwarding, or converting money, payments, or packages on behalf of the employer or its clients.",
)

const ROLE_COHERENCE = noul(
  "The title, the stated duties, the listed requirements, and the pay describe one coherent job.",
  {
    true: "Each part of the posting fits the others: the duties match the title, the requirements match the duties, and the pay matches the level of work.",
    false: "Parts of the posting contradict each other, for example an entry-level title with senior duties, or clerical duties with a professional salary.",
  },
)

const CONTACT_CHANNEL = choice("How the posting tells an applicant to make contact.", {
  ats_or_portal: "Through an applicant tracking system or a company careers portal.",
  employer_domain_email: "By email at a domain that belongs to the employer being advertised.",
  free_consumer_email: "By email at a free consumer provider such as Gmail, Outlook, Yahoo, or Proton.",
  messaging_app: "Through a messaging app such as WhatsApp, Telegram, or Signal, or by text message.",
  phone_only: "By telephone only.",
  postal_mail: "By posting or dropping off physical documents at an address.",
  in_person: "By attending in person at a stated place and time.",
  not_stated: "The posting does not say how to make contact.",
})
```

State is a named JSON object, not a prose blob:

```ts
const state = {
  title: job.title,
  employer: job.employer?.nameDisplay ?? null,
  location: job.location,
  salary: job.salary,
  description: job.descriptionMd,
}
```

`payPlausibility` is only worth asking when `job.salary` is set, so code builds the question map:

```ts
const questions = state.salary ? { ...base, payPlausibility: PAY_PLAUSIBILITY } : base
```

Three things are deliberately absent. `is_software_role` stays with `categoryForNoc` because NOC
already answers it. `applicationAddressType` stays in stage 1 because it needs search results. And
there is no "overall fraud score" question, because a single opaque 0-100 from a model is the thing
this design is getting rid of.

`moneyHandling` is new. Reshipping and payment-forwarding roles are the classic mule shape and no
regex in `lib/signals/application-flags.ts` catches them.

## Composition

Store the answers raw, derive everything else:

```ts
type Judgments = {
  specificity: number        // 0..1
  substantiation: number     // 0..1
  payPlausibility: number | null
  urgency: number            // probability
  preHireAsk: number
  moneyHandling: number
  roleCoherence: number
  contactChannel: string
  contactConfidence: number
}
```

Scores normalise by dividing by the top rubric index (`answers.specificity.score / 3`). Nouls are
probabilities already. Code turns those into weighted `Signal[]` entries in the existing
`[-30, +45]` integer range, appends the deterministic signals, sums, clamps to 0-100, and runs
`bandFor()` exactly as today. The stored shape of `Job.fraudScore` / `riskBand` / `signals` does not
change, so `components/JobReport.tsx` and every page keep working.

Two composition rules the current prompt cannot enforce:

**Floors are code, not prose.** After the weighted sum, apply overrides:
`web.applicationAddressType` in `{residential, po_box, virtual}` floors the score at 70.
`preHireAsk > 0.8` floors it at 70. A weighted sum is right for compensating preferences and wrong
for "any serious violation", and the address-type line in the current prompt is exactly the second
kind wearing the clothes of the first.

**A split noul is not half a violation.** `preHireAsk` at 0.5 does not mean the posting half-asks
for banking details; it means Jev genuinely cannot tell. Half-weighting it is the wrong answer.
Route those to the existing `JudgeRequest` queue with `kind: "deep"` instead. Same for a
`contactChannel` whose `choice` disagrees with the deterministic `generic_email_domain` flag: the
regex and the model disagreeing is a review signal, not an averaging problem.

## What Jev will not give you

Jev returns typed answers and probabilities. It does not generate text. Two fields depend on that.

**`reasoning`** is rendered as prose at `components/JobReport.tsx:120`. Options, in order of
preference:

1. Keep a Haiku call for prose only, fed the composed signal list rather than the full posting.
   Short input, short output, and it only needs to run for medium and high band postings, since
   nobody reads the reasoning on a low-risk listing.
2. Template it in code from the top three signals. Free and deterministic; reads flatly.
3. Drop the field and let the signal bars speak.

**`Signal.evidence`** is a quoted snippet today. For deterministic signals it already comes from the
regex match or the check value, so nothing changes. For Jev-derived signals the natural substitute
is the rubric level the answer landed on, available as `answers.specificity.legend[Math.round(score)]`.
That is a real change in what the field means and it should be an explicit decision, not a silent
one. If quoted snippets matter, a second Jev pass over the description's sentences (the
line-by-line search pattern) can pick the supporting one, at roughly the cost of the first pass.

## Cost

Estimated from character counts in the current code, not measured. Haiku 4.5 is $1.00/MTok in and
$5.00/MTok out. Jev 1.13 is $0.042/MTok in with output free.

| | input tokens | output tokens | per posting |
| --- | --- | --- | --- |
| today, `scoreJob` | ~2,850 | ~550 | ~$0.0056 |
| Jev question set | ~2,650 | 0 | ~$0.00011 |

Roughly fifty to one on stage 2, or $5.60 against $0.11 per thousand postings. Worth stating
plainly: stage 1's `web_search` verification is the expensive part of a run and this sketch does not
touch it, so the headline saving is smaller than the ratio suggests. The reason to do this is that
reweighting stops costing an inference pass at all, not the per-call price.

## Validation before switching

`scripts/compare-judge.ts` is already the read-only A/B pattern. Add the same shape for this:
score postings that already have `scoredAt` set through the Jev path, write nothing, and report band
agreement and rank correlation against the stored scores. Postings where the two disagree by a band
are the interesting set and should be read by hand before any threshold is fixed.

Weights and floors in this sketch are placeholders. They get set from that comparison, on real
postings, not copied from the current prompt's ranges.

## Open questions

- Does the weighted sum reproduce the current band distribution closely enough that the archive
  stays comparable, or does switching mean accepting a discontinuity in the data?
- Should the raw judgments be a new `Job.judgments` JSON column, or a separate table so a reweight
  can be versioned and rolled back?
- `TYPESAFE_API_KEY` is a second provider credential in `.env` and on Railway. Worth it for
  stage 2 alone, or only if stage 1's verdict classification moves too?
