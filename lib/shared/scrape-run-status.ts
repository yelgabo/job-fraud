import type { ScrapeRun } from "@prisma/client"

// A process killed before finishScrapeRun (lib/shared/scrape-run.ts) leaves its row RUNNING
// forever, with nothing else to mark it dead. Three hours is the owner's bound for "too long to
// still be running".
export const STALE_RUNNING_MS = 3 * 60 * 60 * 1000

export function scrapeRunStatus(run: Pick<ScrapeRun, "outcome" | "startedAt">, now: Date): string {
  if (run.outcome === "RUNNING" && now.getTime() - run.startedAt.getTime() > STALE_RUNNING_MS) {
    return "no finish recorded (killed?)"
  }
  return run.outcome
}
