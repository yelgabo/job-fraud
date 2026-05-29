export type ProbeResult = {
  reachable: boolean
  statusCode: number | null
  contentType: string | null
  finalUrl: string | null
  isFile: boolean
}

const BINARY_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats",
  "application/zip",
  "application/octet-stream",
  "application/x-zip",
]

export async function probe(url: string, timeoutMs = 10_000): Promise<ProbeResult> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "job-fraud/0.1 probe",
        Accept: "text/html,*/*;q=0.5",
      },
    })
    const contentType = res.headers.get("content-type") ?? null
    const isFile =
      BINARY_TYPES.some((t) => contentType?.toLowerCase().startsWith(t)) ||
      /attachment/i.test(res.headers.get("content-disposition") ?? "")
    return {
      reachable: res.ok,
      statusCode: res.status,
      contentType,
      finalUrl: res.url,
      isFile,
    }
  } catch {
    return { reachable: false, statusCode: null, contentType: null, finalUrl: null, isFile: false }
  } finally {
    clearTimeout(t)
  }
}
