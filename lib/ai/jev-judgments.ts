// Produces the text judgments that lib/scoring/compose.ts consumes, using TypeSafe's Jev.
// Jev answers typed questions about the posting text; it never sees the deterministic checks
// and never returns a score. Everything numeric happens in the composer.

import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk"
import type { Judgments } from "../scoring/compose"

export type PostingState = {
  title: string
  employer: string | null
  location: string | null
  salary: string | null
  description: string
}

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

// Deliberately internal consistency rather than market rates: asking whether pay matches the
// described skill level is a reading judgment, where asking what the job "should" pay in BC
// would be a domain fact Jev has no reliable source for.
const PAY_PLAUSIBILITY = score("How the stated pay compares with the skill level the duties describe.", [
  "Far above what these duties imply, such as a high rate for unskilled or vaguely described work.",
  "Somewhat higher than these duties imply, with no explanation in the posting.",
  "Consistent with the skill level the duties describe.",
  "At or below what these duties imply.",
] as const)

const URGENCY = noul(
  "The posting pressures the reader to act or start immediately, for example by saying that positions are filling fast, that hiring is immediate, or that applicants must reply within hours.",
)

const PRE_HIRE_ASK = noul(
  "Before any interview or job offer, the posting asks the applicant to send money, banking details, a void cheque, or government identification, or to pay for training, equipment, or a background check.",
)

// Ordinary cash handling by a cashier, server or store manager is not this signal. What matters
// is money or goods moving through the worker's own accounts or home, which is the mule pattern.
const MONEY_HANDLING = noul(
  "The worker would move money or goods through their own personal bank account, payment app, or home address: receiving funds and forwarding them on, withdrawing and resending payments, buying gift cards for the employer, or accepting parcels at home and reshipping them.",
  {
    true: "The posting describes funds or parcels passing through the worker's own account, card, or home address on their way somewhere else.",
    false: "Any money handling described is ordinary work on the employer's own premises or systems, such as operating a till, taking customer payments, running payroll, or managing a budget.",
  },
)

const ROLE_COHERENCE = noul(
  "The title, the stated duties, the listed requirements, and the pay describe one coherent job.",
  {
    true: "Each part of the posting fits the others: the duties match the title, the requirements match the duties, and the pay matches the level of work.",
    false: "Parts of the posting contradict each other, for example an entry-level title with senior duties, or clerical duties with a professional salary.",
  },
)

export const CONTACT_CHANNEL = choice("How the posting tells an applicant to make contact.", {
  ats_or_portal: "Through an applicant tracking system or a company careers portal.",
  employer_domain_email: "By email at a domain that belongs to the employer being advertised.",
  free_consumer_email: "By email at a free consumer provider such as Gmail, Outlook, Yahoo, or Proton.",
  messaging_app: "Through a messaging app such as WhatsApp, Telegram, or Signal, or by text message.",
  phone_only: "By telephone only.",
  postal_mail: "By posting or dropping off physical documents at an address.",
  in_person: "By attending in person at a stated place and time.",
  not_stated: "The posting does not say how to make contact.",
})

export type JudgeTextResult = {
  judgments: Judgments
  contactChannel: string
  contactConfidence: number
  usage: { inputTokens: number; outputTokens: number }
}

export async function judgeText(client: TypeSafeClient, posting: PostingState): Promise<JudgeTextResult> {
  const base = {
    specificity: SPECIFICITY,
    employerSubstantiation: EMPLOYER_SUBSTANTIATION,
    urgency: URGENCY,
    preHireAsk: PRE_HIRE_ASK,
    moneyHandling: MONEY_HANDLING,
    roleCoherence: ROLE_COHERENCE,
    contactChannel: CONTACT_CHANNEL,
  }

  if (posting.salary) {
    const { answers, usage } = await client.systemOne({
      state: posting,
      questions: { ...base, payPlausibility: PAY_PLAUSIBILITY },
    })
    return {
      judgments: {
        specificity: answers.specificity.score,
        employerSubstantiation: answers.employerSubstantiation.score,
        payPlausibility: answers.payPlausibility.score,
        urgency: answers.urgency.noul,
        preHireAsk: answers.preHireAsk.noul,
        moneyHandling: answers.moneyHandling.noul,
        roleCoherence: answers.roleCoherence.noul,
      },
      contactChannel: answers.contactChannel.choice,
      contactConfidence: answers.contactChannel.confidence,
      usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
    }
  }

  const { answers, usage } = await client.systemOne({ state: posting, questions: base })
  return {
    judgments: {
      specificity: answers.specificity.score,
      employerSubstantiation: answers.employerSubstantiation.score,
      payPlausibility: null,
      urgency: answers.urgency.noul,
      preHireAsk: answers.preHireAsk.noul,
      moneyHandling: answers.moneyHandling.noul,
      roleCoherence: answers.roleCoherence.noul,
    },
    contactChannel: answers.contactChannel.choice,
    contactConfidence: answers.contactChannel.confidence,
    usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
  }
}
