import type { JobStub, DetailFields } from "./scrape-workbc"

// The WorkBC SPA fetches results from this JSON API. It returns clean structured data
// (employer, city, salary, dates) and paginates reliably via Page/PageSize — far better than
// scraping the ~20 rendered cards per page. Discovered by capturing the SPA's network traffic.
const JOB_SEARCH_API =
  "https://workbc-jb.a55eb5-prod.stratus.cloud.gov.bc.ca/api/Search/JobSearch"

const PAGE_SIZE = 50

type ApiJob = {
  JobId: string
  Title: string
  EmployerName: string | null
  City: string | null
  SalarySummary: string | null
}

type JobSearchResponse = {
  result: ApiJob[]
  count: number
  pageNumber: number
  pageSize: number
}

function searchBody(keyword: string, page: number) {
  return {
    Page: page,
    PageSize: String(PAGE_SIZE),
    SalaryMin: "",
    SalaryMax: "",
    Keyword: keyword,
    SearchInField: "all",
    SearchDateSelection: 0,
    SearchJobEducationLevel: [],
    SalaryType: 4,
    SearchLocationDistance: -1,
    SearchLocations: [],
    SearchSalaryConditions: [],
    SortOrder: 11,
    SearchIndustry: [],
    SearchIsPostingsInEnglish: true,
    NocCode: "",
    SearchNocField: "",
    SearchJobSource: "0",
    SearchExcludePlacementAgencyJobs: false,
  }
}

/** Map one API result row to the internal JobStub shape. */
export function apiJobToStub(j: ApiJob): JobStub {
  return {
    workbcId: String(j.JobId),
    title: (j.Title ?? "").trim(),
    employerName: j.EmployerName?.trim() || null,
    location: j.City?.trim() || null,
    sourceUrl: `https://www.workbc.ca/search-and-prepare-job/find-jobs#/job-details/${j.JobId}`,
  }
}

async function fetchPage(keyword: string, page: number): Promise<JobSearchResponse> {
  const resp = await fetch(JOB_SEARCH_API, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(searchBody(keyword, page)),
  })
  if (!resp.ok) throw new Error(`JobSearch API ${resp.status} for "${keyword}" page ${page}`)
  return (await resp.json()) as JobSearchResponse
}

// --- Per-job detail via the WorkBC API (replaces the flaky Angular-SPA HTML scrape, which
// returned stale/duplicated DOM because hash-route changes don't reload the page) ---

const JOB_DETAIL_API = "https://workbc-jb.a55eb5-prod.stratus.cloud.gov.bc.ca/api/Search/GetJobDetail"

type DetailApiItem = {
  Title?: string
  EmployerName?: string | null
  City?: string | null
  Province?: string | null
  SalarySummary?: string | null
  Salary?: number | string | null
  DatePosted?: string | null
  NocGroup?: string | null
  ApplyEmailAddress?: string | null
  ApplyWebsite?: string | null
  ApplyPhoneNumber?: string | null
  ApplyMailRoom?: string | null
  ApplyMailStreet?: string | null
  ApplyMailCity?: string | null
  ApplyMailProvince?: string | null
  ApplyMailPostalCode?: string | null
  ApplyPersonRoom?: string | null
  ApplyPersonStreet?: string | null
  ApplyPersonCity?: string | null
  ApplyPersonProvince?: string | null
  ApplyPersonPostalCode?: string | null
  SkillCategories?: Array<{ Category?: { Name?: string }; Skills?: string[] }> | null
  ProgramDescription?: string | null
  HoursOfWork?: { Description?: string[] } | null
  PeriodOfEmployment?: { Description?: string[] } | null
  WorkplaceType?: string | null
}

function joinParts(parts: Array<string | null | undefined>): string | null {
  const s = parts.map((x) => (x ?? "").toString().trim()).filter(Boolean).join(", ")
  return s || null
}

