# Pagination and time-based caching for the public pages

Approved by the captain 2026-07-29. Part A (bound the queries) lands before Part B (cache the
pages), in the same branch.

## Measured problem (2026-07-29 PM review)

The home page was a 19.3 MB HTML document (3.07 s TTFB, 5.17 s total on a fast connection):
`app/page.tsx` ran `findMany` with no `take` and rendered all 7,583 judged rows. `/companies` had
the same shape at 3.8 MB. Both were `force-dynamic`, so every visit re-ran everything. The corpus
grows about 40 postings/day (roughly 3 MB of HTML per month on the old rendering).

## Part A: pagination

- Postings list and `/companies` page at 50 rows (`PAGE_SIZE` in `lib/shared/postings-filter.ts`),
  offset-style `skip`/`take`, with a pager that shows the total and current page.
- Ordering carries a unique tiebreaker (`workbcId`; `employerId` on companies) so rows tie-stable:
  pages tile the ordered set with no overlap and no skips.

### Count-semantics invariant

`lib/shared/postings-filter.ts` composes each filter dimension's tab counts against the other
active dimensions, and the tab number must equal the rows that tab would list. Counts stay
whole-corpus aggregates (cheap indexed groupBys); **only the row query is paged**. Every page of
the same filter shows identical tab counts. Pinned in `lib/shared/postings-filter.test.ts`.

## Part B: time-based caching

The captain explicitly accepted up to 10 minutes of staleness for visitors (2026-07-29), so every
public read surface caches with 600 s revalidation:

- `/j/[id]`, `/e/[id]`: route-level `export const revalidate = 600` (on-demand ISR per URL).
- `/`, `/companies`, `/analysis`: stay `force-dynamic` as routes; the cache is
  `unstable_cache(..., { revalidate: 600 })` at the data layer, keyed per (band, cat, posted,
  page) combination. Two reasons route-level ISR cannot apply: the home page reads
  `searchParams`, which forces per-request rendering in Next 15 (the full route cache is keyed by
  pathname only); and static prerendering of `/companies`/`/analysis` would query the database
  during `next build`, which fails on Railway because the builder has no private-network route to
  Postgres (the service's `DATABASE_URL` is `*.railway.internal`).
- `/about`: no database; fully static at build, which is stricter than 600 s. Unchanged.

### Hard boundary

The token-gated `/audit/[token]` pages (and their nested employer/posting pages plus server
actions) stay fully dynamic and uncached. The owner queue must always show the live database.

## Consequence for the docs

"The site reads the DB live per visit" became "pages are cached up to 10 minutes; data updates
appear without a deploy, within the revalidation window". Amended in `docs/TECHNICAL_INFO.md`,
`AGENTS.md` (CLAUDE.md), and `.claude/skills/update-postings/SKILL.md`.

## Out of scope

On-write revalidation hooks from the update scripts, feeds, last-seen tracking, home redesign,
Apply-button and branding changes.

Follow-up: the on-write revalidation hooks landed later as `POST /api/revalidate`, gated by
`REVALIDATE_TOKEN`; see `docs/TECHNICAL_INFO.md`.
