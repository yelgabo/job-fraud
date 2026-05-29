import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { chromium, type Browser, type BrowserContext, type Page } from "playwright"
import pLimit from "p-limit"
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "../lib/db"
import { loadScrapeEnv, searchUrlForTerm } from "../lib/env"
import { parseListingCards, parseDetail, type JobStub, type DetailFields } from "../lib/scrape-workbc"
import { extractBodyText } from "../lib/scrape-external"
import { classifyHost, isKnownAts } from "../lib/ats-registry"
import { detectFlags, type ApplicationFlag } from "../lib/application-flags"
import { probe } from "../lib/http-probe"
import { geocode } from "../lib/geocode"
import { normalizeEmployer } from "../lib/normalize-employer"
import { cityMatches } from "../lib/address-match"
import { bandFor } from "../lib/risk-band"
import { scoreJob, makeFailedResult, type ScoreInput } from "../lib/scoring"
import { verifyEmployerWeb } from "../lib/verify-employer-web"
import { JsonlLogger } from "./logger"

type Args = {
  fixtures: string | null
  dryRun: boolean
  limit: number | null
  reverifyEmployers: boolean
  captureFixtures: string | null
  verifyWeb: boolean
  searchTerms: string | null
}

function parseArgs(): Args {
  const a: Args = {
    fixtures: null,
    dryRun: false,
    limit: null,
    reverifyEmployers: false,
    captureFixtures: null,
    verifyWeb: true,
    searchTerms: null,
  }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === "--fixtures") a.fixtures = argv[++i] ?? null
    else if (t === "--dry-run") a.dryRun = true
    else if (t === "--limit") a.limit = parseInt(argv[++i] ?? "0", 10) || null
    else if (t === "--reverify-employers") a.reverifyEmployers = true
    else if (t === "--capture-fixtures") a.captureFixtures = argv[++i] ?? null
    else if (t === "--no-verify-web") a.verifyWeb = false
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

/**
 * Navigate the WorkBC SPA to a search URL with a fresh boot, then poll the rendered DOM until the
 * parsed stub count stops growing (results render lazily, so a single capture catches a partial
 * list). Returns the parsed stubs for that term.
 */
async function searchTermStubs(page: Page, url: string): Promise<JobStub[]> {
  await page.goto("about:blank").catch(() => {}) // ensure Angular re-boots and re-runs the search
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
  await page.waitForSelector('[href*="/job-details/"]', { timeout: 30000 }).catch(() => {})
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {})
  let prev = -1
  let stable = 0
  let best: JobStub[] = []
  for (let i = 0; i < 14; i++) {
    await sleep(700)
    const found = parseListingCards(await page.content())
    if (found.length >= best.length) best = found
    if (found.length === prev && found.length > 0) {
      if (++stable >= 2) break
    } else {
      stable = 0
    }
    prev = found.length
  }
  return best
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

async function getSearchHtml(
  args: Args,
  page: Page | null,
  searchUrl: string,
): Promise<string> {
  if (args.fixtures) {
    const h = readFixtureOr(args.fixtures, "workbc-search.html")
    if (!h) throw new Error("fixtures missing workbc-search.html")
    return h
  }
  if (!page) throw new Error("no page")
  const html = await fetchHtmlPW(page, searchUrl, '[href*="/job-details/"]', 30000)
  if (args.captureFixtures) writeFixture(args.captureFixtures, "workbc-search.html", html)
  return html
}

