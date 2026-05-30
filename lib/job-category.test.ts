import { describe, it, expect } from "vitest"
import { categoryForNoc, parseNocGroup, nocFromDescription } from "./job-category"

describe("categoryForNoc", () => {
  it("splits the NOC '2' family into Software / IT / Engineering as curated", () => {
    expect(categoryForNoc("21231")).toBe("Software & Data") // software engineers
    expect(categoryForNoc("21211")).toBe("Software & Data") // data scientists
    expect(categoryForNoc("22221")).toBe("IT & Infrastructure") // user support
    expect(categoryForNoc("21222")).toBe("IT & Infrastructure") // IS specialists (moved)
    expect(categoryForNoc("20012")).toBe("IT & Infrastructure") // IS managers (moved)
    expect(categoryForNoc("21223")).toBe("IT & Infrastructure") // DB analysts (moved)
    expect(categoryForNoc("21220")).toBe("IT & Infrastructure") // cybersecurity (moved)
    expect(categoryForNoc("21300")).toBe("Engineering") // civil engineers
    expect(categoryForNoc("22310")).toBe("Engineering") // electrical eng techs (not IT)
    expect(categoryForNoc("22214")).toBe("Engineering") // geomatics — not IT
  })

  it("buckets the service, office, health, trades, care families", () => {
    expect(categoryForNoc("60030")).toBe("Food Service") // restaurant managers
    expect(categoryForNoc("62200")).toBe("Food Service") // chefs (not retail)
    expect(categoryForNoc("63202")).toBe("Food Service") // bakers
    expect(categoryForNoc("65201")).toBe("Food Service") // food counter
    expect(categoryForNoc("60020")).toBe("Retail & Sales") // retail managers
    expect(categoryForNoc("64100")).toBe("Retail & Sales") // retail salespersons
    expect(categoryForNoc("11100")).toBe("Office, Admin & Finance") // accountants
    expect(categoryForNoc("13100")).toBe("Office, Admin & Finance") // admin officers
    expect(categoryForNoc("31301")).toBe("Healthcare") // RNs
    expect(categoryForNoc("72310")).toBe("Skilled Trades & Construction") // carpenters
    expect(categoryForNoc("92100")).toBe("Skilled Trades & Construction") // power engineers
    expect(categoryForNoc("44100")).toBe("Care") // home child care
  })

  it("returns Other for unknown / malformed codes", () => {
    expect(categoryForNoc(null)).toBe("Other")
    expect(categoryForNoc("123")).toBe("Other")
    expect(categoryForNoc("51111")).toBe("Other") // arts/culture
  })
})

describe("parseNocGroup / nocFromDescription", () => {
  it("extracts the trailing 5-digit code", () => {
    expect(parseNocGroup("Software engineers and designers (21231)")).toEqual({
      nocCode: "21231",
      nocGroup: "Software engineers and designers (21231)",
    })
    expect(parseNocGroup(null)).toEqual({ nocCode: null, nocGroup: null })
  })

  it("derives code + category from a stored description", () => {
    const md = "Occupation (NOC): User support technicians (22221)\nLocation: Vancouver, BC\nSalary: $30/hr"
    expect(nocFromDescription(md)).toEqual({
      nocCode: "22221",
      nocGroup: "User support technicians (22221)",
      category: "IT & Infrastructure",
    })
  })
})
