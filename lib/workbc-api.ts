import type { JobStub } from "./scrape-workbc"

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
