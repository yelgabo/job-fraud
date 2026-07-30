import { describe, expect, it } from "vitest"
import { orderEmployerAggs, type EmployerAgg } from "./companies-query"
import { pageArgs } from "./postings-filter"

const AGGS: EmployerAgg[] = [
  { employerId: "e-solo", worst: 40, count: 1 },
  { employerId: "e-big-legit", worst: 12, count: 30 },
  // A three-way tie on worst AND count: only employerId separates them.
  { employerId: "e-tie-c", worst: 85, count: 2 },
  { employerId: "e-tie-a", worst: 85, count: 2 },
  { employerId: "e-tie-b", worst: 85, count: 2 },
  { employerId: "e-busy-high", worst: 85, count: 9 },
  { employerId: "e-unscored", worst: -1, count: 3 },
]

describe("orderEmployerAggs", () => {
  it("sorts worst desc, then count desc, then employerId as the unique tiebreaker", () => {
    expect(orderEmployerAggs(AGGS).map((a) => a.employerId)).toEqual([
      "e-busy-high",
      "e-tie-a",
      "e-tie-b",
      "e-tie-c",
      "e-solo",
      "e-big-legit",
      "e-unscored",
    ])
  })

  it("does not mutate its input", () => {
    const copy = [...AGGS]
    orderEmployerAggs(AGGS)
    expect(AGGS).toEqual(copy)
  })

  it("pages sliced from the ordering tile it: no overlap, no skips, even across a tie", () => {
    const ordered = orderEmployerAggs(AGGS)
    const pageSize = 2 // the boundary falls inside the e-tie-* tie
    const seen: string[] = []
    for (let page = 1; page * pageSize - pageSize < ordered.length; page++) {
      const { skip, take } = pageArgs(page, pageSize)
      seen.push(...ordered.slice(skip, skip + take).map((a) => a.employerId))
    }
    expect(seen).toEqual(ordered.map((a) => a.employerId))
    expect(new Set(seen).size).toBe(AGGS.length)
  })
})
