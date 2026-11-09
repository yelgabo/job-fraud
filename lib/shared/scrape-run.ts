// The ScrapeRun record, so a scrape's outcome survives the process the way a judge run's does.
import type { ScrapeRunOutcome } from "@prisma/client"
import { prisma } from "../db"

export type ScrapeCounts = { listed: number; toFetch: number; written: number; sentBack: number; failed: number }

export function scrapeOutcome(c: ScrapeCounts, crashed: boolean): Exclude<ScrapeRunOutcome, "RUNNING"> {
  if (crashed || c.listed === 0) return "FAILED"
  if (c.toFetch > 0 && c.written === 0) return "FAILED"
  return c.failed > 0 ? "PARTIAL" : "OK"
}

export async function startScrapeRun(argv: string[]): Promise<string> {
  const run = await prisma.scrapeRun.create({ data: { args: argv.join(" ") } })
  return run.id
}

/** Records how the run ended and returns the outcome; the caller exits nonzero on FAILED. */
export async function finishScrapeRun(id: string, counts: ScrapeCounts, crash?: string): Promise<ScrapeRunOutcome> {
  const outcome = scrapeOutcome(counts, crash !== undefined)
  const note = crash !== undefined ? `threw: ${crash.slice(0, 300)}` : counts.listed === 0 ? "the search returned no postings" : null
  await prisma.scrapeRun.update({ where: { id }, data: { ...counts, finishedAt: new Date(), outcome, note } })
  return outcome
}
