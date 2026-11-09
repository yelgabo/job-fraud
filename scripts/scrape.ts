import pLimit from "p-limit"
import { prisma } from "../lib/db"
import { contentChanged, dueForRefetch, keepJudgeFlags } from "../lib/shared/posting-content"
import { finishScrapeRun, startScrapeRun, type ScrapeCounts } from "../lib/shared/scrape-run"
import { findOrCreateEmployer } from "../lib/shared/find-or-create-employer"
import { parseFlags } from "../lib/shared/json-schemas"
import { SENT_BACK } from "../lib/scoring/write-verdict"
import { webEnv } from "../lib/env"
import type { JobStub } from "../lib/workbc/scrape-workbc"
import { classifyHost, isKnownAts } from "../lib/signals/ats-registry"
import { detectFlags } from "../lib/signals/application-flags"
import { parseNocGroup, categoryForNoc } from "../lib/signals/job-category"
import { normalizeEmployer } from "../lib/signals/normalize-employer"
import { parsePostedDate } from "../lib/shared/posted-date"
import { requestRevalidation } from "../lib/shared/request-revalidation"
import { searchJobsApi, fetchJobDetailApi, cityLocation } from "../lib/workbc/workbc-api"
import { JsonlLogger } from "./logger"

// SCRAPE = collect only, pure HTTP via the WorkBC JSON APIs (search + GetJobDetail). No Playwright:
// the old SPA HTML scrape returned stale/duplicated detail DOM (hash-route changes don't reload),
// corrupting hundreds of postings. Each posting is upserted as RAW/pending (no AI). Judge separately.

type Args = { limit: number | null; searchTerms: string | null; dryRun: boolean; concurrency: number; skipExisting: boolean; refetchAfterDays: number | null; recent: number; locations: string | null }

function parseArgs(): Args {
  const a: Args = { limit: null, searchTerms: null, dryRun: false, concurrency: 6, skipExisting: false, refetchAfterDays: null, recent: 0, locations: null }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === "--limit") a.limit = parseInt(argv[++i] ?? "0", 10) || null
    else if (t === "--search-terms") a.searchTerms = argv[++i] ?? null
    // --location "Victoria" (or "Victoria,Saanich"): WorkBC server-side city filter. Combine with an
    // empty --search-terms "" to collect EVERY posting in that city regardless of keyword/category.
    else if (t === "--location") a.locations = argv[++i] ?? null
    else if (t === "--dry-run") a.dryRun = true
    else if (t === "--concurrency") a.concurrency = Math.max(1, parseInt(argv[++i] ?? "6", 10) || 6)
    // --skip-existing (alias --new-only): the daily incremental mode — only fetch detail for
    // postings not already in the DB, so a re-run does work only for genuinely new jobs.
    else if (t === "--skip-existing" || t === "--new-only") a.skipExisting = true
    // --refetch-after-days N, with --skip-existing: still refetch a known posting not fetched for N
    // days, so an edit on WorkBC reaches the row. WorkBC's search gives no last-updated date.
    else if (t === "--refetch-after-days") a.refetchAfterDays = Math.max(1, parseInt(argv[++i] ?? "", 10) || 28)
    // --recent [day|week]: ask WorkBC server-side for only recently-posted jobs (SearchDateSelection
    // 1≈last day / 2≈last week). Bare --recent = day. The cheap way to fetch incremental changes.
    else if (t === "--recent") {
      const v = argv[i + 1]
      if (v === "day") { a.recent = 1; i++ }
      else if (v === "week") { a.recent = 2; i++ }
      else a.recent = 1
    }
  }
  return a
}

