import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseChecks, parseFlags } from "../shared/json-schemas"
import type { Judgments } from "../scoring/compose"
import type { Category } from "../signals/job-category"
import type { EvalCase } from "./agreement"

export const FIXTURE_PATH = join(__dirname, "__fixtures__", "labelled-evidence.json")

export type FixtureCase = EvalCase & {
  /** "stored" = read from Job.judgments; "jev" = asked at snapshot time; null = none. */
  judgmentsSource: "stored" | "jev" | null
  /** What lib/ai/verify-employer-web.ts is given, so a verifier model can be re-run offline. */
  verifyInput: {
    employerName: string
    jobTitle: string
    location: string | null
    descriptionExcerpt: string
    applicationText: string
  } | null
}

export type Fixture = { snapshotAt: string; cases: FixtureCase[] }

/** Re-validates checks and flags through the production schemas, so a stale shape fails loudly. */
export function loadFixture(path = FIXTURE_PATH): Fixture {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Fixture
  return {
    snapshotAt: raw.snapshotAt,
    cases: raw.cases.map((c) => ({
      ...c,
      checks: parseChecks(c.checks),
      flags: parseFlags(c.flags),
      category: c.category as Category,
      judgments: c.judgments as Judgments | null,
    })),
  }
}
