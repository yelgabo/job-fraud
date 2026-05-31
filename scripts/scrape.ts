import pLimit from "p-limit"
import { prisma } from "../lib/db"
import { webEnv } from "../lib/env"
import type { JobStub } from "../lib/workbc/scrape-workbc"
import { classifyHost, isKnownAts } from "../lib/signals/ats-registry"
import { detectFlags } from "../lib/signals/application-flags"
import { parseNocGroup, categoryForNoc } from "../lib/signals/job-category"
import { normalizeEmployer } from "../lib/signals/normalize-employer"
import { searchJobsApi, fetchJobDetailApi } from "../lib/workbc/workbc-api"
import { JsonlLogger } from "./logger"

// SCRAPE = collect only, pure HTTP via the WorkBC JSON APIs (search + GetJobDetail). No Playwright:
// the old SPA HTML scrape returned stale/duplicated detail DOM (hash-route changes don't reload),
// corrupting hundreds of postings. Each posting is upserted as RAW/pending (no AI). Judge separately.

type Args = { limit: number | null; searchTerms: string | null; dryRun: boolean; concurrency: number }

function parseArgs(): Args {
  const a: Args = { limit: null, searchTerms: null, dryRun: false, concurrency: 6 }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === "--limit") a.limit = parseInt(argv[++i] ?? "0", 10) || null
    else if (t === "--search-terms") a.searchTerms = argv[++i] ?? null
    else if (t === "--dry-run") a.dryRun = true
    else if (t === "--concurrency") a.concurrency = Math.max(1, parseInt(argv[++i] ?? "6", 10) || 6)
  }
  return a
}

async function main() {
  const args = parseArgs()
  const logPath = `logs/scrape-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`
  const log = new JsonlLogger(logPath)
  const t0 = Date.now()

  try {
    // Phase A: search (WorkBC JSON API)
    const terms = (args.searchTerms ?? webEnv.WORKBC_SEARCH_TERMS ?? "software engineer")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const target = args.limit ?? 50
    const byId = new Map<string, JobStub>()
    for (const term of terms) {
      log.log({ stage: "search:start", ok: true, meta: { term } })
      const found = await searchJobsApi(term, target, (pg, total, count) =>
        console.log(`[search] "${term}" page ${pg}: ${total} collected / ${count} total results`),
      )
      for (const s of found) if (!byId.has(s.workbcId)) byId.set(s.workbcId, s)
      console.log(`[search] "${term}": ${found.length} stubs (running total ${byId.size})`)
      if (byId.size >= target) break
    }
    const stubs = [...byId.values()].slice(0, target)
    log.log({ stage: "search:done", ok: stubs.length > 0, meta: { stubCount: stubs.length } })
    if (stubs.length === 0) {
      console.error("Hard exit: 0 listings found. DB not touched.")
      process.exitCode = 2
      return
    }
    console.log(`[search] processing ${stubs.length} stubs`)

    // Phase A.5: pre-upsert employer identities from the (reliable) search stubs, sequentially.
    // Doing this first means the parallel job-upserts below never race on the employer unique key.
    const empIdCache = new Map<string, string>()
    if (!args.dryRun) {
      for (const stub of stubs) {
        const name = stub.employerName
        if (!name) continue
        const key = normalizeEmployer(name)
        if (!key || empIdCache.has(key)) continue
        const row = await prisma.employer.upsert({
          where: { nameNormalized: key },
          create: { nameNormalized: key, nameDisplay: name },
          update: { nameDisplay: name },
        })
        empIdCache.set(key, row.id)
      }
      console.log(`[employers] ${empIdCache.size} unique employers pre-registered`)
    }

    // Phase B: per-job detail (WorkBC JSON API) + flags + upsert, run with bounded concurrency.
    const limit = pLimit(args.concurrency)
    let written = 0
    let detailFail = 0
    let done = 0
    await Promise.all(
      stubs.map((stub) =>
        limit(async () => {
          const dt0 = Date.now()
          const detail = await fetchJobDetailApi(stub.workbcId).catch(() => null)
          if (!detail) {
            detailFail++
            log.log({ workbcId: stub.workbcId, stage: "detail", ok: false, error: "fetch_failed" })
            return
          }
          const appFlags = detectFlags(detail.applyMethodText + "\n" + detail.descriptionMd)
          let externalApplyUrl: string | null = null
          let externalApplyHost: string | null = null
          let atsProvider: string | null = null
          if (detail.applyUrl) {
            try {
              const u = new URL(detail.applyUrl)
              if (!/workbc\.ca$/i.test(u.hostname)) {
                externalApplyUrl = detail.applyUrl
                externalApplyHost = u.hostname
                atsProvider = classifyHost(u.hostname)
                if (isKnownAts(atsProvider)) appFlags.push({ flag: "ats_known_provider", evidence: u.hostname })
              }
            } catch {
              // not a URL
            }
          }

          if (!args.dryRun) {
            const name = stub.employerName ?? detail.employerName
            const employerId = name ? empIdCache.get(normalizeEmployer(name)) ?? null : null
            // enrich the employer with detail-derived fields (same-row update — safe under concurrency)
            if (employerId && (detail.addressRaw || externalApplyUrl)) {
              await prisma.employer
                .update({ where: { id: employerId }, data: { addressRaw: detail.addressRaw ?? undefined, applicationUrl: externalApplyUrl ?? undefined } })
                .catch(() => {})
            }
            const { nocCode, nocGroup } = parseNocGroup(detail.nocGroup)
            const fields = {
              employerId,
              title: detail.title || stub.title,
              location: detail.location ?? stub.location ?? null,
              salary: detail.salary,
              postedAt: detail.postedAt,
              sourceUrl: stub.sourceUrl,
              descriptionMd: detail.descriptionMd,
              externalApplyUrl,
              externalApplyHost,
              atsProvider,
              externalApplyOk: null,
              applicationFlags: appFlags as never,
              nocCode,
              nocGroup,
              category: categoryForNoc(nocCode),
            }
            await prisma.job.upsert({ where: { workbcId: stub.workbcId }, create: { workbcId: stub.workbcId, ...fields }, update: fields })
            written++
          }
          log.log({ workbcId: stub.workbcId, stage: "detail", ok: true, durationMs: Date.now() - dt0, meta: { flagCount: appFlags.length, ats: atsProvider } })
          if (++done % 100 === 0) console.log(`[detail] ${done}/${stubs.length} processed`)
        }),
      ),
    )

    console.log(`\n=== SCRAPE SUMMARY ===`)
    console.log(`Wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    console.log(`Collected ${written} postings (pending judgment) from ${empIdCache.size} employers; ${detailFail} detail fetch failures`)
    console.log(`Next: run the judge-postings skill (or npm run judge:fetch) to evaluate pending postings.`)
    console.log(`Log: ${logPath}`)
  } finally {
    await prisma.$disconnect().catch(() => {})
    log.close()
  }
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
