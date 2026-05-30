// One-time (re-runnable) backfill of nocCode / nocGroup / category from each posting's stored
// descriptionMd ("Occupation (NOC): ..."). Pure parse — no API calls, no re-scrape. Safe to re-run
// after changing the category mapping in lib/job-category.ts.
// Run: npm run backfill-categories
import { prisma } from "../lib/db"
import { nocFromDescription } from "../lib/job-category"

async function main() {
  const jobs = await prisma.job.findMany({ select: { workbcId: true, descriptionMd: true } })
  console.log(`[backfill] ${jobs.length} jobs`)
  const tally: Record<string, number> = {}
  let updated = 0
  let noNoc = 0
  for (const j of jobs) {
    const { nocCode, nocGroup, category } = nocFromDescription(j.descriptionMd)
    if (!nocCode) noNoc++
    tally[category] = (tally[category] ?? 0) + 1
    await prisma.job.update({ where: { workbcId: j.workbcId }, data: { nocCode, nocGroup, category } })
    if (++updated % 500 === 0) console.log(`[backfill] ${updated}/${jobs.length}`)
  }
  console.log(`\n=== BACKFILL DONE ===`)
  console.log(`updated ${updated} jobs | ${noNoc} had no NOC code`)
  console.log("category distribution:")
  for (const [cat, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${cat}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
