// Prints how the composer agrees with the human labels in docs/labelset.md, from the frozen
// fixture. No database, no network. Run: npm run eval:labels
import { readFileSync } from "node:fs"
import { measureAgreement, type Agreement } from "../lib/eval/agreement"
import { BASELINE } from "../lib/eval/baseline"
import { loadFixture } from "../lib/eval/fixture"
import { parseLabelWorksheet } from "../lib/eval/labels"

const BANDS = ["low", "medium", "high"] as const

function report(title: string, a: Agreement) {
  console.log(`\n== ${title}`)
  console.log(`agree ${a.agree}/${a.decided}` + (a.unsure ? ` (${a.unsure} unsure, not scored)` : ""))
  for (const b of BANDS) console.log(`  ${b.padEnd(6)} ${a.byBand[b].agree}/${a.byBand[b].of}`)
  console.log("  confusion (rows human, columns composed):")
  console.log(`  ${"".padEnd(8)}${BANDS.map((b) => b.padEnd(8)).join("")}`)
  for (const h of BANDS) console.log(`  ${h.padEnd(8)}${BANDS.map((c) => String(a.confusion[h][c] ?? 0).padEnd(8)).join("")}`)
  for (const m of a.misses) {
    console.log(`  miss #${m.index} ${m.title} (${m.employer ?? "?"}): human ${m.human}, composed ${m.composed} ${m.score}`)
    if (m.reason) console.log(`       ${m.reason.slice(0, 160)}`)
  }
}

const fixture = loadFixture()
const labels = parseLabelWorksheet(readFileSync("docs/labelset.md", "utf8"))
console.log(`fixture snapshot ${fixture.snapshotAt}, ${fixture.cases.length} cases, ${labels.size} labelled`)
const live = measureAgreement(fixture.cases, labels, { useJudgments: true })
report("composer with Jev judgments (production path)", live)
report("composer without judgments (keyless path)", measureAgreement(fixture.cases, labels, { useJudgments: false }))
console.log(
  `\nbaseline: ${BASELINE.agree}/${BASELINE.decided} agree, high ${BASELINE.highAgree}/${BASELINE.highOf}` +
    (live.decided !== BASELINE.decided ? "  <- labels changed; re-measure and update lib/eval/baseline.ts" : ""),
)
