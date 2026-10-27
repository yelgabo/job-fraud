import { describe, it, expect } from "vitest"
import { classifyHost, isKnownAts } from "./ats-registry"

describe("classifyHost", () => {
  it("recognizes known ATS hosts", () => {
    expect(classifyHost("acme.myworkdaysite.com")).toBe("workday")
    expect(classifyHost("acme.wd5.myworkdayjobs.com")).toBe("workday")
    expect(classifyHost("boards.greenhouse.io")).toBe("greenhouse")
    expect(classifyHost("jobs.lever.co")).toBe("lever")
    expect(classifyHost("acme.bamboohr.com")).toBe("bamboohr")
    expect(classifyHost("ejwl.fa.us2.oraclecloud.com")).toBe("oraclefusion")
    expect(classifyHost("EJWL.FA.EM2.ORACLECLOUD.COM")).toBe("oraclefusion")
  })

  it("does not treat other oraclecloud.com hosts as Oracle Fusion", () => {
    expect(classifyHost("objectstorage.us-ashburn-1.oraclecloud.com")).toBe("unknown")
    expect(classifyHost("myapp.oraclecloud.com")).toBe("unknown")
    expect(classifyHost("fa.us2.oraclecloud.com")).toBe("unknown")
    expect(classifyHost("ejwl.fa.us2.oraclecloud.com.evil.com")).toBe("unknown")
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
