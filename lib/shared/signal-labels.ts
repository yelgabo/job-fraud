// Plain-language rendering of judge-written signal labels.
//
// CONTRACT (do not weaken it): signal labels are free text written by the scoring model, and
// they tend to echo the rubric's internal keys ("web.businessMatch mismatch",
// "generic_email_domain"). This map relabels only the patterns it recognizes, at render time;
// the stored label is never changed. ANY label the map does not recognize renders verbatim,
// so an out-of-vocabulary label degrades to looking internal - it can never be hidden or
// silently dropped. When a new key-shaped label shows up on the site, add a mapping here;
// never "fix" one by filtering it out.
//
// The plain wording must not assert more than the underlying check does. The vocabulary
// sources are the scoring rubric in lib/ai/scoring.ts (web.* keys), the deterministic
// detectors in lib/signals/application-flags.ts (snake_case flags), and
// lib/shared/json-schemas.ts (enum values).

const PLAIN: Record<string, string> = {
  // web verification keys (WebVerificationSchema) with their enum values
  "businessmatch match": "Web search confirms the employer is a real business",
  "businessmatch mismatch": "Web search found a different business than the posting claims",
  "businessmatch uncertain": "Web search could not confirm the employer",
  "locationmatch match": "The employer's real-world location matches the posting",
  "locationmatch mismatch": "The employer's real-world location does not match the posting",
  "locationmatch uncertain": "The employer's location could not be confirmed",
  "hasjobslisting yes": "The employer's own website lists job openings",
  "hasjobslisting no": "No job openings found on the employer's website",
  "hasjobslisting unknown": "Could not check the employer's website for job openings",
  "websitereachable yes": "The employer's website is reachable",
  "websitereachable true": "The employer's website is reachable",
  "websitereachable no": "The employer's website could not be reached",
  "websitereachable false": "The employer's website could not be reached",
  "applicationaddresstype business": "Applications are mailed to a business address",
  "applicationaddresstype residential": "Applications are mailed to a residential address",
  "applicationaddresstype po_box": "Applications are mailed to a PO box",
  "applicationaddresstype virtual": "Applications are mailed to a virtual office or mail-forwarding address",
  // deterministic application flags (lib/signals/application-flags.ts)
  ats_known_provider: "Applies through a recognized hiring system",
  generic_email_domain: "The contact email is a free personal address (Gmail, Outlook, etc.)",
  mail_physical_resume: "Applicants are told to mail a paper résumé",
  whatsapp_telegram_only: "Applications are taken only through WhatsApp or Telegram",
  fee_to_apply: "Applicants are asked to pay a fee",
  id_upfront: "Applicants are asked for ID documents up front",
  crypto_payment: "Payment in cryptocurrency is involved",
  banking_info_upfront: "Applicants are asked for banking details up front",
}

// "web.businessMatch == mismatch" / "businessMatch: mismatch" / "web.hasJobsListing no"
// all normalize to "businessmatch mismatch" / "hasjobslisting no". Underscores are kept so
// the snake_case flags and enum values ("po_box") match exactly.
function normalize(label: string): string {
  return label
    .toLowerCase()
    .replace(/^web\./, "")
    .replace(/[=:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * The label to show for a signal: a plain-language rendering when the label matches a known
 * internal key/value pattern, otherwise the stored label verbatim (see contract above).
 */
export function humanizeSignalLabel(label: string): string {
  return PLAIN[normalize(label)] ?? label
}
