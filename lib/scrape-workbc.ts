export type JobStub = {
  workbcId: string
  title: string
  employerName: string | null
  location: string | null
  sourceUrl: string
}

export type DetailFields = {
  title: string
  employerName: string | null
  location: string | null
  salary: string | null
  postedAt: string | null
  addressRaw: string | null
  employerWebsite: string | null
  applyUrl: string | null
  applyMethodText: string
  descriptionMd: string
  nocGroup: string | null
}

function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
}

/** Remove <script>/<style>/comment *contents* — stripping only tags leaks CSS/JS text. */
function stripNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
}

function stripTags(s: string): string {
  return decodeHtml(stripNoise(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

function htmlToMarkdown(html: string): string {
  let s = stripNoise(html)
  s = s.replace(/<br\s*\/?>/gi, "\n")
  s = s.replace(/<\/p>/gi, "\n\n")
  s = s.replace(/<\/(div|li|h[1-6])>/gi, "\n")
  s = s.replace(/<li[^>]*>/gi, "- ")
  s = s.replace(/<[^>]+>/g, " ")
  s = decodeHtml(s)
  s = s.replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  return s
}

/**
 * Parse the WorkBC search results page HTML. WorkBC is an Angular SPA that
 * exposes job results either inline in templated cards OR via a JSON-LD island.
 * This parser tries multiple strategies and is intentionally permissive.
 */
export function parseListingCards(html: string): JobStub[] {
  const out: JobStub[] = []
  const seen = new Set<string>()

  // Strategy 1: links matching #/job-details/<id>
  const linkRe = /href="([^"#]*#\/job-details\/(\d+)[^"]*)"[^>]*>([^<]+)</gi
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html))) {
    const workbcId = m[2]
    if (seen.has(workbcId)) continue
    seen.add(workbcId)
    const title = decodeHtml(m[3]).trim()
    const sourceUrl = m[1].startsWith("http")
      ? m[1]
      : `https://www.workbc.ca${m[1].startsWith("/") ? "" : "/"}${m[1]}`
    out.push({
      workbcId,
      title,
      employerName: null,
      location: null,
      sourceUrl,
    })
  }

  // Strategy 2: JSON blob embedded in script tag (best-effort)
  if (out.length === 0) {
    const jsonRe = /"JobPostingId"\s*:\s*"?(\d+)"?[^}]*?"Title"\s*:\s*"([^"]+)"[^}]*?"Employer"\s*:\s*"?([^",}]*)/g
    let j: RegExpExecArray | null
    while ((j = jsonRe.exec(html))) {
      const id = j[1]
      if (seen.has(id)) continue
      seen.add(id)
      out.push({
        workbcId: id,
        title: decodeHtml(j[2]),
        employerName: j[3] ? decodeHtml(j[3]).trim() || null : null,
        location: null,
        sourceUrl: `https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/${id}`,
      })
    }
  }
  return out
}

function pickAfterLabel(text: string, label: RegExp): string | null {
  const m = text.match(label)
  if (!m) return null
  const start = (m.index ?? 0) + m[0].length
  const tail = text.slice(start, start + 400)
  const cut = tail.split(
    /\n|\s{4,}|(?:Employer|Location|Salary|Wage|Posted|Last updated|How to apply|Address|Job type|Job number|Work schedule|Workplace type|Start date|vacanc|Benefits|Education|Experience|views)\b/,
  )[0]
  const v = cut.trim().replace(/^[:\-–\s]+/, "").trim()
  return v || null
}

export function parseDetail(html: string): DetailFields {
  const clean = stripNoise(html)
  const text = stripTags(clean)
  const lower = text.toLowerCase()

  // WorkBC renders the job title in the first non-"Breadcrumb" <h2>; the <h1> is
  // boilerplate ("JOB POSTING"). Fall back to "" so the pipeline uses the search stub.
  const h2s = [...clean.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => stripTags(m[1]))
  let title = h2s.find((t) => t.length > 0 && !/^breadcrumb$/i.test(t)) ?? ""
  if (/^job posting$/i.test(title)) title = ""

  // Employer name sits between the title and the "Location:" label in the rendered text.
  // WorkBC has no "Employer:" label, so the old label scrape always returned null.
  const locIdx = text.search(/\blocation\s*[:\-]/i)
  let employerName: string | null = null
  if (title && locIdx > 0) {
    const before = text.slice(0, locIdx)
    const tIdx = before.lastIndexOf(title)
    if (tIdx >= 0) {
      const cand = before
        .slice(tIdx + title.length)
        .trim()
        .replace(/[•·\-–|,;]+$/, "")
        .trim()
      if (cand && cand.length <= 80) employerName = cand
    }
  }
  const location =
    pickAfterLabel(text, /\blocation\s*[:\-]/i) ??
    pickAfterLabel(text, /\bcity\s*[:\-]/i)
  const salary =
    pickAfterLabel(text, /\bsalary\s*[:\-]/i) ??
    pickAfterLabel(text, /\bwage\s*[:\-]/i) ??
    pickAfterLabel(text, /\bcompensation\s*[:\-]/i)
  const postedAt =
    pickAfterLabel(text, /\bposted\s*on\s*[:\-]/i) ??
    pickAfterLabel(text, /\bdate\s*posted\s*[:\-]/i) ??
    pickAfterLabel(text, /\bposted\s*[:\-]/i)
  const addressRaw =
    pickAfterLabel(text, /\baddress\s*[:\-]/i) ??
    pickAfterLabel(text, /\bbusiness\s*address\s*[:\-]/i)

  const urlMatch = html.match(
    /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>\s*(apply|click here to apply|application)\b/i,
  )
  const applyUrl = urlMatch ? urlMatch[1] : null

  const webMatch = html.match(
    /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>\s*(?:visit\s+website|company\s+website|employer\s+website|website)\b/i,
  )
  const employerWebsite = webMatch ? webMatch[1] : null

  // "How to apply" section
  const applyIdx = lower.indexOf("how to apply")
  let applyMethodText = ""
  if (applyIdx >= 0) {
    applyMethodText = text.slice(applyIdx, applyIdx + 2000)
  }

  // Description body: the WorkBC SPA has no stable description container class, so take the
  // posting body from the "Location:" label (start of the posting facts) up to the site
  // footer, trimming the top nav and the global footer boilerplate.
  const descStart = locIdx > 0 ? locIdx : 0
  const footerOffset = text
    .slice(descStart)
    .search(/JOBS AND CAREERS|EXPLORE CAREERS|Was this page helpful|WorkBC Centres|©\s*\d{4}/i)
  const descEnd = footerOffset > 0 ? descStart + footerOffset : Math.min(text.length, descStart + 8000)
  const descriptionMd = text.slice(descStart, descEnd).trim().slice(0, 8000)

  return {
    title,
    employerName,
    location,
    salary,
    postedAt,
    addressRaw,
    employerWebsite,
    applyUrl,
    applyMethodText,
    descriptionMd,
    nocGroup: null, // legacy HTML parser doesn't extract NOC; the JSON API path does
  }
}
