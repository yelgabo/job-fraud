// READ-ONLY A/B: score already-judged postings through Jev + the composer and compare against
// the stored model-chosen verdicts. Writes NOTHING to the database.
// Run: npm run compare-jev -- [--per-band 50] [--concurrency 8]
//
// This measures AGREEMENT with the current system, not accuracy. Neither side has ever been
// checked against a known-fraudulent posting. Disagreements are printed so they can be read.
import { writeFileSync } from "node:fs"
import pLimit from "p-limit"
import { TypeSafeClient } from "@typesafe-ai/sdk"
import { prisma } from "../lib/db"
import { parseChecks, parseFlags } from "../lib/shared/json-schemas"
import { categoryForNoc } from "../lib/signals/job-category"
import { bandFor, type RiskBand } from "../lib/shared/risk-band"
import { composeScore } from "../lib/scoring/compose"
import { judgeText } from "../lib/ai/jev-judgments"

const BANDS: RiskBand[] = ["low", "medium", "high"]

function parseArgs() {
  const a = { perBand: 50, concurrency: 8, out: "" }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--per-band") a.perBand = parseInt(argv[++i] ?? "", 10) || a.perBand
    else if (argv[i] === "--concurrency") a.concurrency = parseInt(argv[++i] ?? "", 10) || a.concurrency
    else if (argv[i] === "--out") a.out = argv[++i] ?? ""
  }
  return a
}

const median = (xs: number[]) => {
  const s = [...xs].sort((x, y) => x - y)
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)]
}

function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const idx = xs.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0])
    const r = new Array<number>(xs.length)
    for (let i = 0; i < idx.length; ) {
      let j = i
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
      const avg = (i + j) / 2 + 1
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg
      i = j + 1
    }
    return r
  }
  const ra = rank(a)
  const rb = rank(b)
  const n = a.length
  const ma = ra.reduce((x, y) => x + y, 0) / n
  const mb = rb.reduce((x, y) => x + y, 0) / n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const x = ra[i] - ma
    const y = rb[i] - mb
    num += x * y
    da += x * x
    db += y * y
  }
  return num / Math.sqrt(da * db)
}

async function main() {
  const args = parseArgs()
  const client = new TypeSafeClient()

  const jobs = []
  for (const band of BANDS) {
    const rows = await prisma.job.findMany({
      where: { scoredAt: { not: null }, riskBand: band, fraudScore: { gte: 0 } },
      include: { employer: true },
      orderBy: { scoredAt: "desc" },
      take: args.perBand,
    })
    jobs.push(...rows)
  }
  console.log(`[compare-jev] ${jobs.length} postings (${args.perBand} per band, newest first)`)

  type Row = {
    judgments: import("../lib/scoring/compose").Judgments
    workbcId: string
    title: string
    employer: string | null
    storedScore: number
    storedBand: RiskBand
    jevScore: number
    jevBand: RiskBand
    contact: string
    topSignals: string
  }
  const rows: Row[] = []
  let failed = 0
  let tokensIn = 0
  const limit = pLimit(args.concurrency)

  await Promise.all(
    jobs.map((job) =>
      limit(async () => {
        try {
          const out = await judgeText(client, {
            title: job.title,
            employer: job.employer?.nameDisplay ?? null,
            location: job.location,
            salary: job.salary,
            description: job.descriptionMd.slice(0, 6000),
          })
          tokensIn += out.usage.inputTokens
          const composed = composeScore({
            judgments: out.judgments,
            checks: job.employer ? parseChecks(job.employer.checks) : {},
            flags: parseFlags(job.applicationFlags),
            category: categoryForNoc(job.nocCode),
          })
          rows.push({
            judgments: out.judgments,
            workbcId: job.workbcId,
            title: job.title.slice(0, 44),
            employer: job.employer?.nameDisplay?.slice(0, 26) ?? null,
            storedScore: job.fraudScore ?? 0,
            storedBand: bandFor(job.fraudScore ?? 0),
            jevScore: composed.fraudScore,
            jevBand: composed.riskBand,
            contact: out.contactChannel,
            topSignals: composed.signals.slice(0, 3).map((s) => `${s.label}${s.weight >= 0 ? "+" : ""}${s.weight}`).join(" "),
          })
        } catch (e) {
          failed++
          console.error(`  fail ${job.workbcId}: ${(e as Error).message.slice(0, 90)}`)
        }
      }),
    ),
  )

  console.log(`\n=== BAND AGREEMENT (rows = stored, cols = jev+composer) ===`)
  const matrix: Record<string, Record<string, number>> = {}
  for (const b of BANDS) matrix[b] = { low: 0, medium: 0, high: 0 }
  for (const r of rows) matrix[r.storedBand][r.jevBand]++
  console.log(`${"".padEnd(10)}${BANDS.map((b) => b.padStart(9)).join("")}   total`)
  let agree = 0
  for (const b of BANDS) {
    const t = BANDS.reduce((a, c) => a + matrix[b][c], 0)
    agree += matrix[b][b]
    console.log(`${b.padEnd(10)}${BANDS.map((c) => String(matrix[b][c]).padStart(9)).join("")}${String(t).padStart(8)}`)
  }
  console.log(`\nexact band agreement: ${agree}/${rows.length} (${((agree / rows.length) * 100).toFixed(1)}%)`)

  const deltas = rows.map((r) => r.jevScore - r.storedScore)
  const absDeltas = deltas.map(Math.abs)
  console.log(`score delta (jev - stored): mean ${(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1)}, median ${median(deltas)}`)
  console.log(`absolute delta: mean ${(absDeltas.reduce((a, b) => a + b, 0) / absDeltas.length).toFixed(1)}, median ${median(absDeltas)}`)
  console.log(`spearman rank correlation: ${spearman(rows.map((r) => r.storedScore), rows.map((r) => r.jevScore)).toFixed(3)}`)
  console.log(`jev input tokens: ${tokensIn} (about $${((tokensIn / 1e6) * 0.042).toFixed(4)} at $0.042/MTok), failures: ${failed}`)

  console.log(`\n=== 20 LARGEST DISAGREEMENTS ===`)
  const worst = [...rows].sort((a, b) => Math.abs(b.jevScore - b.storedScore) - Math.abs(a.jevScore - a.storedScore)).slice(0, 20)
  for (const r of worst) {
    console.log(`${r.workbcId}  stored ${String(r.storedScore).padStart(3)} ${r.storedBand.padEnd(6)} -> jev ${String(r.jevScore).padStart(3)} ${r.jevBand.padEnd(6)} | ${r.title} @ ${r.employer ?? "(hidden)"}`)
    console.log(`          contact=${r.contact}  ${r.topSignals}`)
  }

  console.log(`\n=== STORED HIGH THAT JEV DROPS (false-negative risk) ===`)
  for (const r of rows.filter((x) => x.storedBand === "high" && x.jevBand !== "high").slice(0, 15)) {
    console.log(`${r.workbcId}  ${String(r.storedScore).padStart(3)} -> ${String(r.jevScore).padStart(3)} | ${r.title} @ ${r.employer ?? "(hidden)"} | ${r.topSignals}`)
  }

  if (args.out) {
    writeFileSync(args.out, JSON.stringify(rows, null, 2), "utf8")
    console.log(`\nrows written to ${args.out}`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
