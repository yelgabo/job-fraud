// Which files a keyless apply reads from a run directory, and which of them were applied before.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"

/**
 * A dir contributes its verdicts*.json, cached.json, batch-NNN.json (for the posting lists),
 * impersonation-NNN.json (the check items) and impersonation-result*.json (the helpers' answers),
 * in numeric order (verdicts-2 before verdicts-10). Any other file is ignored. A file named on the
 * command line that matches none of those is read as verdicts. Naming files still reads the fetch's
 * batch and item files from their dir: without them a wave's verdicts scored only the posting each
 * one names, and its impersonation results matched no item.
 */
export function resolveFiles(args: string[]) {
  const verdictFiles: string[] = []
  const cachedFiles: string[] = []
  const batchFiles: string[] = []
  const impersonationItemFiles: string[] = []
  const impersonationResultFiles: string[] = []
  const dirs = new Set<string>()
  const seen = new Set<string>()
  const add = (f: string, explicit: boolean) => {
    if (seen.has(f)) return
    seen.add(f)
    const b = basename(f)
    if (b === "cached.json") cachedFiles.push(f)
    else if (/^batch-\d+\.json$/i.test(b)) batchFiles.push(f)
    else if (/^impersonation-result.*\.json$/i.test(b)) impersonationResultFiles.push(f)
    else if (/^impersonation-\d+\.json$/i.test(b)) impersonationItemFiles.push(f)
    else if (explicit || /^verdicts.*\.json$/i.test(b)) verdictFiles.push(f)
  }
  const sortedNames = (d: string) => readdirSync(d).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
  const named: string[] = []
  for (const a of args) {
    if (statSync(a).isDirectory()) {
      dirs.add(a)
      for (const f of sortedNames(a)) add(join(a, f), false)
    } else {
      dirs.add(dirname(a))
      named.push(a)
    }
  }
  for (const f of named) add(f, true)
  for (const d of new Set(named.map((f) => dirname(f)))) {
    for (const f of sortedNames(d)) if (/^(batch|impersonation)-\d+\.json$/i.test(f)) add(join(d, f), false)
  }
  return { verdictFiles, cachedFiles, batchFiles, impersonationItemFiles, impersonationResultFiles, dirs: [...dirs] }
}

/** The fetch time the run's verdicts were researched against, from each dir's manifest.json. */
export function fetchedAtOf(dirs: string[], force: boolean): Date | null {
  let earliest: Date | null = null
  for (const d of dirs) {
    const manifest = join(d, "manifest.json")
    if (!existsSync(manifest)) {
      if (force) continue
      throw new Error(`${d} has no manifest.json (fetched before 2026-11-08?); pass --force to apply it anyway`)
    }
    const at = new Date((JSON.parse(readFileSync(manifest, "utf8")) as { fetchedAt: string }).fetchedAt)
    if (!earliest || at < earliest) earliest = at
  }
  return earliest
}

/**
 * applied.json lists each verdict, result and cached file an apply wrote, so a dir can be applied
 * wave by wave and then as a whole without anything applying twice (applying twice duplicated
 * every search log). An older applied.json without a file list covers its whole dir.
 */
type AppliedLedger = { applications: Array<{ appliedAt: string; run: string; files: string[] }> }

function appliedFiles(dir: string): Set<string> | "all" {
  const f = join(dir, "applied.json")
  if (!existsSync(f)) return new Set()
  const raw = JSON.parse(readFileSync(f, "utf8")) as Partial<AppliedLedger>
  if (!Array.isArray(raw.applications)) return "all"
  return new Set(raw.applications.flatMap((a) => a.files))
}

export function alreadyApplied(file: string): boolean {
  const done = appliedFiles(dirname(file))
  return done === "all" || done.has(basename(file))
}

export function recordApplied(files: string[], run: string) {
  const byDir = new Map<string, string[]>()
  for (const f of files) byDir.set(dirname(f), [...(byDir.get(dirname(f)) ?? []), basename(f)])
  for (const [dir, names] of byDir) {
    const f = join(dir, "applied.json")
    const prior = existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Partial<AppliedLedger>) : {}
    const ledger: AppliedLedger = { applications: Array.isArray(prior.applications) ? prior.applications : [] }
    ledger.applications.push({ appliedAt: new Date().toISOString(), run, files: names })
    writeFileSync(f, JSON.stringify(ledger, null, 2), "utf8")
  }
}
