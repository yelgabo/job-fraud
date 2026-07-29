// Posted-date parsing and display. `Job.postedAt` is a raw String written by two different
// producers, so it cannot be compared or sorted as a date: `lib/workbc/workbc-api.ts` writes an
// ISO `YYYY-MM-DD` prefix, while the HTML fallback parser in `lib/workbc/scrape-workbc.ts` writes
// whatever free text followed "Posted on:" and can write junk. `Job.postedDate` is the parsed,
// indexed DateTime derived from it (see prisma/schema.prisma) and is what the site filters on.
//
// The parser is deliberately strict: anything that does not yield one unambiguous calendar day
// becomes null. Null then means "no usable posted date", and the UI falls back to `scrapedAt`
// while marking the value as an estimate. Guessing a date would publish a wrong fact about a
// posting, so ambiguity always loses.

/** Widest plausible posting year. Anything outside this is junk, not a date. */
const MIN_YEAR = 2000
const MAX_YEAR = 2100

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

// "July 24, 2026" / "Jul 24 2026" / "Sept. 3, 2026" / "August 1st, 2026"
const MONTH_FIRST = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/
// "24 July 2026" / "22nd March 2026"
const DAY_FIRST = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{4})$/
// An ISO date, optionally followed by a time component we ignore.
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/

/**
 * Build a UTC-midnight Date from calendar parts, or null if the parts are not a real date.
 * Rejects roll-over (2026-02-30 becoming March 2) rather than accepting the shifted day.
 */
function utcDay(year: number, month: number, day: number): Date | null {
  if (year < MIN_YEAR || year > MAX_YEAR) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null
  }
  return d
}

/**
 * Parse a raw `Job.postedAt` string into a UTC-midnight Date, or null when it is missing,
 * ambiguous or junk. Handles both producer formats; rejects everything else, including
 * all-numeric slash forms (day/month order is unknowable) and relative text ("2 days ago").
 */
export function parsePostedDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null

  const isoMatch = ISO.exec(s)
  if (isoMatch) return utcDay(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))

  const lower = s.toLowerCase()

  const mf = MONTH_FIRST.exec(lower)
  if (mf) {
    const month = MONTHS[mf[1]]
    return month ? utcDay(Number(mf[3]), month, Number(mf[2])) : null
  }

  const df = DAY_FIRST.exec(lower)
  if (df) {
    const month = MONTHS[df[2]]
    return month ? utcDay(Number(df[3]), month, Number(df[1])) : null
  }

  return null
}

/** The date the UI shows for a posting, and whether it is a real posted date or an estimate. */
export type PostedDisplay = {
  /** `YYYY-MM-DD` in UTC. */
  day: string
  /** True when `postedDate` was null and this is the scrape date standing in for it. */
  estimated: boolean
}

function utcDayString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Resolve the date to show for a posting: the parsed posted date when it exists, otherwise the
 * scrape date flagged as an estimate. Rendering in UTC keeps the day stable regardless of where
 * the page is rendered; for an estimate that is already approximate by definition.
 */
export function effectivePostedDate(job: {
  postedDate: Date | null
  scrapedAt: Date
}): PostedDisplay {
  if (job.postedDate) return { day: utcDayString(job.postedDate), estimated: false }
  return { day: utcDayString(job.scrapedAt), estimated: true }
}

/**
 * Render a `PostedDisplay`. An estimate carries a leading tilde and names its source, so a reader
 * can never mistake it for a date the employer actually published.
 */
export function formatPostedDate(p: PostedDisplay): string {
  return p.estimated ? `~${p.day} (est. from scrape)` : p.day
}

/** `formatPostedDate` with the "posted" prefix, for prose and tooltips. */
export function postedDateLabel(p: PostedDisplay): string {
  return `posted ${formatPostedDate(p)}`
}
