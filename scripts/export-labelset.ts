// Exports postings for a human to label, as the ground truth neither scoring path has.
// READ-ONLY. Writes a markdown worksheet plus a JSON key held back until labelling is done.
// Run: npm run export-labelset -- [--n 80] [--out docs/labelset]
//
// Blind by construction: the worksheet shows the posting and the deterministic check values a
// reader would want, and never the stored score, band, or reasoning. Anchoring on the current
// verdict is exactly the bias that makes a label set worthless for judging the current verdict.
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { prisma } from "../lib/db"
import { parseChecks, parseFlags } from "../lib/shared/json-schemas"
import { categoryForNoc } from "../lib/signals/job-category"
import { bandFor, type RiskBand } from "../lib/shared/risk-band"
import { composeScore } from "../lib/scoring/compose"

function parseArgs() {
  const a = { n: 80, out: "docs/labelset" }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--n") a.n = parseInt(argv[++i] ?? "", 10) || a.n
    else if (argv[i] === "--out") a.out = argv[++i] ?? a.out
  }
  return a
}

// Deterministic shuffle so a re-export with the same seed produces the same worksheet.
function shuffle<T>(xs: T[], seed: number): T[] {
  const out = [...xs]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

async function main() {
  const args = parseArgs()

  const jobs = await prisma.job.findMany({
    where: { scoredAt: { not: null }, fraudScore: { gte: 0 } },
    include: { employer: true },
  })

  const scored = jobs.map((job) => {
    const checks = job.employer ? parseChecks(job.employer.checks) : {}
    const flags = parseFlags(job.applicationFlags)
    const composed = composeScore({ judgments: null, checks, flags, category: categoryForNoc(job.nocCode) })
    return {
      job,
      checks,
      flags,
      storedScore: job.fraudScore ?? 0,
      storedBand: bandFor(job.fraudScore ?? 0),
      composedScore: composed.fraudScore,
      composedBand: composed.riskBand,
    }
  })

  // Half the sheet is postings the two paths band differently, because those carry the
  // information: a posting both agree on teaches nothing about which one is right. The other
  // half is a plain random draw, which is what keeps the sheet usable as a calibration sample
  // rather than only as a tiebreaker.
  const disagree = shuffle(scored.filter((s) => s.storedBand !== s.composedBand), 11)
  const agree = shuffle(scored.filter((s) => s.storedBand === s.composedBand), 23)
  const half = Math.floor(args.n / 2)
  const picked = shuffle([...disagree.slice(0, half), ...agree.slice(0, args.n - half)], 7)

  const lines: string[] = [
    "# Fraud label worksheet",
    "",
    `${picked.length} postings, drawn ${new Date().toISOString().slice(0, 10)}. Half are cases where the current`,
    "scoring and the composer disagree; half are a random draw. Which is which is not shown, and",
    "neither is any existing score, on purpose.",
    "",
    "For each posting write **low**, **medium**, or **high** on the `label:` line, and a short",
    "reason. Use `unsure` freely: an honest unsure is worth more than a guess, and the scoring",
    "work can route those to a second look rather than pretending they were decided.",
    "",
    "- **low** you would let a friend apply without a warning",
    "- **medium** worth a second look before applying, something is off",
    "- **high** you would tell someone not to apply",
    "",
    "---",
    "",
  ]

  const key: Array<Record<string, unknown>> = []

  picked.forEach((s, i) => {
    const { job } = s
    const web = s.checks.web
    lines.push(`## ${i + 1}. ${job.title}`)
    lines.push("")
    lines.push("```")
    lines.push(`label:   `)
    lines.push(`reason:  `)
    lines.push("```")
    lines.push("")
    lines.push(`- **Employer:** ${job.employer?.nameDisplay ?? "(hidden)"}`)
    lines.push(`- **Location:** ${job.location ?? "(unknown)"}   **Pay:** ${job.salary ?? "(none stated)"}`)
    lines.push(`- **Apply:** ${job.externalApplyUrl ?? "(no external link)"}${job.atsProvider ? ` (${job.atsProvider})` : ""}`)
    lines.push(`- **Detector flags:** ${s.flags.length ? s.flags.map((f) => `\`${f.flag}\``).join(", ") : "none"}`)
    if (web) {
      lines.push(`- **Employer web check:** business ${web.businessMatch}, location ${web.locationMatch}, jobs page ${web.hasJobsListing}, mailing address ${web.applicationAddressType}`)
      lines.push(`  - ${web.summary}`)
    } else {
      lines.push(`- **Employer web check:** not performed`)
    }
    lines.push(`- **Source:** ${job.sourceUrl}`)
    lines.push("")
    lines.push("<details><summary>Posting text</summary>")
    lines.push("")
    lines.push(job.descriptionMd.slice(0, 3500))
    lines.push("")
    lines.push("</details>")
    lines.push("")
    lines.push("---")
    lines.push("")

    key.push({
      index: i + 1,
      workbcId: job.workbcId,
      title: job.title,
      storedScore: s.storedScore,
      storedBand: s.storedBand,
      composedScore: s.composedScore,
      composedBand: s.composedBand,
      stratum: s.storedBand === s.composedBand ? "agree" : "disagree",
    })
  })

  mkdirSync(dirname(args.out) || ".", { recursive: true })
  writeFileSync(`${args.out}.md`, lines.join("\n"), "utf8")
  writeFileSync(`${args.out}.key.json`, JSON.stringify(key, null, 2), "utf8")

  const nDis = key.filter((k) => k.stratum === "disagree").length
  console.log(`[labelset] ${picked.length} postings (${nDis} disagreement, ${picked.length - nDis} random)`)
  console.log(`[labelset] worksheet: ${args.out}.md`)
  console.log(`[labelset] key (do not read until labelled): ${args.out}.key.json`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
