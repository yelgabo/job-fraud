# Judge runbook

Scraping collects raw postings. The orchestrating session fetches pending postings,
assigns investigation batches and applies verdicts as the single database writer.
Agents never write to the database, and no agent chooses a score.

This is the keyless judge; `npm run judge` (the API judge) does the same in one process when
`ANTHROPIC_API_KEY` is set. Use the [judge-postings skill](../.claude/skills/judge-postings/SKILL.md)
for the maintained procedure, verdict shape and agent prompt. `npm run judge-keyless:fetch` writes
`logs/judge-<timestamp>/batch-NNN.json` (one item per employer to investigate) and `cached.json`
(postings whose employer needs no check), and prints `DIR=... BATCHES=...`. Helpers run on Haiku;
verdicts that need escalation go to Opus helpers (skill step 3b). Save verdicts beside their batches
as `verdicts-NNN.json`, check with `npm run judge-keyless:apply -- --dry-run <dir>`, then apply the
directory once after all its batches finish.

For scraping followed by judging, use the
[update-postings skill](../.claude/skills/update-postings/SKILL.md).

An agent's job is evidence: the employer verdict (`web`) that the composer consumes.
`npm run judge-keyless:apply` stores it, asks Jev the text questions (`TYPESAFE_API_KEY`),
and composes the score from the weight table in `lib/scoring/weights.ts`, exactly as
`npm run judge` does. The rules and the measurements behind them are in
[scoring-algorithm.md](scoring-algorithm.md).
