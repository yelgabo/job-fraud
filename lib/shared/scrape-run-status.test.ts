import { describe, expect, it } from "vitest"
import { STALE_RUNNING_MS, scrapeRunStatus } from "./scrape-run-status"

const now = new Date("2026-11-08T12:00:00Z")
const ago = (ms: number) => new Date(now.getTime() - ms)

describe("scrapeRunStatus", () => {
  it("shows a recent RUNNING row as running", () => {
    expect(scrapeRunStatus({ outcome: "RUNNING", startedAt: ago(STALE_RUNNING_MS) }, now)).toBe("RUNNING")
  })

  it("does not claim a RUNNING row past three hours is still running", () => {
    expect(scrapeRunStatus({ outcome: "RUNNING", startedAt: ago(STALE_RUNNING_MS + 1) }, now)).toBe(
      "no finish recorded (killed?)",
    )
  })

  it("shows a finished outcome as recorded, however old", () => {
    expect(scrapeRunStatus({ outcome: "PARTIAL", startedAt: ago(10 * STALE_RUNNING_MS) }, now)).toBe("PARTIAL")
  })
})
