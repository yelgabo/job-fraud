import { describe, expect, it } from "vitest"
import { STALE_RUNNING_MS, runStatus } from "./run-status"

const now = new Date("2026-11-08T12:00:00Z")
const ago = (ms: number) => new Date(now.getTime() - ms)

describe("runStatus", () => {
  it("shows a recent RUNNING row as running", () => {
    expect(runStatus({ outcome: "RUNNING", startedAt: ago(STALE_RUNNING_MS) }, now)).toBe("RUNNING")
  })

  it("does not claim a RUNNING row past three hours is still running", () => {
    expect(runStatus({ outcome: "RUNNING", startedAt: ago(STALE_RUNNING_MS + 1) }, now)).toBe(
      "no finish recorded (killed?)",
    )
  })

  it("shows a finished outcome as recorded, however old", () => {
    expect(runStatus({ outcome: "PARTIAL", startedAt: ago(10 * STALE_RUNNING_MS) }, now)).toBe("PARTIAL")
  })
})
