#!/usr/bin/env bash
# Start command of the job-fraud-scheduler Railway cron service (docs/TECHNICAL_INFO.md,
# "Scheduled refresh"). Runs inside Railway so it reaches Postgres over the private network.
set -euo pipefail

# The npm scripts pass --env-file=.env, which hard-errors when the file is missing.
touch .env

# The term pass pages the full feed rather than --recent week: a failed or skipped week would
# otherwise lose that week's postings for good, and --skip-existing keeps detail fetches to new ones.
# Unset, not empty: lib/env.ts rejects an empty REVALIDATE_TOKEN. Pending postings are not shown on
# the site, so only the judge run needs to refresh its cache.
env -u REVALIDATE_TOKEN npm run scrape -- --search-terms "software engineer,software" --limit 5000 --skip-existing
env -u REVALIDATE_TOKEN npm run scrape -- --location "Victoria" --search-terms "" --limit 5000 --skip-existing

# A missing key used to skip judging and exit 0, so the cron looked healthy while postings piled up
# (730 pending by 2026-11-06). It now fails the run. judge.ts itself exits nonzero when a bad key or
# an empty wallet aborts it, or when it scores nothing with postings pending (see JudgeRun).
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "[refresh] ANTHROPIC_API_KEY not set: scraped, but nothing was judged" >&2
  exit 1
fi
npm run judge -- --limit "${JUDGE_LIMIT:-1000}"
