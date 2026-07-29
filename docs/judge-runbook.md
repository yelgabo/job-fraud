# Judge runbook (Model B — agent-orchestrated)

Evaluation is decoupled from scraping. `scrape` only collects raw postings (score fields null =
pending). **Judging** is run by an orchestrating Claude Code session that dispatches parallel
fraud-detection agents and is the **single DB writer** (agents never touch the DB → no races).

This is the "why" behind that design. The mechanics live elsewhere, and only there:

- **The steps, file names and flags** (`judge:fetch` writes `logs/judge-<ts>/batch-NNN.json`, you
  write `verdicts-<n>.json` back into that dir, `judge:apply` reads the dir) —
  [AGENTS.md](../AGENTS.md), "The keyless judge path".
- **The verdict shape and its zod requirements** — [AGENTS.md](../AGENTS.md); the schemas
  themselves are `scripts/judge-apply.ts` and `lib/shared/json-schemas.ts`.
- **The agent prompt to paste verbatim** (it encodes the rubric) —
  [`.claude/skills/judge-postings/SKILL.md`](../.claude/skills/judge-postings/SKILL.md).

Do not copy any of those back into this file; a second copy is a copy that goes stale.

## Why it is shaped this way

- **Agents never write.** Each agent web-investigates its batch and returns JSON. A single
  `judge:apply` process applies every verdict sequentially, so concurrent agents cannot race or
  deadlock on the same employer row.
- **Bad verdicts are skipped, not fatal.** `judge:apply` zod-validates each verdict; an invalid one
  is logged and skipped and that posting simply stays pending for the next wave, so one malformed
  agent response cannot abort a batch.
- **Re-judging is idempotent.** Clear `scoredAt` to make a posting pending again, or just re-run
  agents and re-apply — apply overwrites.
- **When to use it at all.** It buys a richer per-posting investigation at the cost of dropping the
  per-employer dedup that `npm run judge` does, so it suits a small high-scrutiny subset, or any
  machine with no `ANTHROPIC_API_KEY`. See the fast path in
  [`.claude/skills/judge-postings/SKILL.md`](../.claude/skills/judge-postings/SKILL.md).
