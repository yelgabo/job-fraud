# Judge runbook

Scraping collects raw postings. The orchestrating session fetches pending postings,
assigns investigation batches and applies verdicts as the single database writer.
Agents never write to the database, and no agent chooses a score.

Use the [judge-postings skill](../.claude/skills/judge-postings/SKILL.md) for the
maintained procedure, verdict shape and agent prompt. The fetcher writes
`logs/judge-<timestamp>/batch-NNN.json` and prints `DIR=... BATCHES=...`.
Save verdicts beside their batches as `verdicts-NNN.json`. Apply completed verdict
files serially, or apply the directory once after all its batches finish.

For scraping followed by judging, use the
[update-postings skill](../.claude/skills/update-postings/SKILL.md).

An agent's job is evidence: the employer verdict (`web`) that the composer consumes.
`npm run judge:apply` stores it, asks Jev the text questions (`TYPESAFE_API_KEY`),
and composes the score from the weight table in `lib/scoring/weights.ts`, exactly as
`npm run judge` does. The rules and the measurements behind them are in
[scoring-algorithm.md](scoring-algorithm.md).
