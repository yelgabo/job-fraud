// Produces the text judgments that lib/scoring/compose.ts consumes, using TypeSafe's Jev.
// Jev answers typed questions about the posting text; it never sees the deterministic checks
// and never returns a score. Everything numeric happens in the composer.
//
// The question set is the one measurement kept (docs/scoring-algorithm.md, stage 2). Each
// question earned its place by separating bands before it was given a weight; the first set
// asked seven questions of which four were flat and one ran backwards.

import { TypeSafeClient, noul, score } from "@typesafe-ai/sdk"
import type { Judgments } from "../scoring/compose"

/** State shape A from addendum 6: the description alone, no pre-parsed apply block. */
export type PostingState = {
  title: string
  employer: string | null
  location: string | null
  salary: string | null
  description: string
}

/** Description characters sent to Jev. Measured at this length; shorter narrowed the margin. */
export const DESCRIPTION_CHARS = 6000

export const QUESTIONS = {
  // The other half of the impersonation judgment: not whether the channel is a free mailbox,
  // which a regex already answers, but whether it is the channel this employer would use.
  routePlausibleForEmployer: noul(
    "The way this posting says to apply is what an employer of this kind and size would genuinely use for this role.",
    {
      true: "The application route fits the employer: a careers portal or company-domain address for a large organisation, or a direct phone, email, or walk-in for a small local business.",
      false: "The route does not fit the employer named, for example a national chain or a professional firm taking applications only at a free consumer mailbox, a messaging app, or a private home address.",
    },
  ),

  // The high band is full of private households and one-person "companies". The posting text
  // says which it is more directly than any check does.
  employerIsOrganisation: noul(
    "The employer is a registered business or institution rather than a private individual, a family, or a household.",
    {
      true: "A company, franchise, agency, school, hospital, or similar organisation is doing the hiring.",
      false: "A private person or household is doing the hiring, for example a family seeking a caregiver or an individual named as the employer.",
    },
  ),

  // An ordinary employer routing its hiring through an immigration consultancy, which a keyword
  // on "immigration" cannot separate from an immigration firm hiring its own staff. Stored,
  // not weighted: n = 8 at the time of writing.
  brokerRouting: noul(
    "Applications for this job are handled by a third party whose business is immigration, LMIA, or visa services, rather than by the employer that would actually employ the worker.",
    {
      true: "The contact or application route belongs to an immigration consultancy, LMIA agent, or visa service acting for a different employer, for example a restaurant or a household.",
      false: "The employer handles its own applications, including an immigration firm hiring staff for itself.",
    },
  ),

  // Borrowing a brand only pays if the brand is worth borrowing, so prominence is half of the
  // impersonation judgment. Stored as context, never weighted: the medium band IS big brands.
  brandProminence: score("How widely known is the employer named in this posting?", [
    "Not a recognisable business name. It reads as a private individual, a household, or a name with no presence beyond this posting.",
    "A small local business: one location, known only in its own town or neighbourhood.",
    "An established regional or provincial business, or a mid-sized company in its industry.",
    "A nationally or internationally known brand that most people would recognise by name.",
  ] as const),

  // Tail insurance: flat on this corpus because WorkBC moderation holds, kept because it is the
  // only cover for what would matter most if that lapsed.
  askBeforeHire: noul(
    "Before any interview or job offer, the posting asks the applicant to send money, banking details, a void cheque, or government identification, or to pay for training, equipment, or a background check.",
  ),
}

export type JudgeTextResult = {
  judgments: Judgments
  usage: { inputTokens: number; outputTokens: number }
}

export async function judgeText(client: TypeSafeClient, posting: PostingState): Promise<JudgeTextResult> {
  const { answers, usage } = await client.systemOne({
    state: { ...posting, description: posting.description.slice(0, DESCRIPTION_CHARS) },
    questions: QUESTIONS,
  })
  return {
    judgments: {
      routePlausibleForEmployer: answers.routePlausibleForEmployer.noul,
      employerIsOrganisation: answers.employerIsOrganisation.noul,
      brokerRouting: answers.brokerRouting.noul,
      brandProminence: answers.brandProminence.score,
      askBeforeHire: answers.askBeforeHire.noul,
    },
    usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
  }
}

/**
 * The one predicate for whether stage 2 asks Jev: a non-empty TYPESAFE_API_KEY. Without it the
 * composer runs on deterministic evidence alone and the row is stored with `judgments = null`.
 */
export function jevClientFromEnv(env: Record<string, string | undefined> = process.env): TypeSafeClient | null {
  const apiKey = env.TYPESAFE_API_KEY?.trim()
  if (!apiKey) return null
  // Long judge runs ride out rate limits on the SDK's own backoff; concurrency is capped upstream.
  return new TypeSafeClient({ apiKey, retry: { maxRetries: 4 }, timeout: 30_000 })
}
