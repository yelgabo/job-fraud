import { z } from "zod"

const DEFAULT_SEARCH_URL =
  "https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-search;search=software;pagesize=50;"

/** Build a WorkBC search URL for a single free-text term and (1-based) results page. */
export function searchUrlForTerm(term: string, page = 1): string {
  const base = `https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-search;search=${encodeURIComponent(
    term,
  )};pagesize=50;`
  return page > 1 ? `${base}page=${page};` : base
}

const webSchema = z.object({
  DATABASE_URL: z.string().min(1),
  WORKBC_SEARCH_URL: z.string().url().default(DEFAULT_SEARCH_URL),
  // Optional comma-separated list of search terms. When set (and online), the scraper queries
  // each term and merges/dedupes results by workbcId — the WorkBC SPA only renders ~20 cards
  // per query, so multiple terms are how we reach a larger corpus.
  WORKBC_SEARCH_TERMS: z.string().optional(),
  NOMINATIM_USER_AGENT: z.string().min(1).default("job-fraud/0.1 (github.com/yelnil)"),
  // Secret path segment for the unlinked /audit/<token> web-search audit UI. When unset, the
  // audit pages 404 entirely (deny by default). Not in .env.example on purpose — set per-deploy.
  AUDIT_TOKEN: z.string().min(1).optional(),
})

const scrapeSchema = webSchema.extend({
  ANTHROPIC_API_KEY: z.string().min(1),
})

export const webEnv = webSchema.parse(process.env)

export function loadScrapeEnv() {
  return scrapeSchema.parse(process.env)
}

export type WebEnv = z.infer<typeof webSchema>
export type ScrapeEnv = z.infer<typeof scrapeSchema>
