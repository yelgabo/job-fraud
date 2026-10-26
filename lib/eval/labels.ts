// Reads the human labels out of docs/labelset.md, the worksheet `npm run export-labelset` writes.
// The worksheet stays the place a person labels; this only parses what they wrote.

export const HUMAN_LABELS = ["low", "medium", "high", "unsure"] as const
export type HumanLabel = (typeof HUMAN_LABELS)[number]

export type WorksheetLabel = { index: number; label: HumanLabel; reason: string }

/**
 * Labels keyed by the worksheet's section number (`## 12. title`), which is the `index` in
 * docs/labelset.key.json. A blank `label:` line is omitted. Anything other than a known label
 * throws, so a typo fails the test run instead of silently dropping out of the eval set.
 */
export function parseLabelWorksheet(md: string): Map<number, WorksheetLabel> {
  const out = new Map<number, WorksheetLabel>()
  const sections = md.split(/^## (?=\d+\. )/m).slice(1)
  for (const section of sections) {
    const index = parseInt(section, 10)
    const block = section.match(/```\n([\s\S]*?)```/)?.[1] ?? ""
    const raw = block.match(/^label:[ \t]*(\S*)/m)?.[1]?.toLowerCase() ?? ""
    if (raw === "") continue
    if (!(HUMAN_LABELS as readonly string[]).includes(raw)) {
      throw new Error(`labelset section ${index}: unknown label "${raw}" (expected ${HUMAN_LABELS.join(", ")})`)
    }
    const reason = (block.split(/^reason:/m)[1] ?? "").replace(/\s+/g, " ").trim()
    out.set(index, { index, label: raw as HumanLabel, reason })
  }
  return out
}
