import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { alreadyApplied, recordApplied, resolveFiles } from "./keyless-files"

function runDir(): string {
  const d = mkdtempSync(join(tmpdir(), "judge-"))
  for (const f of ["manifest.json", "batch-1.json", "batch-2.json", "batch-10.json", "impersonation-1.json", "cached.json", "verdicts-1.json", "verdicts-2.json", "notes.txt"]) {
    writeFileSync(join(d, f), "[]")
  }
  return d
}

describe("resolveFiles", () => {
  it("reads a whole dir in numeric order and ignores files it does not know", () => {
    const d = runDir()
    const r = resolveFiles([d])
    expect(r.batchFiles.map((f) => f.slice(d.length + 1))).toEqual(["batch-1.json", "batch-2.json", "batch-10.json"])
    expect(r.verdictFiles).toHaveLength(2)
    expect(r.cachedFiles).toHaveLength(1)
  })

  it("still reads the fetch's batch and item files when one wave's verdicts are named", () => {
    const d = runDir()
    const r = resolveFiles([join(d, "verdicts-2.json")])
    expect(r.verdictFiles).toEqual([join(d, "verdicts-2.json")])
    expect(r.batchFiles).toHaveLength(3)
    expect(r.impersonationItemFiles).toHaveLength(1)
    expect(r.cachedFiles).toEqual([])
  })
})

describe("applied.json", () => {
  it("lets a second wave apply after the first, then the dir apply only what is left", () => {
    const d = runDir()
    recordApplied([join(d, "verdicts-1.json")], "run1")
    expect(alreadyApplied(join(d, "verdicts-1.json"))).toBe(true)
    expect(alreadyApplied(join(d, "verdicts-2.json"))).toBe(false)
    recordApplied([join(d, "verdicts-2.json")], "run2")
    const left = [...resolveFiles([d]).verdictFiles, ...resolveFiles([d]).cachedFiles].filter((f) => !alreadyApplied(f))
    expect(left).toEqual([join(d, "cached.json")])
    expect(JSON.parse(readFileSync(join(d, "applied.json"), "utf8")).applications).toHaveLength(2)
  })

  it("treats an applied.json from before file lists as covering the whole dir", () => {
    const d = runDir()
    writeFileSync(join(d, "applied.json"), JSON.stringify({ appliedAt: "2026-11-08T00:00:00Z", run: "old" }))
    expect(alreadyApplied(join(d, "verdicts-2.json"))).toBe(true)
  })
})
