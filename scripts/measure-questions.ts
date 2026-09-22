// EXPERIMENT, READ-ONLY. Measures whether a candidate Jev question actually separates risk
// bands, before anyone picks a weight for it. A judgment that reads the same on a Marriott ATS
// posting and on a gmail-contact shell company cannot help at any weight, and the first question
// set failed exactly that way: four of seven were flat to two decimal places.
// Run: npm run measure-questions -- [--per-band 100] [--concurrency 10]
import { writeFileSync } from "node:fs"
import pLimit from "p-limit"
import { TypeSafeClient, noul, score } from "@typesafe-ai/sdk"
import { prisma } from "../lib/db"
import { bandFor, type RiskBand } from "../lib/shared/risk-band"

// Candidates come from observed failures, not invention. The v1 set asked about blatant scam
// copy that WorkBC moderation keeps out of the corpus, and about "vagueness", which turned out
// to track employer size. These target what the labelled misses actually turned on: a known
// brand reachable only through a channel that brand would never use.
const CANDIDATES = {
  // The labeller's own reasoning: "anyone can be pretending to be Tim Hortons". Borrowing a
  // brand only pays if the brand is worth borrowing, so prominence is half of that judgment
  // and the deterministic flags cannot see it.
  brandProminence: score("How widely known is the employer named in this posting?", [
    "Not a recognisable business name. It reads as a private individual, a household, or a name with no presence beyond this posting.",
    "A small local business: one location, known only in its own town or neighbourhood.",
    "An established regional or provincial business, or a mid-sized company in its industry.",
    "A nationally or internationally known brand that most people would recognise by name.",
  ] as const),

  // The high band is full of private households and one-person "companies". The posting text
  // says which it is more directly than any check does.
  employerIsOrganisation: noul(
    "The employer is a registered business or institution rather than a private individual, a family, or a household.",
    {
      true: "A company, franchise, agency, school, hospital, or similar organisation is doing the hiring.",
      false: "A private person or household is doing the hiring, for example a family seeking a caregiver or an individual named as the employer.",
    },
  ),

  // The other half of the impersonation judgment: not whether the channel is a free mailbox,
  // which a regex already answers, but whether it is the channel this employer would use.
  routePlausibleForEmployer: noul(
    "The way this posting says to apply is what an employer of this kind and size would genuinely use for this role.",
    {
      true: "The application route fits the employer: a careers portal or company-domain address for a large organisation, or a direct phone, email, or walk-in for a small local business.",
      false: "The route does not fit the employer named, for example a national chain or a professional firm taking applications only at a free consumer mailbox, a messaging app, or a private home address.",
    },
  ),

  // Tail insurance. Expected flat on this corpus, which is the point of measuring: if it is
  // flat we learn the moderation is holding, and it stays cheap to keep asking.
  askBeforeHire: noul(
    "Before any interview or job offer, the posting asks the applicant to send money, banking details, a void cheque, or government identification, or to pay for training, equipment, or a background check.",
  ),

  moneyThroughWorker: noul(
    "The worker would move money or goods through their own personal bank account, payment app, or home address: receiving funds and forwarding them on, withdrawing and resending payments, buying gift cards for the employer, or accepting parcels at home and reshipping them.",
    {
      true: "The posting describes funds or parcels passing through the worker's own account, card, or home address on their way somewhere else.",
      false: "Any money handling described is ordinary work on the employer's own premises or systems, such as operating a till, taking customer payments, running payroll, or managing a budget.",
    },
  ),

  payVsDuties: score("How the stated pay compares with the skill level the duties describe.", [
    "Far above what these duties imply, such as a high rate for unskilled or vaguely described work.",
    "Somewhat higher than these duties imply, with no explanation in the posting.",
    "Consistent with the skill level the duties describe.",
    "At or below what these duties imply.",
  ] as const),
}

type Name = keyof typeof CANDIDATES
const NAMES = Object.keys(CANDIDATES) as Name[]
const BANDS: RiskBand[] = ["low", "medium", "high"]

