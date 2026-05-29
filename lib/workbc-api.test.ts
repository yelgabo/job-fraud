import { describe, it, expect } from "vitest"
import { apiJobToStub } from "./workbc-api"

describe("apiJobToStub", () => {
  it("maps an API result row to a JobStub", () => {
    const stub = apiJobToStub({
      JobId: "49588691",
      Title: "  software engineer ",
      EmployerName: "GMO-Z.COM Fintech CA, Inc.",
      City: "Vancouver",
      SalarySummary: "$121,875 annually",
    })
    expect(stub.workbcId).toBe("49588691")
    expect(stub.title).toBe("software engineer")
    expect(stub.employerName).toBe("GMO-Z.COM Fintech CA, Inc.")
    expect(stub.location).toBe("Vancouver")
    expect(stub.sourceUrl).toContain("job-details/49588691")
  })

  it("nulls blank employer/city", () => {
    const stub = apiJobToStub({ JobId: "1", Title: "dev", EmployerName: null, City: "", SalarySummary: null })
    expect(stub.employerName).toBeNull()
    expect(stub.location).toBeNull()
  })
})
