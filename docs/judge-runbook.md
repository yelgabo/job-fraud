# Judge runbook

Scraping collects raw postings. The orchestrating session fetches pending postings,
assigns investigation batches and applies verdicts as the single database writer.
Agents never write to the database.

Use the [judge-postings skill](../.claude/skills/judge-postings/SKILL.md) for the
maintained procedure, verdict shape and agent prompt. The fetcher writes
`logs/judge-<timestamp>/batch-NNN.json` and prints `DIR=... BATCHES=...`.
Save verdicts beside their batches as `verdicts-NNN.json`. Apply completed verdict
files serially, or apply the directory once after all its batches finish.

For scraping followed by judging, use the
[update-postings skill](../.claude/skills/update-postings/SKILL.md).

Scoring policy comes from [the runtime rubric](../lib/ai/scoring.ts). The
[judge skill's scoring policy](../.claude/skills/judge-postings/SKILL.md#scoring-policy)
records the approved +35 to +45 address contribution and the shared new-verdict
validation range. Historical records are preserved; this repair does not rescore data.
