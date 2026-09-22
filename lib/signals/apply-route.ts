// Pulls the application route out of a WorkBC posting as structured fields.
//
// The route is the set of ways a posting says to make contact, not just a URL: 1,422 postings
// offer more than one channel and the risky one is often not the first. A judgment about whether
// the route suits the employer reads better from these fields than from the model hunting for
// the "How to apply" block inside 6,000 characters of description.

const BLOCK = /How to apply:?\s*([\s\S]{0,400}?)(?:\n\s*\n|$)/i

const CHANNELS = [
  ["online", /\bonline:\s*([^\n]+)/gi],
  ["email", /\bby email:\s*([^\n]+)/gi],
  ["mail", /\bby mail:\s*([^\n]+)/gi],
  ["phone", /\bby phone:\s*([^\n]+)/gi],
  ["inPerson", /\bin person:\s*([^\n]+)/gi],
  ["fax", /\bby fax:\s*([^\n]+)/gi],
] as const

export type ApplyChannel = (typeof CHANNELS)[number][0]
export type ApplyRoute = Partial<Record<ApplyChannel, string[]>>

/** The posting's "How to apply" section verbatim, or null when it has none. */
export function extractApplyBlock(descriptionMd: string): string | null {
  const m = descriptionMd.match(BLOCK)
  const body = m?.[1]?.trim()
  return body ? body : null
}

/**
 * The channels the posting offers, keyed by kind. A later channel can carry the risk that the
 * first one does not, so every one is kept rather than just the first.
 */
export function parseApplyRoute(descriptionMd: string): ApplyRoute {
  const block = extractApplyBlock(descriptionMd)
  if (!block) return {}
  const out: ApplyRoute = {}
  for (const [kind, re] of CHANNELS) {
    const vals: string[] = []
    // Each entry runs to end of line, but WorkBC often puts several on one line
    // ("By email: a@b.com In person: 1 Main St"), so trim at the next channel label.
    for (const hit of block.matchAll(new RegExp(re.source, "gi"))) {
      const v = hit[1].split(/\b(?:online|by email|by mail|by phone|in person|by fax):/i)[0].trim()
      if (v) vals.push(v)
    }
    if (vals.length) out[kind] = vals
  }
  return out
}
