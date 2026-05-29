import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { chromium, type Browser, type BrowserContext, type Page } from "playwright"
import { prisma } from "../lib/db"
import { loadScrapeEnv } from "../lib/env"
import { parseListingCards, parseDetail, type JobStub, type DetailFields } from "../lib/scrape-workbc"
import { extractBodyText } from "../lib/scrape-external"
import { classifyHost, isKnownAts } from "../lib/ats-registry"
import { detectFlags, type ApplicationFlag } from "../lib/application-flags"
import { normalizeEmployer } from "../lib/normalize-employer"
import { searchJobsApi } from "../lib/workbc-api"
import { JsonlLogger } from "./logger"

// SCRAPE = collect only. It searches, fetches detail pages, derives deterministic application
// flags, and upserts RAW postings (score fields left null = "pending"). All evaluation
// (employer web-verification + Claude fraud scoring) happens in the separate `judge` phase.

type Args = {
  fixtures: string | null
  dryRun: boolean
  limit: number | null
  captureFixtures: string | null
  searchTerms: string | null
}

function parseArgs(): Args {
  const a: Args = {
    fixtures: null,
    dryRun: false,
    limit: null,
    captureFixtures: null,
    searchTerms: null,
  }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === "--fixtures") a.fixtures = argv[++i] ?? null
    else if (t === "--dry-run") a.dryRun = true
    else if (t === "--limit") a.limit = parseInt(argv[++i] ?? "0", 10) || null
    else if (t === "--capture-fixtures") a.captureFixtures = argv[++i] ?? null
    else if (t === "--search-terms") a.searchTerms = argv[++i] ?? null
  }
  return a
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

const POLITE_DETAIL_DELAY = 1500
const POLITE_EXTERNAL_DELAY = 2000

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchHtmlPW(page: Page, url: string, sentinelSel: string | null, timeoutMs = 20000): Promise<string> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs })
  if (sentinelSel) {
    await page.waitForSelector(sentinelSel, { timeout: timeoutMs }).catch(() => {})
  }
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {})
  await sleep(800)
  return await page.content()
}

function readFixtureOr(fixturesDir: string | null, name: string): string | null {
  if (!fixturesDir) return null
  const path = join(fixturesDir, name)
  if (!existsSync(path)) return null
  return readFileSync(path, "utf8")
}

function writeFixture(fixturesDir: string, name: string, content: string) {
  if (!existsSync(fixturesDir)) mkdirSync(fixturesDir, { recursive: true })
  writeFileSync(join(fixturesDir, name), content, "utf8")
}

async function getDetailHtml(args: Args, page: Page | null, stub: JobStub): Promise<string | null> {
  if (args.fixtures) {
    return readFixtureOr(args.fixtures, `detail-${stub.workbcId}.html`)
  }
  if (!page) return null
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const html = await fetchHtmlPW(page, stub.sourceUrl, "h1, [class*='job-detail']", 20000)
      if (args.captureFixtures) writeFixture(args.captureFixtures, `detail-${stub.workbcId}.html`, html)
      return html
    } catch (e) {
      lastErr = e
      await sleep(3000)
    }
  }
  console.error(`[detail ${stub.workbcId}] failed:`, lastErr)
  return null
}

async function getExternalHtml(
  args: Args,
  context: BrowserContext | null,
  workbcId: string,
  url: string,
): Promise<string | null> {
  if (args.fixtures) {
    return readFixtureOr(args.fixtures, `external-${workbcId}.html`)
  }
  if (!context) return null
  let page: Page | null = null
  try {
    page = await context.newPage()
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {})
    await sleep(1000)
    const html = await page.content()
    if (args.captureFixtures) writeFixture(args.captureFixtures, `external-${workbcId}.html`, html)
    return html
  } catch (e) {
    console.error(`[external ${workbcId}] failed:`, (e as Error).message)
    return null
  } finally {
    if (page) await page.close().catch(() => {})
  }
}

type EnrichedJob = {
  stub: JobStub
  detail: DetailFields
  externalApplyUrl: string | null
  externalApplyHost: string | null
  atsProvider: string | null
  externalApplyOk: boolean | null
  applicationFlags: ApplicationFlag[]
  descriptionMd: string
}

