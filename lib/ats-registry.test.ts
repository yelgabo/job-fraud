import { describe, it, expect } from "vitest"
import { classifyHost, isKnownAts } from "./ats-registry"

describe("classifyHost", () => {
  it("recognizes known ATS hosts", () => {
    expect(classifyHost("acme.myworkdaysite.com")).toBe("workday")
    expect(classifyHost("acme.wd5.myworkdayjobs.com")).toBe("workday")
    expect(classifyHost("boards.greenhouse.io")).toBe("greenhouse")
    expect(classifyHost("jobs.lever.co")).toBe("lever")
    expect(classifyHost("acme.bamboohr.com")).toBe("bamboohr")
  })

  it("returns 'unknown' for unrecognized hosts", () => {
    expect(classifyHost("careers.acme.com")).toBe("unknown")
    expect(classifyHost("greenhouse.io.evil.com")).toBe("unknown")
  })
})

describe("isKnownAts", () => {
  it("is true for a real provider and false for unknown/empty", () => {
    expect(isKnownAts("workday")).toBe(true)
    expect(isKnownAts("unknown")).toBe(false)
    expect(isKnownAts("")).toBe(false)
  })
})
