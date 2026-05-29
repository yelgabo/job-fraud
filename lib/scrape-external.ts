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

function stripCommonChrome(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
}

export function extractBodyText(html: string, atsProvider: string | null): string {
  let body = stripCommonChrome(html)

  if (atsProvider === "workday") {
    // Workday content lives in a data-automation-id main area; we don't have JS,
    // so just keep the largest text content
    const m = body.match(/data-automation-id="jobPostingDescription"[\s\S]{0,30000}/i)
    if (m) body = m[0]
  } else if (atsProvider === "greenhouse") {
    const m = body.match(/<div[^>]*id="content"[\s\S]*?<\/div>/i)
    if (m) body = m[0]
  } else if (atsProvider === "lever") {
    const m = body.match(/<div[^>]*class="[^"]*posting-page[\s\S]*?<\/main>/i)
    if (m) body = m[0]
  }

  const text = decodeHtml(body.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
  return text.slice(0, 12000)
}
