import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { measureAgreement } from "./agreement"
import { BASELINE } from "./baseline"
import { loadFixture } from "./fixture"
import { parseLabelWorksheet } from "./labels"

const worksheet = (body: string) => `# Fraud label worksheet\n\n---\n\n${body}`
const section = (n: number, label: string, reason = "") =>
  `## ${n}. job ${n}\n\n\`\`\`\nlabel:   ${label}\nreason:  ${reason}\n\`\`\`\n\n- **Employer:** X\n\n---\n\n`

describe("parseLabelWorksheet", () => {
  it("keys labels by section number and skips blanks", () => {
    const labels = parseLabelWorksheet(worksheet(section(1, "low", "fine") + section(2, "") + section(3, "High  ")))
    expect([...labels.keys()]).toEqual([1, 3])
    expect(labels.get(3)?.label).toBe("high")
    expect(labels.get(1)?.reason).toBe("fine")
  })

  it("joins a multi-line reason", () => {
    const labels = parseLabelWorksheet(worksheet(section(1, "medium", "first line\n         second line")))
    expect(labels.get(1)?.reason).toBe("first line second line")
  })

  it("throws on a label it does not know", () => {
    expect(() => parseLabelWorksheet(worksheet(section(7, "hihg")))).toThrow(/section 7/)
  })

  it("keeps unsure out of the scored count", () => {
    const labels = parseLabelWorksheet(worksheet(section(1, "unsure")))
    const fixture = loadFixture()
    const a = measureAgreement([{ ...fixture.cases[0], index: 1 }], labels)
    expect(a.unsure).toBe(1)
    expect(a.decided).toBe(0)
  })
})

describe("composer against the human labels", () => {
  const labels = parseLabelWorksheet(readFileSync(join(__dirname, "..", "..", "docs", "labelset.md"), "utf8"))
  const result = measureAgreement(loadFixture().cases, labels, { useJudgments: true })

  it("is measured against the labels the baseline was recorded on", () => {
    // Fails when labels are added: run `npm run eval:labels` and update lib/eval/baseline.ts.
    expect(result.decided).toBe(BASELINE.decided)
    expect(result.byBand.high.of).toBe(BASELINE.highOf)
  })

  it("agrees with at least as many labels as the baseline", () => {
    expect(result.agree).toBeGreaterThanOrEqual(BASELINE.agree)
  })

  it("catches at least as many human-labelled highs as the baseline", () => {
    expect(result.byBand.high.agree).toBeGreaterThanOrEqual(BASELINE.highAgree)
  })
})
