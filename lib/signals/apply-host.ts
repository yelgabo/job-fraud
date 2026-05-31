// Extract the ATS *tenant* (the company identifier baked into a multi-tenant ATS URL) and compare
// it to the employer the posting claims to be from. A genuine posting applies via its OWN tenant
// (Remitly -> remitly.wd5.myworkdayjobs.com); a posting that names one brand but routes to a
// different company's tenant (Remitly title -> relx.wd3.myworkdayjobs.com) is brand misuse.
import { normalizeEmployer } from "./normalize-employer"

export type ApplyTenant = { provider: string; tenant: string }

function firstPathSeg(pathname: string): string | null {
  const seg = pathname.split("/").filter(Boolean)[0]
  return seg ? decodeURIComponent(seg) : null
}

/** The company slug from a known multi-tenant ATS apply URL, or null if not recognized. */
export function extractAtsTenant(applyUrl: string): ApplyTenant | null {
  let u: URL
  try {
    u = new URL(applyUrl)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()

  // Workday: <tenant>.wdN.myworkdayjobs.com / .myworkdaysite.com, or <tenant>.myworkdayjobs.com
  let m = host.match(/^([a-z0-9-]+)\.wd\d+\.myworkday(?:jobs|site)\.com$/)
  if (m) return { provider: "workday", tenant: m[1] }
  m = host.match(/^([a-z0-9-]+)\.myworkdayjobs\.com$/)
  if (m) return { provider: "workday", tenant: m[1] }

  // Greenhouse: board hosts carry the tenant in the PATH (boards.greenhouse.io/<t>,
  // job-boards.greenhouse.io/<t>, and regional job-boards.eu.greenhouse.io/<t>); otherwise the
  // tenant is the subdomain (<t>.greenhouse.io).
  if (/(?:^|\.)greenhouse\.io$/.test(host)) {
    const sub = host.replace(/\.greenhouse\.io$/, "")
    if (/^(?:boards|job-boards)(?:\.|$)/.test(sub)) {
      const seg = firstPathSeg(u.pathname)
      if (seg) return { provider: "greenhouse", tenant: seg }
    } else if (sub && sub !== "greenhouse") {
      return { provider: "greenhouse", tenant: sub }
    }
  }

  // Lever: jobs.lever.co/<tenant>
  if (host === "jobs.lever.co") {
    const seg = firstPathSeg(u.pathname)
    if (seg) return { provider: "lever", tenant: seg }
  }

  // SmartRecruiters / Ashby: jobs.<host>/<tenant>
  if (host === "jobs.smartrecruiters.com") {
    const seg = firstPathSeg(u.pathname)
    if (seg) return { provider: "smartrecruiters", tenant: seg }
  }
  if (host === "jobs.ashbyhq.com") {
    const seg = firstPathSeg(u.pathname)
    if (seg) return { provider: "ashby", tenant: seg }
  }

  // BambooHR: <tenant>.bamboohr.com
  m = host.match(/^([a-z0-9-]+)\.bamboohr\.com$/)
  if (m && m[1] !== "www") return { provider: "bamboohr", tenant: m[1] }

  return null
}

/** Lowercase alphanumeric-only slug for tolerant comparison. */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

// Tiny stopword set for acronym building (articles/conjunctions only — NOT corp/inc/group, which
// often appear in real acronyms like PFG = Pattison Food Group).
const ACR_STOP = new Set(["of", "and", "the", "for", "a", "an", "to", "at", "on", "&"])

function nameWords(name: string): string[] {
  return normalizeEmployer(name)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function acronym(words: string[], dropStop: boolean): string {
  return words
    .filter((w) => !(dropStop && ACR_STOP.has(w)))
    .map((w) => w[0])
    .join("")
}

// Heuristic "is the ATS tenant plausibly the same/related entity as the claimed employer?" — used
// to AVOID a web-check on obvious matches (acronyms, prefixes). Conservative by design: it must
// never clear a genuine cross-company case, so acronym rules require length >= 2 (a single-word
// employer like "Remitly" has acronym "r", which we ignore so "Remitly" vs tenant "relx" stays a
// mismatch). Anything it doesn't clear falls through to the web-check, which is the real arbiter.
function looksRelated(employerName: string, tenant: string): boolean {
  const emp = slug(normalizeEmployer(employerName))
  const ten = slug(tenant)
  if (!emp || !ten) return false
  if (emp.includes(ten) || ten.includes(emp)) return true

  const words = nameWords(employerName)
  if (words.length === 0) return false

  for (const acr of [acronym(words, false), acronym(words, true)]) {
    if (acr.length >= 2 && (ten === acr || ten.startsWith(acr) || acr.startsWith(ten))) return true
  }
  // Prefix: tenant begins with the employer's first significant word (Penfolds -> penfoldstime).
  if (words[0].length >= 4 && ten.startsWith(words[0])) return true
  // Tenant embeds a substantive employer word (University of Ottawa -> uottawa contains "ottawa").
  if (words.some((w) => w.length >= 4 && ten.includes(w))) return true
  return false
}

export type TenantMatch = {
  result: "match" | "mismatch" | "no-tenant"
  provider?: string
  tenant?: string
}

// Compares the apply-URL tenant to the claimed employer. "no-tenant" when there's nothing to
// compare (no recognized ATS tenant, or no employer name). Matching is tolerant: a match if either
// normalized name contains the other ("remitly" vs "Remitly Inc."), so only genuinely different
// companies ("relx" vs "remitly") come back as "mismatch".
export function tenantEmployerMatch(employerName: string | null, applyUrl: string | null): TenantMatch {
  if (!applyUrl) return { result: "no-tenant" }
  const t = extractAtsTenant(applyUrl)
  if (!t) return { result: "no-tenant" }
  if (!employerName) return { result: "no-tenant", provider: t.provider, tenant: t.tenant }

  const match = looksRelated(employerName, t.tenant)
  return { result: match ? "match" : "mismatch", provider: t.provider, tenant: t.tenant }
}

// True iff the employer has at least one posting and EVERY posting applies via an ATS tenant that
// matches the employer — i.e. the company is self-evidently real (it applies through its own
// hiring system) and no posting needs a web search. Used by the judge to skip web-verification for
// these employers. Any email/mail/phone/no-ATS posting ("no-tenant") or impersonation ("mismatch")
// makes this false, so those employers still get verified.
export function allApplyHostsMatch(employerName: string | null, applyUrls: Array<string | null>): boolean {
  if (!employerName || applyUrls.length === 0) return false
  return applyUrls.every((u) => tenantEmployerMatch(employerName, u).result === "match")
}

// The first matching ATS provider among an employer's postings (for the presumed-verdict summary).
export function matchedProvider(employerName: string | null, applyUrls: Array<string | null>): string | null {
  for (const u of applyUrls) {
    const m = tenantEmployerMatch(employerName, u)
    if (m.result === "match") return m.provider ?? null
  }
  return null
}
