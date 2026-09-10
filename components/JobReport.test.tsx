import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { Employer, Job } from "@prisma/client"
import { JobReport } from "./JobReport"

// next/link needs the app-router context when rendered outside Next; a plain anchor is enough here.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

function makeJob(overrides: Partial<Job> = {}): Job & { employer: Employer | null } {
  return {
    workbcId: "12345678",
    employerId: null,
    employer: null,
    title: "Software Developer",
    location: "Victoria, BC",
    salary: null,
    postedAt: null,
    postedDate: null,
    sourceUrl: "https://www.workbc.ca/jobs/12345678",
    descriptionMd: "A job.",
    externalApplyUrl: "https://apply.example.com/job/1",
    externalApplyHost: "apply.example.com",
    atsProvider: null,
    externalApplyOk: null,
    applicationFlags: [],
    nocCode: null,
    nocGroup: null,
    category: null,
    fraudScore: 10,
    riskBand: "low",
    reasoning: "Looks fine.",
    signals: [],
    scoredAt: new Date("2026-07-01T00:00:00Z"),
    scrapedAt: new Date("2026-06-30T00:00:00Z"),
    ...overrides,
  }
}

/** The <a> tag (opening tag only) whose href is the given URL. */
function anchorFor(html: string, href: string): string {
  const match = html.match(new RegExp(`<a [^>]*href="${href.replace(/[/.]/g, "\\$&")}"[^>]*>`))
  expect(match, `no anchor with href ${href}`).not.toBeNull()
  return match![0]
}

const APPLY_URL = "https://apply.example.com/job/1"
const PROMINENT = "bg-zinc-900"
const WARNING_TEXT = "rated High risk"

describe("JobReport apply-link presentation by risk band", () => {
  it("renders the prominent apply button and no warning for a Low posting", () => {
    const html = renderToStaticMarkup(<JobReport job={makeJob({ fraudScore: 10, riskBand: "low" })} />)
    expect(anchorFor(html, APPLY_URL)).toContain(PROMINENT)
    expect(html).not.toContain(WARNING_TEXT)
  })

  it("renders the prominent apply button and no warning for a Medium posting", () => {
    const html = renderToStaticMarkup(<JobReport job={makeJob({ fraudScore: 45, riskBand: "medium" })} />)
    expect(anchorFor(html, APPLY_URL)).toContain(PROMINENT)
    expect(html).not.toContain(WARNING_TEXT)
  })

  it("de-emphasizes the apply button and shows the warning for a High posting", () => {
    const html = renderToStaticMarkup(<JobReport job={makeJob({ fraudScore: 92, riskBand: "high" })} />)
    const apply = anchorFor(html, APPLY_URL)
    expect(apply).not.toContain(PROMINENT)
    expect(apply).toContain("border")
    expect(html).toContain(WARNING_TEXT)
    expect(html).toContain("/about#how-each-posting-is-rated")
  })

  it("keeps the WorkBC source link identical across bands", () => {
    const low = renderToStaticMarkup(<JobReport job={makeJob({ fraudScore: 10, riskBand: "low" })} />)
    const high = renderToStaticMarkup(<JobReport job={makeJob({ fraudScore: 92, riskBand: "high" })} />)
    expect(anchorFor(high, "https://www.workbc.ca/jobs/12345678")).toEqual(
      anchorFor(low, "https://www.workbc.ca/jobs/12345678"),
    )
  })

  it("leaves the WorkBC-only button prominent on a High posting with no external apply link", () => {
    const html = renderToStaticMarkup(
      <JobReport job={makeJob({ fraudScore: 92, riskBand: "high", externalApplyUrl: null, externalApplyHost: null })} />,
    )
    expect(anchorFor(html, "https://www.workbc.ca/jobs/12345678")).toContain(PROMINENT)
    expect(html).not.toContain(WARNING_TEXT)
  })
})
