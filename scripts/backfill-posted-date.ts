// Backfill `Job.postedDate` (the indexed DateTime the site's `?posted=` filter compares against)
// from the raw `Job.postedAt` string. Pure parse, no API calls, re-runnable. The raw string is
// never touched. Anything missing, ambiguous or junk maps to null, and the site then falls back to
// `scrapedAt` and marks that row's date as an estimate (lib/shared/posted-date.ts).
//
// DRY RUN IS THE DEFAULT: it reports what it would change and writes nothing. Pass --apply to
// write. `.env`'s DATABASE_URL points at the production database and the deployed site reads that
// database live, so an --apply run publishes immediately, with no deploy step.
//
// Run: npm run backfill-posted-date                      # dry run, reports counts
//      npm run backfill-posted-date -- --apply           # write
//      npm run backfill-posted-date -- --limit 100       # dry-run a sample
//      npm run backfill-posted-date -- --samples 50      # print more unparseable examples
import { prisma } from "../lib/db"
import {
  groupWrites,
  parseBackfillArgs,
  planBackfill,
  type BackfillRow,
} from "../lib/shared/posted-date-backfill"

async function main() {
  const args = parseBackfillArgs(process.argv.slice(2))

  const rows: BackfillRow[] = await prisma.job.findMany({
    select: { workbcId: true, postedAt: true, postedDate: true },
    orderBy: { workbcId: "asc" },
    ...(args.limit ? { take: args.limit } : {}),
  })

  const plan = planBackfill(rows)

  console.log(`\n=== POSTED-DATE BACKFILL (${args.apply ? "APPLY" : "DRY RUN"}) ===`)
  console.log(`rows examined:            ${plan.total}`)
  console.log(`postedAt null:            ${plan.nullRaw}`)
  console.log(`parsed to a real date:    ${plan.parsed}`)
  console.log(
    `non-null but unparseable: ${plan.unparseable.length}  (left null; the site shows an estimate from scrapedAt)`,
  )
  console.log(`already correct:          ${plan.unchanged}`)
  console.log(`to write:                 ${plan.writes.length}`)

  if (plan.unparseable.length) {
    console.log(`\nunparseable raw postedAt samples:`)
    for (const u of plan.unparseable.slice(0, args.samples)) {
      console.log(`  ${u.workbcId}  ${JSON.stringify(u.postedAt)}`)
    }
    if (plan.unparseable.length > args.samples) {
      console.log(`  ... and ${plan.unparseable.length - args.samples} more`)
    }
  }

  if (!args.apply) {
    console.log(
      `\nDry run: nothing written. Re-run with --apply to write ${plan.writes.length} rows to the database in DATABASE_URL (production, unless you pointed it elsewhere).`,
    )
    await prisma.$disconnect()
    return
  }

  // One updateMany per distinct target date rather than one update per posting.
  const groups = groupWrites(plan.writes)
  let written = 0
  for (const g of groups) {
    const res = await prisma.job.updateMany({
      where: { workbcId: { in: g.workbcIds } },
      data: { postedDate: g.postedDate },
    })
    written += res.count
  }
  console.log(`\nwrote ${written} rows across ${groups.length} distinct dates.`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