function parseArgs() {
  const a = { perBand: 100, concurrency: 10, out: "" }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--per-band") a.perBand = parseInt(argv[++i] ?? "", 10) || a.perBand
    else if (argv[i] === "--concurrency") a.concurrency = parseInt(argv[++i] ?? "", 10) || a.concurrency
    else if (argv[i] === "--out") a.out = argv[++i] ?? ""
  }
  return a
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1))
}

/**
 * Standardised gap between the low-band and high-band means (Cohen's d). This is the number
 * that decides whether a question is worth keeping, and it is deliberately computed before any
 * weight exists: |d| under about 0.2 means the question reads the same on both and no weight
 * can rescue it. A negative d means it reads worse on LOW-risk postings, which is how v1's
 * specificity question was caught running backwards.
 */
function cohensD(a: number[], b: number[]): number {
  const na = a.length
  const nb = b.length
  const pooled = Math.sqrt(((na - 1) * sd(a) ** 2 + (nb - 1) * sd(b) ** 2) / Math.max(1, na + nb - 2))
  return pooled === 0 ? 0 : (mean(b) - mean(a)) / pooled
}

async function main() {
  const args = parseArgs()
  const client = new TypeSafeClient()

  const jobs = []
  for (const band of BANDS) {
    jobs.push(...(await prisma.job.findMany({
      where: { scoredAt: { not: null }, riskBand: band, fraudScore: { gte: 0 } },
      include: { employer: true },
      orderBy: { scoredAt: "desc" },
      take: args.perBand,
    })))
  }
  console.log(`[measure] ${jobs.length} postings, ${NAMES.length} candidate questions`)

  const results: Array<{ workbcId: string; band: RiskBand; answers: Record<string, number> }> = []
  let tokens = 0
  let failed = 0
  const limit = pLimit(args.concurrency)

  await Promise.all(jobs.map((job) => limit(async () => {
    try {
      const { answers, usage } = await client.systemOne({
        state: {
          title: job.title,
          employer: job.employer?.nameDisplay ?? null,
          location: job.location,
          salary: job.salary,
          description: job.descriptionMd.slice(0, 6000),
        },
        questions: CANDIDATES,
      })
      tokens += usage.input_tokens
      const row: Record<string, number> = {}
      for (const n of NAMES) {
        const a = answers[n] as { score?: number; noul?: number }
        row[n] = a.score ?? a.noul ?? 0
      }
      results.push({ workbcId: job.workbcId, band: bandFor(job.fraudScore ?? 0), answers: row })
    } catch (e) {
      failed++
      console.error(`  fail ${job.workbcId}: ${(e as Error).message.slice(0, 80)}`)
    }
  })))

  const byBand = (b: RiskBand) => results.filter((r) => r.band === b)
  console.log(`\n=== DISCRIMINATION (before any weight exists) ===`)
  console.log(`${"question".padEnd(26)}${"low".padStart(8)}${"medium".padStart(8)}${"high".padStart(8)}${"d(low,high)".padStart(13)}   verdict`)
  const keep: string[] = []
  for (const n of NAMES) {
    const lo = byBand("low").map((r) => r.answers[n])
    const md = byBand("medium").map((r) => r.answers[n])
    const hi = byBand("high").map((r) => r.answers[n])
    const d = cohensD(lo, hi)
    const verdict = Math.abs(d) < 0.2 ? "FLAT, drop" : d > 0 ? "separates (higher = riskier)" : "separates (higher = safer)"
    if (Math.abs(d) >= 0.2) keep.push(n)
    console.log(`${n.padEnd(26)}${mean(lo).toFixed(2).padStart(8)}${mean(md).toFixed(2).padStart(8)}${mean(hi).toFixed(2).padStart(8)}${d.toFixed(2).padStart(13)}   ${verdict}`)
  }
  console.log(`\nworth keeping: ${keep.length ? keep.join(", ") : "none"}`)
  console.log(`jev input tokens ${tokens} (about $${((tokens / 1e6) * 0.042).toFixed(4)}), failures ${failed}`)

  if (args.out) {
    writeFileSync(args.out, JSON.stringify(results, null, 2), "utf8")
    console.log(`rows written to ${args.out}`)
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
