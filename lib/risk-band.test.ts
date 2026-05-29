import { describe, it, expect } from "vitest"
import { bandFor } from "./risk-band"

describe("bandFor", () => {
  it("maps a negative (scoring-failed) score to unknown", () => {
    expect(bandFor(-1)).toBe("unknown")
  })

  it("maps the documented thresholds (low <30, medium 30-69, high >=70)", () => {
    expect(bandFor(0)).toBe("low")
    expect(bandFor(29)).toBe("low")
    expect(bandFor(30)).toBe("medium")
    expect(bandFor(69)).toBe("medium")
    expect(bandFor(70)).toBe("high")
    expect(bandFor(100)).toBe("high")
  })
})
