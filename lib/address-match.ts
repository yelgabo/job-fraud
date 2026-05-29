// Deferred-from-v1 signal: does the employer's claimed city actually appear in the
// address Nominatim resolved it to? A "no" means the geocoder placed the address somewhere
// other than the city the posting claims — a soft fraud signal. Pure functions, no I/O.

const NOISE =
  /\b(room|suite|unit|floor|apt|apartment|po\s*box|street|st|avenue|ave|road|rd|drive|dr|blvd|boulevard|way|lane|ln|court|ct|place|pl|virtual|job|based|in|on|onsite|on-site|remote|hybrid|canada|british|columbia|ontario|alberta|quebec|manitoba|saskatchewan)\b/gi

/** Best-effort extraction of the locality (city) name from a free-form location/address string. */
export function extractCity(loc: string | null | undefined): string | null {
  if (!loc) return null
  let s = loc
    .replace(/[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d/g, " ") // Canadian postal codes
    .replace(/\d+/g, " ") // street numbers
    .replace(/,/g, " , ")
  s = s.replace(NOISE, " ").replace(/[.,;:]/g, " ").replace(/\s+/g, " ").trim()
  const words = s.split(" ").filter(Boolean)
  if (words.length === 0) return null
  return words.slice(0, 2).join(" ").toLowerCase()
}

/**
 * true  → the claimed city appears in the resolved address (consistent)
 * false → claimed and resolved disagree (soft fraud signal)
 * null  → not enough information to compare (neutral)
 */
export function cityMatches(claimed: string | null | undefined, resolved: string | null | undefined): boolean | null {
  const city = extractCity(claimed)
  if (!city || !resolved) return null
  const r = resolved.toLowerCase()
  return city.split(" ").some((w) => w.length >= 4 && r.includes(w))
}
