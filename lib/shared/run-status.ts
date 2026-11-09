// A process killed outright (out of memory, a redeploy) runs no catch, so its JudgeRun or ScrapeRun
// row stays RUNNING forever with nothing else to mark it dead. Three hours is the owner's bound for
// "too long to still be running"; a weekly run takes well under one.
export const STALE_RUNNING_MS = 3 * 60 * 60 * 1000

export function runStatus(run: { outcome: string; startedAt: Date }, now: Date): string {
  if (run.outcome === "RUNNING" && now.getTime() - run.startedAt.getTime() > STALE_RUNNING_MS) {
    return "no finish recorded (killed?)"
  }
  return run.outcome
}
