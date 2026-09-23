// Recompute score, band, signals and prose for every composed row from its STORED judgments and
// the employer's CURRENT checks, using the current weight table. No API key, no network, no
// inference: this is what makes a reweight a diff to lib/scoring/weights.ts. Rows scored before
// the composer (scoringVersion null) have no judgments to recompose from and are left alone;
// re-judging them is a separate decision with a web-search invoice attached.
// Dry run by default. Run: npm run recompose -- [--apply] [--limit N]
import { prisma } from "../lib/db"
import { parseChecks } from "../lib/shared/json-schemas"
import { composeVerdict } from "../lib/scoring/verdict"
import type { Judgments } from "../lib/scoring/compose"
import { requestRevalidation } from "../lib/shared/request-revalidation"

function parseArgs() {
  const a = { apply: false, limit: undefined as number | undefined }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") a.apply = true
    else if (argv[i] === "--limit") a.limit = parseInt(argv[++i] ?? "", 10) || undefined
  }
  return a
}

async function main() {
  const args = parseArgs()
  const jobs = await prisma.job.findMany({
    where: { scoringVersion: { not: null } },
    include: { employer: true },
    orderBy: { scoredAt: "asc" },
    take: args.limit,
  })
  console.log(`[recompose] ${jobs.length} composed rows${args.apply ? "" : " (dry run, pass --apply to write)"}`)

  const moves: Record<string, number> = {}
  let changed = 0
  for (const job of jobs) {
    const judgments = job.judgments as Judgments | null
    const { usage: _usage, ...data } = composeVerdict(job, parseChecks(job.employer?.checks), judgments)
    const from = job.riskBand ?? "?"
    moves[`${from}->${data.riskBand}`] = (moves[`${from}->${data.riskBand}`] ?? 0) + 1
    if (data.fraudScore !== job.fraudScore) {
      changed++
      if (from !== data.riskBand) console.log(`  ${job.workbcId} ${from} ${job.fraudScore} -> ${data.riskBand} ${data.fraudScore} | ${job.title.slice(0, 50)}`)
    }
    if (args.apply) await prisma.job.update({ where: { workbcId: job.workbcId }, data })
  }

  console.log(`[recompose] score changed on ${changed}/${jobs.length}`)
  console.log(`[recompose] band moves: ${JSON.stringify(moves)}`)
  if (args.apply && changed > 0) await requestRevalidation()
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
