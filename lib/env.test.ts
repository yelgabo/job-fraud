import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseEnv } from "node:util"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// `.env.example` is what a fresh clone copies to `.env`, and every CLI here loads it through
// `tsx --env-file=.env`, which uses the same Node dotenv parser as `util.parseEnv`. These tests pin
// the one property that matters: a fresh copy must NOT satisfy `loadScrapeEnv()`. `ANTHROPIC_API_KEY`
// is only `z.string().min(1)`, so a shipped placeholder passes validation and sends a keyless run
// down the keyed judge path, where every Anthropic call 401s. A 401 is not a billing error
// (`lib/shared/anthropic-errors.ts`), so `scripts/judge.ts` does not abort: it writes each posting a
// failed verdict plus a `scoredAt` timestamp, and the poisoned run looks judged instead of pending.

const example = parseEnv(readFileSync(join(__dirname, "..", ".env.example"), "utf8"))

/** Load `lib/env.ts` fresh with process.env replaced by exactly `vars`. */
async function loadEnvModuleWith(vars: Record<string, string | undefined>) {
  for (const key of ["DATABASE_URL", "WORKBC_SEARCH_URL", "WORKBC_SEARCH_TERMS", "ANTHROPIC_API_KEY", "AUDIT_TOKEN"]) {
    vi.stubEnv(key, vars[key])
  }
  vi.resetModules()
  return import("./env")
}

beforeEach(() => vi.unstubAllEnvs())
afterEach(() => vi.unstubAllEnvs())

describe(".env.example", () => {
  it("ships DATABASE_URL but leaves ANTHROPIC_API_KEY commented out", () => {
    expect(example.DATABASE_URL).toBeTruthy()
    expect(example.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it("is enough for the web app, scrape.ts and the keyless judge path (webEnv)", async () => {
    const { webEnv } = await loadEnvModuleWith(example)
    expect(webEnv.DATABASE_URL).toBe(example.DATABASE_URL)
    expect(webEnv).not.toHaveProperty("ANTHROPIC_API_KEY")
  })

  it("fails loudly on the keyed judge path instead of silently routing there", async () => {
    const { loadScrapeEnv } = await loadEnvModuleWith(example)
    expect(() => loadScrapeEnv()).toThrowError(/ANTHROPIC_API_KEY/)
  })

  it("would have passed validation if the placeholder key were left uncommented", async () => {
    const { loadScrapeEnv } = await loadEnvModuleWith({ ...example, ANTHROPIC_API_KEY: "sk-ant-..." })
    expect(loadScrapeEnv().ANTHROPIC_API_KEY).toBe("sk-ant-...")
  })
})
