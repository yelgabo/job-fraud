import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { headingSlug, methodologySlice, RATING_ANCHOR } from "./methodology"

// These tests run against the real README.md: they are the drift guard between the README
// (owner of the public methodology language) and the /about page (its renderer). If a README
// restructure breaks one of them, fix the slice or the README, not the assertion.
const readme = fs.readFileSync(path.join(__dirname, "..", "..", "README.md"), "utf8")
const slice = methodologySlice(readme)

describe("methodologySlice on the real README", () => {
  it("starts at the first section heading", () => {
    expect(slice.startsWith("## Why these postings are worth reviewing")).toBe(true)
  })

  it("keeps the published caveats verbatim", () => {
    expect(slice).toContain("A rating is a screening signal, not a verdict.")
    expect(slice).toContain("It can be wrong.")
    expect(slice).toContain("the ratings are produced automatically")
  })

  it("keeps the band definitions", () => {
    for (const band of ["**Low**", "**Medium**", "**High**"]) {
      expect(slice).toContain(band)
    }
  })

  it("drops the repo intro and the developer-docs footer", () => {
    expect(slice).not.toContain("Browse the reviews")
    expect(slice).not.toContain("Developer setup")
    expect(slice).not.toContain("TECHNICAL_INFO")
  })

  it("contains the section the rating links target", () => {
    const headings = [...slice.matchAll(/^## (.+)$/gm)].map((m) => headingSlug(m[1]))
    expect(headings).toContain(RATING_ANCHOR)
  })
})

describe("methodologySlice edge cases", () => {
  it("returns everything when there is no section heading", () => {
    expect(methodologySlice("plain text")).toBe("plain text")
  })

  it("returns the body unchanged when there is no trailing divider", () => {
    expect(methodologySlice("intro\n\n## A\n\ncontent")).toBe("## A\n\ncontent")
  })
})

describe("headingSlug", () => {
  it("lowercases, strips punctuation, and hyphenates", () => {
    expect(headingSlug("How each posting is rated")).toBe("how-each-posting-is-rated")
    expect(headingSlug("What a rating means — and what it doesn't")).toBe(
      "what-a-rating-means-and-what-it-doesnt",
    )
  })
})
