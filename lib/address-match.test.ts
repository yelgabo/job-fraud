import { describe, it, expect } from "vitest"
import { extractCity, cityMatches } from "./address-match"

describe("extractCity", () => {
  it("pulls the locality out of free-form WorkBC addresses", () => {
    expect(extractCity("Room 9265 135 Street Surrey British Columbia V3V 5T9")).toBe("surrey")
    expect(extractCity("Virtual job based in White Rock, BC")).toBe("white rock")
    expect(extractCity("Vancouver")).toBe("vancouver")
  })

  it("returns null when there's nothing to work with", () => {
    expect(extractCity(null)).toBeNull()
    expect(extractCity("")).toBeNull()
  })
})

describe("cityMatches", () => {
  it("is true when the claimed city appears in the resolved address", () => {
    expect(cityMatches("Surrey BC", "Surrey, Metro Vancouver, British Columbia, Canada")).toBe(true)
    expect(cityMatches("Virtual job based in White Rock, BC", "White Rock, BC, Canada")).toBe(true)
  })

  it("is false when the resolved address is a different city", () => {
    expect(cityMatches("Surrey BC", "Toronto, Ontario, Canada")).toBe(false)
  })

  it("is null when either side is missing", () => {
    expect(cityMatches(null, "Surrey, BC")).toBeNull()
    expect(cityMatches("Surrey", null)).toBeNull()
  })
})