async function main() {
  const args = parseArgs()
  const logPath = `logs/scrape-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`
  const log = new JsonlLogger(logPath)
  const t0 = Date.now()
  const run = args.dryRun ? null : await startScrapeRun(process.argv.slice(2))
  const counts: ScrapeCounts = { listed: 0, toFetch: 0, written: 0, sentBack: 0, failed: 0 }
  let crash: string | undefined

  try {
    // Phase A: search (WorkBC JSON API)
    const locations = (args.locations ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(cityLocation)
    // With a location filter, an empty keyword means "every posting in this city". Without a location,
    // an empty keyword would pull all 27k BC jobs, so we keep the software-engineer default there.
    const rawTerms = args.searchTerms ?? webEnv.WORKBC_SEARCH_TERMS ?? (locations.length ? "" : "software engineer")
    const terms = rawTerms.split(",").map((s) => s.trim()).filter(Boolean)
    // A location-only run (empty keyword) still needs one search pass — use a single blank keyword.
    if (terms.length === 0 && locations.length) terms.push("")
    // --recent windows are small (tens–hundreds); default the cap high so it exhausts the whole
    // window across all terms rather than stopping at the normal 50. A city sweep can be large too.
    const target = args.limit ?? (args.recent || locations.length ? 5000 : 50)
    if (locations.length) console.log(`[scrape] --location: ${locations.map((l) => l.City).join(", ")}`)
    if (args.recent) console.log(`[scrape] --recent: only postings from the last ${args.recent === 1 ? "day" : "week"}`)
    const byId = new Map<string, JobStub>()
    for (const term of terms) {
      log.log({ stage: "search:start", ok: true, meta: { term } })
      const found = await searchJobsApi(
        term,
        target,
        (pg, total, count) => console.log(`[search] "${term}" page ${pg}: ${total} collected / ${count} total results`),
        args.recent,
        locations,
      )
      for (const s of found) if (!byId.has(s.workbcId)) byId.set(s.workbcId, s)
      console.log(`[search] "${term}": ${found.length} stubs (running total ${byId.size})`)
      if (byId.size >= target) break
    }
    let stubs = [...byId.values()].slice(0, target)
    counts.listed = stubs.length
    log.log({ stage: "search:done", ok: stubs.length > 0, meta: { stubCount: stubs.length } })
    if (stubs.length === 0) {
      console.error("Hard exit: 0 listings found. DB not touched.")
      process.exitCode = 2
      return
    }
    console.log(`[search] processing ${stubs.length} stubs`)

    // Incremental mode: drop postings already in the DB so we only fetch detail for new ones.
    if (args.skipExisting && !args.dryRun) {
      const existing = await prisma.job.findMany({
        where: { workbcId: { in: stubs.map((s) => s.workbcId) } },
        select: { workbcId: true, fetchedAt: true, scrapedAt: true },
      })
      const now = new Date()
      const days = args.refetchAfterDays
      const known = new Set(existing.filter((e) => days === null || !dueForRefetch(e, days, now)).map((e) => e.workbcId))
      const before = stubs.length
      stubs = stubs.filter((s) => !known.has(s.workbcId))
      const refetch = existing.length - known.size
      console.log(
        `[scrape] --skip-existing: ${existing.length} already in DB (${refetch} due a refetch${days === null ? "" : ` after ${days} days`}), ` +
          `${stubs.length} to fetch (of ${before})`,
      )
      if (stubs.length === 0) {
        console.log("[scrape] nothing new to collect — done.")
        return
      }
    }

    counts.toFetch = stubs.length

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

    // The rows this scrape may update, to decide per posting whether the update leaves its rating.
    const previous = new Map(
      (args.dryRun
        ? []
        : await prisma.job.findMany({
            where: { workbcId: { in: stubs.map((s) => s.workbcId) } },
            select: {
              workbcId: true,
              title: true,
              descriptionMd: true,
              externalApplyUrl: true,
              salary: true,
              location: true,
              employerId: true,
              applicationFlags: true,
              status: true,
              verdictKind: true,
            },
          })
      ).map((r) => [r.workbcId, r]),
    )

    // Phase B: per-job detail (WorkBC JSON API) + flags + upsert, run with bounded concurrency.
    const limit = pLimit(args.concurrency)
    let done = 0
    await Promise.all(
      stubs.map((stub) =>
        limit(async () => {
          const dt0 = Date.now()
          const detail = await fetchJobDetailApi(stub.workbcId).catch(() => null)
          if (!detail) {
            counts.failed++
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
            const prev = previous.get(stub.workbcId)
            // A confirmed impersonation was re-attributed to the real company and given the
            // apply_host_mismatch flag. The posting still names the brand, so updating it from
            // WorkBC would point it back at the brand and drop the flag while its 90 stayed.
            const impersonation = prev?.verdictKind === "IMPERSONATION"
            const name = stub.employerName ?? detail.employerName
            // Phase A.5 registered only the stubs' names, so a name found in the detail alone is
            // created here; writing null instead detached the posting and sent it back to pending.
            // With no name anywhere the earlier attribution stands.
            const employerId = name
              ? empIdCache.get(normalizeEmployer(name)) ?? (await findOrCreateEmployer(name))
              : prev?.employerId ?? null
            // The detail's address and apply link are the impersonator's, not the brand's it names.
            if (employerId && !impersonation && (detail.addressRaw || externalApplyUrl)) {
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
              // Parsed alongside the raw string so a fresh posting is filterable by date without
              // waiting for `npm run backfill-posted-date`. Null when the raw value is missing,
              // ambiguous or junk (lib/shared/posted-date.ts).
              postedDate: parsePostedDate(detail.postedAt),
              sourceUrl: stub.sourceUrl,
              descriptionMd: detail.descriptionMd,
              externalApplyUrl,
              externalApplyHost,
              atsProvider,
              externalApplyOk: null,
              applicationFlags: (prev
                ? keepJudgeFlags(
                    { externalApplyUrl: prev.externalApplyUrl, flags: parseFlags(prev.applicationFlags) },
                    { externalApplyUrl, flags: appFlags },
                  )
                : appFlags) as never,
              nocCode,
              nocGroup,
              category: categoryForNoc(nocCode),
              fetchedAt: new Date(),
            }
            const { employerId: _employerId, applicationFlags: _flags, ...unattributed } = fields
            const changed = prev?.status === "PUBLISHED" && !impersonation && contentChanged(prev, fields)
            if (changed) counts.sentBack++
            const update = { ...(impersonation ? unattributed : fields), ...(changed ? SENT_BACK : {}) }
            await prisma.job.upsert({ where: { workbcId: stub.workbcId }, create: { workbcId: stub.workbcId, ...fields }, update })
            counts.written++
          }
          log.log({ workbcId: stub.workbcId, stage: "detail", ok: true, durationMs: Date.now() - dt0, meta: { flagCount: appFlags.length, ats: atsProvider } })
          if (++done % 100 === 0) console.log(`[detail] ${done}/${stubs.length} processed`)
        }),
      ),
    )

    console.log(`\n=== SCRAPE SUMMARY ===`)
    console.log(`Wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    console.log(`Collected ${counts.written} postings from ${empIdCache.size} employers; ${counts.sentBack} published postings changed on WorkBC and went back to pending; ${counts.failed} detail fetch failures`)
    console.log(`Next: run the judge-postings skill (or npm run judge-keyless:fetch) to evaluate pending postings.`)
    console.log(`Log: ${logPath}`)
    if (!args.dryRun && counts.written > 0) await requestRevalidation()
  } catch (e) {
    crash = (e as Error).message ?? String(e)
    throw e
  } finally {
    if (run) {
      const outcome = await finishScrapeRun(run, counts, crash).catch((e) => {
        console.error(`[scrape] could not record the run: ${(e as Error).message}`)
        return null
      })
      if (outcome) console.log(`[scrape] run ${run}: ${outcome}`)
      if (outcome === "FAILED" && !process.exitCode) process.exitCode = 1
    }
    await prisma.$disconnect().catch(() => {})
    log.close()
  }
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
