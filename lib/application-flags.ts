export type ApplicationFlag = { flag: string; evidence: string }

type Detector = { flag: string; patterns: RegExp[] }

const DETECTORS: Detector[] = [
  {
    flag: "mail_physical_resume",
    patterns: [
      /\b(mail|send|drop\s*off|deliver)\b[^.]{0,80}\b(resume|cv|cover\s*letter)\b[^.]{0,80}\b(po\s*box|p\.?\s*o\.?\s*box|street|avenue|ave\.?|road|rd\.?|address)\b/i,
      /\bin\s*person\b[^.]{0,40}\b(resume|application|cv)\b/i,
      /\bmail\s+(your\s+)?(resume|cv|application)\b/i,
      // WorkBC phrasing: "How to apply — By mail: <street address / room / postal code>".
      // No "resume" token appears, so the patterns above miss it; match the mailing address itself.
      /\bby\s+mail\b[:\-\s][^.]{0,100}\b(po\s*box|p\.?\s*o\.?\s*box|street|avenue|ave\.?|road|rd\.?|drive|blvd|boulevard|room|suite|unit|[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d)\b/i,
    ],
  },
  {
    flag: "whatsapp_telegram_only",
    patterns: [
      /\b(whats\s*app|whatsapp|telegram|signal)\b[^.]{0,60}\b(only|to\s+apply|application|contact)\b/i,
      /\bapply\b[^.]{0,40}\b(whats\s*app|telegram|signal|sms|text\s+message)\b/i,
    ],
  },
  {
    flag: "generic_email_domain",
    patterns: [
      /\b[\w.+-]+@(gmail|yahoo|hotmail|outlook|aol|icloud|protonmail|yandex)\.[a-z.]{2,10}\b/i,
    ],
  },
  {
    flag: "fee_to_apply",
    patterns: [
      /\b(application|registration|training|equipment|processing)\s+fee\b/i,
      /\bpay\b[^.]{0,30}\b(fee|deposit|upfront)\b/i,
      /\bcandidates?\s+(must\s+)?pay\b/i,
    ],
  },
  {
    flag: "id_upfront",
    patterns: [
      /\b(send|provide|submit)\b[^.]{0,40}\b(sin|social\s+insurance|passport|driver'?s?\s*license|government\s*id)\b/i,
      /\b(sin|passport|government\s*id)\b[^.]{0,40}\b(before|prior\s*to)\b[^.]{0,40}\b(interview|hire)/i,
    ],
  },
]

export function detectFlags(text: string): ApplicationFlag[] {
  const hits: ApplicationFlag[] = []
  const seen = new Set<string>()
  for (const d of DETECTORS) {
    for (const p of d.patterns) {
      const m = text.match(p)
      if (m) {
        if (seen.has(d.flag)) continue
        seen.add(d.flag)
        const evidence = m[0].replace(/\s+/g, " ").trim().slice(0, 200)
        hits.push({ flag: d.flag, evidence })
        break
      }
    }
  }
  return hits
}
