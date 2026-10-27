import { describe, expect, it } from "vitest"
import { canonicalUrl } from "./canonical-url"

const canon = (url: string) => {
  const u = new URL(url, "https://example.test")
  return canonicalUrl(u.pathname, u.searchParams)
}

describe("canonicalUrl", () => {
  it("leaves canonical homepage URLs alone", () => {
    for (const u of ["/", "/?band=high", "/?band=high&cat=Food+Service&posted=7&page=2"]) {
      expect(canon(u)).toBe(u)
    }
  })

  it("drops tracking parameters, defaults and unknown values, and fixes the order", () => {
    expect(canon("/?fbclid=IwAR123")).toBe("/")
    expect(canon("/?utm_source=news&band=high")).toBe("/?band=high")
    expect(canon("/?page=2&band=high")).toBe("/?band=high&page=2")
    expect(canon("/?band=all&posted=any&page=1")).toBe("/")
    expect(canon("/?band=nope&cat=Nope&posted=5&page=-3")).toBe("/")
  })

  it("keeps only a real page number on /companies", () => {
    expect(canon("/companies?page=3&fbclid=x")).toBe("/companies?page=3")
    expect(canon("/companies?page=1")).toBe("/companies")
  })

  it("strips every query parameter and a trailing slash from posting and employer pages", () => {
    expect(canon("/j/50251171?fbclid=abc")).toBe("/j/50251171")
    expect(canon("/e/cmu1k042g000w42sthq6aayhp/")).toBe("/e/cmu1k042g000w42sthq6aayhp")
  })

  it("does not govern other paths", () => {
    for (const u of ["/about", "/analysis", "/audit/x", "/api/revalidate", "/j/1/extra"]) {
      expect(canon(u)).toBeNull()
    }
  })
})