/** Fetch one posting's full detail from the WorkBC API and map it to DetailFields. */
export async function fetchJobDetailApi(jobId: string): Promise<DetailFields | null> {
  const url = `${JOB_DETAIL_API}?jobId=${encodeURIComponent(jobId)}&language=en&isToggle=false`
  const resp = await fetch(url, { headers: { accept: "application/json" } })
  if (!resp.ok) return null
  const item: DetailApiItem | undefined = (await resp.json())?.result?.[0]
  if (!item) return null

  const mail = joinParts([item.ApplyMailRoom && `Room ${item.ApplyMailRoom}`, item.ApplyMailStreet, item.ApplyMailCity, item.ApplyMailProvince, item.ApplyMailPostalCode])
  const person = joinParts([item.ApplyPersonRoom && `Room ${item.ApplyPersonRoom}`, item.ApplyPersonStreet, item.ApplyPersonCity, item.ApplyPersonProvince, item.ApplyPersonPostalCode])
  const addressRaw = mail ?? person

  const applyParts: string[] = []
  if (item.ApplyEmailAddress) applyParts.push(`By email: ${item.ApplyEmailAddress}`)
  if (item.ApplyWebsite) applyParts.push(`Online: ${item.ApplyWebsite}`)
  if (mail) applyParts.push(`By mail: ${mail}`)
  if (person) applyParts.push(`In person: ${person}`)
  if (item.ApplyPhoneNumber) applyParts.push(`By phone: ${item.ApplyPhoneNumber}`)
  const applyMethodText = applyParts.join("\n")

  const skills = (item.SkillCategories ?? [])
    .map((c) => `${c.Category?.Name ?? "Skills"}: ${(c.Skills ?? []).join(", ")}`)
    .filter((s) => !s.endsWith(": "))
    .join("\n")

  const descriptionMd = [
    item.NocGroup ? `Occupation (NOC): ${item.NocGroup}` : "",
    joinParts([item.City, item.Province]) ? `Location: ${joinParts([item.City, item.Province])}` : "",
    item.SalarySummary ? `Salary: ${item.SalarySummary}` : "",
    item.HoursOfWork?.Description?.length ? `Hours: ${item.HoursOfWork.Description.join(", ")}` : "",
    item.PeriodOfEmployment?.Description?.length ? `Term: ${item.PeriodOfEmployment.Description.join(", ")}` : "",
    item.WorkplaceType ? `Workplace: ${item.WorkplaceType}` : "",
    skills,
    item.ProgramDescription ?? "",
    applyMethodText ? `How to apply:\n${applyMethodText}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000)

  return {
    title: (item.Title ?? "").trim(),
    employerName: item.EmployerName?.trim() || null,
    location: joinParts([item.City, item.Province]),
    salary: item.SalarySummary || (item.Salary ? `$${item.Salary}` : null),
    postedAt: item.DatePosted ? String(item.DatePosted).slice(0, 10) : null,
    addressRaw,
    employerWebsite: null,
    applyUrl: item.ApplyWebsite || null,
    applyMethodText,
    descriptionMd,
    nocGroup: item.NocGroup?.trim() || null,
  }
}

/**
 * Fetch up to `limit` job stubs for a keyword via the WorkBC API, paging until the limit is hit
 * or results are exhausted. Returns stubs (already de-duped by JobId within this call).
 */
export async function searchJobsApi(
  keyword: string,
  limit: number,
  onPage?: (page: number, total: number, count: number) => void,
): Promise<JobStub[]> {
  const byId = new Map<string, JobStub>()
  let page = 1
  let count = Infinity
  while (byId.size < limit && (page - 1) * PAGE_SIZE < count) {
    const res = await fetchPage(keyword, page)
    count = res.count
    for (const j of res.result) {
      const stub = apiJobToStub(j)
      if (stub.workbcId && !byId.has(stub.workbcId)) byId.set(stub.workbcId, stub)
    }
    onPage?.(page, byId.size, count)
    if (res.result.length === 0) break
    page++
  }
  return [...byId.values()].slice(0, limit)
}
