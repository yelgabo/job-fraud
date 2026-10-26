#!/usr/bin/env bash
# Start command of the job-fraud-scheduler Railway cron service (docs/TECHNICAL_INFO.md,
# "Scheduled refresh"). Runs inside Railway so it reaches Postgres over the private network.
set -euo pipefail

# The npm scripts pass --env-file=.env, which hard-errors when the file is missing.
touch .env

# The term pass pages the full feed rather than --recent week: a failed or skipped week would
# otherwise lose that week's postings for good, and --skip-existing keeps detail fetches to new ones.
REVALIDATE_TOKEN= npm run scrape -- --search-terms "software engineer,software" --limit 5000 --skip-existing
REVALIDATE_TOKEN= npm run scrape -- --location "Victoria" --search-terms "" --limit 5000 --skip-existing

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  npm run judge -- --limit "${JUDGE_LIMIT:-1000}"
else
  echo "[refresh] ANTHROPIC_API_KEY not set: new postings stay pending until a judge run"
fi
