// Maps a WorkBC posting's NOC (National Occupational Classification, 2021) occupation code to a
// coarse job-type bucket for filtering and analysis. The raw nocCode/nocGroup are stored alongside
// the derived category, so finer drill-down (by exact NOC group) stays possible for graphs.

export const CATEGORIES = [
  "Software & Data",
  "IT & Infrastructure",
  "Engineering",
  "Food Service",
  "Retail & Sales",
  "Office, Admin & Finance",
  "Healthcare",
  "Skilled Trades & Construction",
  "Care",
  "Other",
] as const
export type Category = (typeof CATEGORIES)[number]

// Explicit code assignments inside the NOC "2" (natural & applied sciences) family — everything
// else in "2" is treated as Engineering. Curated with the user (e.g. IS specialists, IS managers,
// DB analysts, and cybersecurity sit under IT, not Software).
const IT_INFRA = new Set(["22220", "22221", "22222", "21222", "20012", "21223", "21220"])
const SOFTWARE_DATA = new Set(["21231", "21232", "21211", "21234", "21221", "21230", "21233"])

/** Map a 5-digit NOC code to a coarse category bucket. */
export function categoryForNoc(code: string | null | undefined): Category {
  if (!code || !/^\d{5}$/.test(code)) return "Other"
  if (IT_INFRA.has(code)) return "IT & Infrastructure"
  if (SOFTWARE_DATA.has(code)) return "Software & Data"
  if (code[0] === "2") return "Engineering" // remaining sciences/engineering/technical occupations
  if (code[0] === "3") return "Healthcare"
  if (code.startsWith("44")) return "Care" // home child care, home support workers
  if (["60030", "62020", "62200"].includes(code) || code.startsWith("632") || code.startsWith("652"))
    return "Food Service" // food managers/supervisors, chefs, cooks/bakers, counter & servers
  if (["60020", "62100"].includes(code) || code.startsWith("641") || code.startsWith("644"))
    return "Retail & Sales"
  if (code[0] === "0" || code[0] === "1") return "Office, Admin & Finance" // mgmt + business/finance/admin
  if (code[0] === "7" || code[0] === "8" || code[0] === "9") return "Skilled Trades & Construction"
  return "Other"
}

// Parse a WorkBC NocGroup string like "Software engineers and designers (21231)" into its trailing
// 5-digit code and keep the full string as the human-readable group label.
export function parseNocGroup(raw: string | null | undefined): { nocCode: string | null; nocGroup: string | null } {
  if (!raw) return { nocCode: null, nocGroup: null }
  const group = raw.trim()
  const m = group.match(/\((\d{5})\)\s*$/)
  return { nocCode: m ? m[1] : null, nocGroup: group || null }
}

/** Pull the NOC group line out of a stored descriptionMd ("Occupation (NOC): ...") — used by backfill. */
export function nocFromDescription(descriptionMd: string): { nocCode: string | null; nocGroup: string | null; category: Category } {
  const m = descriptionMd.match(/Occupation \(NOC\): (.+?)(?:\n|$)/)
  const { nocCode, nocGroup } = parseNocGroup(m ? m[1] : null)
  return { nocCode, nocGroup, category: categoryForNoc(nocCode) }
}
