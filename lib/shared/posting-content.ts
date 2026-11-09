// What a judgment of a posting rests on, as the scraper writes it. When any of it changes on WorkBC
// the published rating describes a posting that no longer exists, so the scraper sends it back.
// Flags are left out: they derive from the description, and later steps add flags of their own.
import type { ApplicationFlag } from "./json-schemas"

export type PostingContent = {
  title: string
  descriptionMd: string
  externalApplyUrl: string | null
  salary: string | null
  location: string | null
  employerId: string | null
}

const FIELDS: Array<keyof PostingContent> = ["title", "descriptionMd", "externalApplyUrl", "location", "employerId"]

const amounts = (s: string) => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => parseFloat(n.replace(/,/g, "")))

/**
 * WorkBC re-derives some annual ranges and shifts them by a dollar between fetches ("$86,154" then
 * "$86,153"), which on 2026-11-09 was a third of the salary differences in a 150-posting sample. A
 * wording change or any amount moving by more than 1% or $2 still counts.
 */
export function salaryChanged(before: string | null, after: string | null): boolean {
  if ((before ?? "") === (after ?? "")) return false
  if (!before || !after) return true
  const a = amounts(before), b = amounts(after)
  if (a.length === 0 || a.length !== b.length) return true
  if (before.replace(/[\d,.]/g, "") !== after.replace(/[\d,.]/g, "")) return true
  return a.some((x, i) => Math.abs(x - b[i]) > Math.max(2, 0.01 * Math.abs(x)))
}

export function contentChanged(before: PostingContent, after: PostingContent): boolean {
  return FIELDS.some((f) => (before[f] ?? null) !== (after[f] ?? null)) || salaryChanged(before.salary, after.salary)
}

/** Whether an existing posting is due a fresh detail fetch under --refetch-after-days. */
export function dueForRefetch(row: { fetchedAt: Date | null; scrapedAt: Date }, days: number, now: Date): boolean {
  const last = row.fetchedAt ?? row.scrapedAt
  return now.getTime() - last.getTime() >= days * 86_400_000
}

/**
 * Flags a judge run adds after the scrape, which a refetch would otherwise drop by replacing the
 * flags wholesale. apply_host_mismatch_review records an uncertain impersonation answer about the
 * apply link, so it is kept only while the link is unchanged; a new link is checked afresh.
 */
const ADDED_BY_JUDGE = ["apply_host_mismatch_review"]

export function keepJudgeFlags(
  before: { externalApplyUrl: string | null; flags: ApplicationFlag[] },
  after: { externalApplyUrl: string | null; flags: ApplicationFlag[] },
): ApplicationFlag[] {
  if ((before.externalApplyUrl ?? null) !== (after.externalApplyUrl ?? null)) return after.flags
  const kept = before.flags.filter((f) => ADDED_BY_JUDGE.includes(f.flag) && !after.flags.some((g) => g.flag === f.flag))
  return [...after.flags, ...kept]
}