async function getDetailHtml(
  args: Args,
  page: Page | null,
  stub: JobStub,
): Promise<string | null> {
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
  checks: Record<string, unknown>
  checkedAt: Date | null
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
    try { if (browser) await browser.close() } catch {}
  }
  process.once("SIGTERM", () => { onExit().finally(() => process.exit(143)) })

  try {
    if (!isOffline) {
      browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled"],
      })
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

    // Phase A: search page
    const terms = (args.searchTerms ?? env.WORKBC_SEARCH_TERMS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    let stubs: JobStub[]
    if (!isOffline && terms.length > 0) {
      // The WorkBC SPA renders only ~20 cards per query, so query each term and merge by id.
      const byId = new Map<string, JobStub>()
      for (const term of terms) {
        log.log({ stage: "search:start", ok: true, meta: { term } })
        const found = await searchTermStubs(workbcPage!, searchUrlForTerm(term))
        for (const s of found) if (!byId.has(s.workbcId)) byId.set(s.workbcId, s)
        console.log(`[search] term "${term}": ${found.length} stubs (running total ${byId.size})`)
        await sleep(1200)
      }
      stubs = [...byId.values()]
    } else {
      log.log({ stage: "search:start", ok: true, meta: { offline: isOffline, url: env.WORKBC_SEARCH_URL } })
      const searchHtml = await getSearchHtml(args, workbcPage, env.WORKBC_SEARCH_URL)
      stubs = parseListingCards(searchHtml)
    }
    log.log({ stage: "search:done", ok: stubs.length > 0, meta: { stubCount: stubs.length } })
    if (stubs.length === 0) {
      console.error("Hard exit: 0 listings parsed. DB not touched.")
      process.exitCode = 2
      return
    }
    const limited = args.limit ? stubs.slice(0, args.limit) : stubs
    console.log(`[search] parsed ${stubs.length} stubs; processing ${limited.length}`)

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
            if (isKnownAts(atsProvider)) {
              appFlags.push({ flag: "ats_known_provider", evidence: u.hostname })
            }
            const extHtml = await getExternalHtml(args, externalContext, stub.workbcId, detail.applyUrl)
            if (extHtml) {
              externalApplyOk = true
              const body = extractBodyText(extHtml, atsProvider)
              descriptionMd = descriptionMd + "\n\n---\n\n" + body
              const moreFlags = detectFlags(body)
              for (const f of moreFlags) if (!appFlags.find((x) => x.flag === f.flag)) appFlags.push(f)
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

      enriched.push({
        stub,
        detail,
        externalApplyUrl,
        externalApplyHost,
        atsProvider,
        externalApplyOk,
        applicationFlags: appFlags,
        descriptionMd,
      })
      log.log({
        workbcId: stub.workbcId,
        stage: "detail",
        ok: true,
        durationMs: Date.now() - dt0,
        meta: { flagCount: appFlags.length, ats: atsProvider },
      })
      if (!isOffline) await sleep(POLITE_DETAIL_DELAY)
    }
    console.log(`[detail] enriched ${enriched.length}/${limited.length}`)

    // Phase C: employer dedupe + checks
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const employerMap = new Map<string, EmployerRow>()
    const repJob = new Map<string, EnrichedJob>()
    for (const e of enriched) {
      const display = e.detail.employerName ?? e.stub.employerName ?? null
      if (!display) continue
      const key = normalizeEmployer(display)
      if (!key) continue
      if (!repJob.has(key)) repJob.set(key, e)
      if (employerMap.has(key)) continue
      employerMap.set(key, {
        nameNormalized: key,
        nameDisplay: display,
        website: e.detail.employerWebsite,
        applicationUrl: e.externalApplyUrl,
        addressRaw: e.detail.addressRaw,
        checks: {},
        checkedAt: null,
      })
    }
    console.log(`[employers] ${employerMap.size} unique employers`)

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    let newChecks = 0
    let cached = 0
    const toVerify: string[] = []
    for (const emp of employerMap.values()) {
      const existing = await prisma.employer.findUnique({ where: { nameNormalized: emp.nameNormalized } })
      const stale =
        !existing || !existing.checkedAt || Date.now() - existing.checkedAt.getTime() > sevenDaysMs
      if (existing && !stale && !args.reverifyEmployers) {
        emp.checks = (existing.checks as Record<string, unknown>) ?? {}
        emp.checkedAt = existing.checkedAt
        cached++
        continue
      }
      const checks: Record<string, unknown> = {}
      if (emp.website) {
        const p = await probe(emp.website)
        checks.websiteReachable = p.reachable
        checks.websiteStatusCode = p.statusCode
      } else {
        checks.websiteReachable = null
        checks.websiteStatusCode = null
      }
      if (emp.applicationUrl && emp.applicationUrl !== emp.website) {
        const p = await probe(emp.applicationUrl)
        checks.applicationReachable = p.reachable
      } else {
        checks.applicationReachable = null
      }
      if (emp.addressRaw && !isOffline) {
        const g = await geocode(emp.addressRaw, env.NOMINATIM_USER_AGENT)
        checks.addressGeocoded = g.found
        checks.addressMatchConfidence = g.confidence
        checks.addressResolvedTo = g.displayName
        checks.addressMatchesCity = cityMatches(emp.addressRaw, g.displayName)
        checks.addressFlags = []
      } else {
        checks.addressGeocoded = null
        checks.addressMatchConfidence = null
        checks.addressResolvedTo = null
        checks.addressMatchesCity = null
        checks.addressFlags = []
      }
      emp.checks = checks
      emp.checkedAt = new Date()
      newChecks++
      if (args.verifyWeb && !isOffline && !args.dryRun) toVerify.push(emp.nameNormalized)
    }
    console.log(`[employers] checks: ${newChecks} new, ${cached} cached`)

    let webIn = 0
    let webOut = 0
    let webFail = 0
    if (toVerify.length > 0) {
      const webLimit = pLimit(3)
      await Promise.all(
        toVerify.map((key) =>
          webLimit(async () => {
            const emp = employerMap.get(key)!
            const rep = repJob.get(key)
            if (!rep) return
            const vt0 = Date.now()
            try {
              const out = await verifyEmployerWeb(client, {
                employerName: emp.nameDisplay,
                jobTitle: rep.detail.title || rep.stub.title,
                location: rep.detail.location ?? rep.stub.location ?? null,
                descriptionExcerpt: rep.descriptionMd.slice(0, 800),
              })
              emp.checks.web = out.result
              webIn += out.usage.inputTokens
              webOut += out.usage.outputTokens
              log.log({
                stage: "verify-web",
                ok: true,
                durationMs: Date.now() - vt0,
                meta: {
                  employer: emp.nameDisplay,
                  businessMatch: out.result.businessMatch,
                  locationMatch: out.result.locationMatch,
                  hasJobsListing: out.result.hasJobsListing,
                  in: out.usage.inputTokens,
                  out: out.usage.outputTokens,
                },
              })
            } catch (err) {
              webFail++
              emp.checks.web = null
              log.log({
                stage: "verify-web",
                ok: false,
                durationMs: Date.now() - vt0,
                meta: { employer: emp.nameDisplay },
                error: (err as Error).message,
              })
            }
          }),
        ),
      )
      console.log(`[employers] web-verified ${toVerify.length - webFail}/${toVerify.length}, ${webFail} failed`)
    }

    // Phase D: scoring
    const limit = pLimit(5)
    let totalIn = 0
    let totalOut = 0
    let failed = 0

    const scored = await Promise.all(
      enriched.map((e) =>
        limit(async () => {
          if (args.dryRun) {
            return { e, scoreResult: { fraudScore: 50, reasoning: "dry-run", signals: [] } }
          }
          const empKey = e.detail.employerName ?? e.stub.employerName
          const empRow = empKey ? employerMap.get(normalizeEmployer(empKey)) : undefined
          const input: ScoreInput = {
            title: e.detail.title || e.stub.title,
            employerDisplay: empRow?.nameDisplay ?? null,
            location: e.detail.location ?? e.stub.location,
            salary: e.detail.salary,
            postedAt: e.detail.postedAt,
            descriptionMd: e.descriptionMd,
            employerChecks: empRow?.checks ?? null,
            applicationFlags: e.applicationFlags,
            atsProvider: e.atsProvider,
            externalApplyOk: e.externalApplyOk,
          }
          const st0 = Date.now()
          try {
            const out = await scoreJob(client, input)
            totalIn += out.usage.inputTokens
            totalOut += out.usage.outputTokens
            log.log({
              workbcId: e.stub.workbcId,
              stage: "score",
              ok: true,
              durationMs: Date.now() - st0,
              meta: { score: out.result.fraudScore, band: bandFor(out.result.fraudScore), in: out.usage.inputTokens, out: out.usage.outputTokens },
            })
            return { e, scoreResult: out.result }
          } catch (err) {
            failed++
            log.log({
              workbcId: e.stub.workbcId,
              stage: "score",
              ok: false,
              durationMs: Date.now() - st0,
              error: (err as Error).message,
            })
            return { e, scoreResult: makeFailedResult((err as Error).message) }
          }
        }),
      ),
    )
    console.log(`[scoring] ${scored.length} jobs scored, ${failed} failed, tokens in/out: ${totalIn}/${totalOut}`)

    // Phase E: DB write (skip if --dry-run)
    if (args.dryRun) {
      console.log("[db] dry-run, not writing to DB")
      console.log("--- DRY-RUN RESULTS ---")
      for (const s of scored) {
        console.log(
          `[${bandFor(s.scoreResult.fraudScore).padEnd(7)} ${String(s.scoreResult.fraudScore).padStart(3)}] ${s.e.stub.title} — ${s.e.detail.employerName ?? "(hidden)"}`,
        )
      }
    } else {
      // Upsert employers
      const empIdMap = new Map<string, string>()
      for (const emp of employerMap.values()) {
        const row = await prisma.employer.upsert({
          where: { nameNormalized: emp.nameNormalized },
          create: {
            nameNormalized: emp.nameNormalized,
            nameDisplay: emp.nameDisplay,
            website: emp.website,
            applicationUrl: emp.applicationUrl,
            addressRaw: emp.addressRaw,
            checks: emp.checks as never,
            checkedAt: emp.checkedAt,
          },
          update: {
            nameDisplay: emp.nameDisplay,
            website: emp.website ?? undefined,
            applicationUrl: emp.applicationUrl ?? undefined,
            addressRaw: emp.addressRaw ?? undefined,
            checks: emp.checks as never,
            checkedAt: emp.checkedAt,
          },
        })
        empIdMap.set(emp.nameNormalized, row.id)
      }

      // Atomic TRUNCATE + INSERT for jobs
      const rows = scored.map((s) => {
        const empKey = s.e.detail.employerName ?? s.e.stub.employerName
        const empId = empKey ? empIdMap.get(normalizeEmployer(empKey)) ?? null : null
        return {
          workbcId: s.e.stub.workbcId,
          employerId: empId,
          title: s.e.detail.title || s.e.stub.title,
          location: s.e.detail.location ?? s.e.stub.location ?? null,
          salary: s.e.detail.salary,
          postedAt: s.e.detail.postedAt,
          sourceUrl: s.e.stub.sourceUrl,
          descriptionMd: s.e.descriptionMd,
          externalApplyUrl: s.e.externalApplyUrl,
          externalApplyHost: s.e.externalApplyHost,
          atsProvider: s.e.atsProvider,
          externalApplyOk: s.e.externalApplyOk,
          applicationFlags: s.e.applicationFlags as never,
          fraudScore: s.scoreResult.fraudScore,
          riskBand: bandFor(s.scoreResult.fraudScore),
          reasoning: s.scoreResult.reasoning,
          signals: s.scoreResult.signals as never,
        }
      })

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('TRUNCATE TABLE "Job"')
        await tx.job.createMany({ data: rows, skipDuplicates: true })
      })
      console.log(`[db] wrote ${rows.length} jobs, ${employerMap.size} employers`)
    }

    // Summary
    const wallS = ((Date.now() - t0) / 1000).toFixed(1)
    const bands = scored.reduce<Record<string, number>>((acc, s) => {
      const b = bandFor(s.scoreResult.fraudScore)
      acc[b] = (acc[b] ?? 0) + 1
      return acc
    }, {})
    console.log(`\n=== SUMMARY ===`)
    console.log(`Wall time: ${wallS}s`)
    console.log(`Bands: ${JSON.stringify(bands)}`)
    console.log(`Scoring failures: ${failed}`)
    console.log(`Claude tokens: in=${totalIn} out=${totalOut}`)
    console.log(`Web-verify tokens: in=${webIn} out=${webOut}`)
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
