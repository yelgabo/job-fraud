import { z } from "zod"

const DEFAULT_SEARCH_URL =
  "https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-search;search=software;pagesize=50;"

const webSchema = z.object({
  DATABASE_URL: z.string().min(1),
  WORKBC_SEARCH_URL: z.string().url().default(DEFAULT_SEARCH_URL),
  NOMINATIM_USER_AGENT: z.string().min(1).default("job-fraud/0.1 (github.com/yelnil)"),
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
