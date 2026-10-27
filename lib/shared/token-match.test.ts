import { describe, expect, it } from "vitest"
import { tokenMatches } from "./token-match"

describe("tokenMatches", () => {
  it("accepts only the exact token, whatever the lengths", () => {
    expect(tokenMatches("s3cret", "s3cret")).toBe(true)
    expect(tokenMatches("s3cre", "s3cret")).toBe(false)
    expect(tokenMatches("s3cretX", "s3cret")).toBe(false)
    expect(tokenMatches("", "s3cret")).toBe(false)
  })
})
