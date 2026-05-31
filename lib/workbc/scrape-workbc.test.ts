import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseListingCards, parseDetail } from "./scrape-workbc"

const FIX = join(process.cwd(), "__fixtures__")
const read = (name: string) => readFileSync(join(FIX, name), "utf8")

describe("parseListingCards (real WorkBC search fixture)", () => {
  const stubs = parseListingCards(read("workbc-search.html"))

  it("extracts job stubs with numeric workbcIds", () => {
    expect(stubs.length).toBeGreaterThan(0)
    expect(stubs.every((s) => /^\d+$/.test(s.workbcId))).toBe(true)
  })

  it("includes a known posting id and a usable source URL", () => {
    const job = stubs.find((s) => s.workbcId === "49600147")
    expect(job).toBeDefined()
    expect(job!.sourceUrl).toContain("job-details/49600147")
  })
})

describe("parseDetail (real WorkBC detail fixtures)", () => {
  it("uses the job-title <h2>, not the boilerplate 'JOB POSTING' <h1>", () => {
    const d = parseDetail(read("detail-49600147.html"))
    expect(d.title.toLowerCase()).toBe("software developer")
    expect(d.title.toLowerCase()).not.toBe("job posting")
  })

  it("extracts employer name from the title→Location gap", () => {
    expect(parseDetail(read("detail-49600147.html")).employerName).toBe("New Global One Data Inc.")
    expect(parseDetail(read("detail-48928106.html")).employerName).toBe("ORX Surgical")
  })

  it("extracts clean location and salary (no leaked CSS/markup)", () => {
    const d = parseDetail(read("detail-49600147.html"))
    expect(d.location).toBe("Surrey")
    expect(d.salary).toContain("$54.40")
    // regression: stripping <style>/<script> contents means no CSS tokens leak into fields
    expect(d.location).not.toMatch(/[{};]/)
    expect(d.salary).not.toMatch(/[{};]/)
  })

  it("produces a description body without the global footer boilerplate", () => {
    const d = parseDetail(read("detail-49600147.html"))
    expect(d.descriptionMd.length).toBeGreaterThan(50)
    expect(d.descriptionMd).not.toContain("JOBS AND CAREERS")
  })

  it("surfaces the 'By mail' application text so the mail flag can fire", () => {
    const d = parseDetail(read("detail-49600147.html"))
    expect(`${d.applyMethodText} ${d.descriptionMd}`.toLowerCase()).toContain("by mail")
  })
})
