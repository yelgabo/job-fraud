import { describe, it, expect } from "vitest"
import { WARM_PATHS, MAX_WARM_PATHS } from "./warm-targets"

describe("WARM_PATHS", () => {
  it("stays within the warm-cycle cap", () => {
    expect(WARM_PATHS.length).toBeGreaterThan(0)
    expect(WARM_PATHS.length).toBeLessThanOrEqual(MAX_WARM_PATHS)
  })

  it("contains only unique site-relative paths", () => {
    expect(new Set(WARM_PATHS).size).toBe(WARM_PATHS.length)
    for (const p of WARM_PATHS) expect(p).toMatch(/^\//)
  })

  it("covers page 1 of every band tab, every posted window, and the companies list", () => {
    expect(WARM_PATHS).toContain("/")
    for (const band of ["high", "medium", "low"]) expect(WARM_PATHS).toContain(`/?band=${band}`)
    for (const days of ["7", "30", "90"]) expect(WARM_PATHS).toContain(`/?posted=${days}`)
    expect(WARM_PATHS).toContain("/companies")
    // Page 1 only: warming deeper pages or filter cross products recreates the load problem.
    for (const p of WARM_PATHS) expect(p).not.toMatch(/page=/)
  })
})
