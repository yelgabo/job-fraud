type AtsRule = { test: (host: string) => boolean; provider: string }

const RULES: AtsRule[] = [
  { test: (h) => /\.myworkdaysite\.com$/i.test(h) || /\.myworkdayjobs\.com$/i.test(h), provider: "workday" },
  { test: (h) => /(^|\.)greenhouse\.io$/i.test(h), provider: "greenhouse" },
  { test: (h) => /^jobs\.lever\.co$/i.test(h), provider: "lever" },
  { test: (h) => /\.bamboohr\.com$/i.test(h), provider: "bamboohr" },
  { test: (h) => /\.icims\.com$/i.test(h), provider: "icims" },
  { test: (h) => /\.taleo\.net$/i.test(h), provider: "taleo" },
  { test: (h) => /^jobs\.smartrecruiters\.com$/i.test(h), provider: "smartrecruiters" },
  { test: (h) => /^jobs\.ashbyhq\.com$/i.test(h), provider: "ashby" },
]

export function classifyHost(hostname: string): string {
  for (const rule of RULES) if (rule.test(hostname)) return rule.provider
  return "unknown"
}

export function isKnownAts(provider: string): boolean {
  return provider !== "unknown" && provider !== ""
}