type EmployerRow = {
  nameNormalized: string
  nameDisplay: string
  website: string | null
  applicationUrl: string | null
  addressRaw: string | null
}

async function main() {
  const args = parseArgs()
  const env = loadScrapeEnv()
  const isOffline = Boolean(args.fixtures)
  const logPath = `logs/scrape-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`
  const log = new JsonlLogger(logPath)
  const t0 = Date.now()

  let browser: Browser | null = null
  let workbcContext: BrowserContext | null = null
  let externalContext: BrowserContext | null = null
  let workbcPage: Page | null = null

  const onExit = async () => {
    try {
      if (browser) await browser.close()
    } catch {}
  }
  process.once("SIGTERM", () => {
    onExit().finally(() => process.exit(143))
  })

  try {
    if (!isOffline) {
      browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] })
      workbcContext = await browser.newContext({
        userAgent: UA,
        viewport: { width: 1366, height: 768 },
        extraHTTPHeaders: { "Accept-Language": "en-CA,en;q=0.9" },
      })
      externalContext = await browser.newContext({
        userAgent: UA,
        viewport: { width: 1366, height: 768 },
        extraHTTPHeaders: { "Accept-Language": "en-CA,en;q=0.9" },
      })
      workbcPage = await workbcContext.newPage()
    }

    // Phase A: collect job stubs
    let stubs: JobStub[]
    if (isOffline) {
      // Offline/fixtures: replay the saved search HTML (tests + offline dev).
      log.log({ stage: "search:start", ok: true, meta: { offline: true } })
      const h = readFixtureOr(args.fixtures, "workbc-search.html")
      if (!h) throw new Error("fixtures missing workbc-search.html")
      stubs = parseListingCards(h)
    } else {
      // Online: WorkBC's JSON JobSearch API — reliable pagination + employer/city per row.
      const terms = (args.searchTerms ?? env.WORKBC_SEARCH_TERMS ?? "software engineer")
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
      stubs = [...byId.values()]
    }
    log.log({ stage: "search:done", ok: stubs.length > 0, meta: { stubCount: stubs.length } })
    if (stubs.length === 0) {
      console.error("Hard exit: 0 listings found. DB not touched.")
      process.exitCode = 2
      return
    }
    const limited = args.limit ? stubs.slice(0, args.limit) : stubs
    console.log(`[search] ${stubs.length} stubs; processing ${limited.length}`)

    // Phase B: detail + external pages, sequential
    const enriched: EnrichedJob[] = []
    for (const stub of limited) {
      const dt0 = Date.now()
      const html = await getDetailHtml(args, workbcPage, stub)
      if (!html) {
        log.log({ workbcId: stub.workbcId, stage: "detail", ok: false, error: "fetch_failed", durationMs: Date.now() - dt0 })
        if (!isOffline) await sleep(POLITE_DETAIL_DELAY)
        continue
      }
      const detail = parseDetail(html)
      const appFlags = detectFlags(detail.applyMethodText + "\n" + detail.descriptionMd)

      let externalApplyUrl: string | null = null
      let externalApplyHost: string | null = null
      let atsProvider: string | null = null
      let externalApplyOk: boolean | null = null
      let descriptionMd = detail.descriptionMd

      if (detail.applyUrl) {
        try {
          const u = new URL(detail.applyUrl)
          if (!/workbc\.ca$/i.test(u.hostname)) {
            externalApplyUrl = detail.applyUrl
            externalApplyHost = u.hostname
            atsProvider = classifyHost(u.hostname)
            if (isKnownAts(atsProvider)) appFlags.push({ flag: "ats_known_provider", evidence: u.hostname })
            const extHtml = await getExternalHtml(args, externalContext, stub.workbcId, detail.applyUrl)
            if (extHtml) {
              externalApplyOk = true
              const body = extractBodyText(extHtml, atsProvider)
              descriptionMd = descriptionMd + "\n\n---\n\n" + body
              for (const f of detectFlags(body)) if (!appFlags.find((x) => x.flag === f.flag)) appFlags.push(f)
            } else {
              externalApplyOk = false
              appFlags.push({ flag: "external_apply_unreachable", evidence: detail.applyUrl })
            }
          }
        } catch {
          // bad URL
        }
        if (!isOffline) await sleep(POLITE_EXTERNAL_DELAY)
      }

      enriched.push({ stub, detail, externalApplyUrl, externalApplyHost, atsProvider, externalApplyOk, applicationFlags: appFlags, descriptionMd })
      log.log({ workbcId: stub.workbcId, stage: "detail", ok: true, durationMs: Date.now() - dt0, meta: { flagCount: appFlags.length, ats: atsProvider } })
      if (!isOffline) await sleep(POLITE_DETAIL_DELAY)
    }
    console.log(`[detail] enriched ${enriched.length}/${limited.length}`)

    // Phase C: employer identity dedupe (no checks — those are part of `judge`)
    const employerMap = new Map<string, EmployerRow>()
    for (const e of enriched) {
      const display = e.detail.employerName ?? e.stub.employerName ?? null
      if (!display) continue
      const key = normalizeEmployer(display)
      if (!key || employerMap.has(key)) continue
      employerMap.set(key, {
        nameNormalized: key,
        nameDisplay: display,
        website: e.detail.employerWebsite,
        applicationUrl: e.externalApplyUrl,
        addressRaw: e.detail.addressRaw,
      })
    }
    console.log(`[employers] ${employerMap.size} unique employers`)

    // Phase D: upsert raw postings (accumulate; no TRUNCATE). Scoring stays null = pending.
    if (args.dryRun) {
      console.log(`[scrape] dry-run: ${enriched.length} postings collected, not written`)
    } else {
      const empIdMap = new Map<string, string>()
      for (const emp of employerMap.values()) {
        const row = await prisma.employer.upsert({
          where: { nameNormalized: emp.nameNormalized },
          // create with identity only; existing employers keep their judge-populated checks/checkedAt
          create: {
            nameNormalized: emp.nameNormalized,
            nameDisplay: emp.nameDisplay,
            website: emp.website,
            applicationUrl: emp.applicationUrl,
            addressRaw: emp.addressRaw,
          },
          update: {
            nameDisplay: emp.nameDisplay,
            website: emp.website ?? undefined,
            applicationUrl: emp.applicationUrl ?? undefined,
            addressRaw: emp.addressRaw ?? undefined,
          },
        })
        empIdMap.set(emp.nameNormalized, row.id)
      }

      let written = 0
      for (const e of enriched) {
        const empKey = e.detail.employerName ?? e.stub.employerName
        const empId = empKey ? empIdMap.get(normalizeEmployer(empKey)) ?? null : null
        const fields = {
          employerId: empId,
          title: e.detail.title || e.stub.title,
          location: e.detail.location ?? e.stub.location ?? null,
          salary: e.detail.salary,
          postedAt: e.detail.postedAt,
          sourceUrl: e.stub.sourceUrl,
          descriptionMd: e.descriptionMd,
          externalApplyUrl: e.externalApplyUrl,
          externalApplyHost: e.externalApplyHost,
          atsProvider: e.atsProvider,
          externalApplyOk: e.externalApplyOk,
          applicationFlags: e.applicationFlags as never,
        }
        // create as pending; on re-scrape, refresh scraped fields but preserve prior judgment.
        await prisma.job.upsert({ where: { workbcId: e.stub.workbcId }, create: { workbcId: e.stub.workbcId, ...fields }, update: fields })
        written++
      }
      console.log(`[db] upserted ${written} postings (pending judgment), ${employerMap.size} employers`)
    }

    console.log(`\n=== SCRAPE SUMMARY ===`)
    console.log(`Wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    console.log(`Collected: ${enriched.length} of ${limited.length} attempted`)
    console.log(`Next: run \`npm run judge\` to evaluate pending postings.`)
    console.log(`Log: ${logPath}`)
  } finally {
    if (workbcContext) await workbcContext.close().catch(() => {})
    if (externalContext) await externalContext.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
    await prisma.$disconnect().catch(() => {})
    log.close()
  }
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
