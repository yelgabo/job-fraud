# Admin review page — comments + re-judge flags

**Goal.** From an admin mirror of a posting's fraud report, the owner can (a) leave comments,
(b) flag the posting for a **re-run** (normal re-judge on next update) or a **deep look**
(per-posting agent investigation that receives the comment as context).

## Placement & auth

- New page `/audit/<token>/j/<workbcId>` — the existing unlinked, token-gated pattern
  (`requireAuditToken`, 404 unless `AUDIT_TOKEN` matches). Renders the same report body as the
  public `/j/<id>` (extracted into `components/JobReport.tsx`) plus an **Admin panel**.
- `/audit/<token>` index gains a **Review queue** section (open JudgeRequests + recent notes)
  and links each entry to the admin mirror.
- Mutations run in server actions that re-verify the token server-side. This is the app's first
  write path; it stays out of `lib/ai/` and uses plain Prisma writes.

## Data model (append-only, Job read-model untouched)

```prisma
model ReviewNote  { id, workbcId, body, createdAt }                  // comment thread per posting
model JudgeRequest { id, workbcId, kind "rerun"|"deep", note?, createdAt, resolvedAt? }  // queue
```

## Mechanics

- **Comment** → insert ReviewNote.
- **Re-run** → insert JudgeRequest(kind=rerun) AND immediately clear `Job.scoredAt`
  (posting returns to pending; the next update's judge pass re-scores it; the request row is
  stamped `resolvedAt` when the posting is scored again — drained by the update skill).
- **Deep look** → insert JudgeRequest(kind=deep, note=comment). Drained by the update-postings
  skill: dispatch one fraud-analyst agent for the posting with the note appended as
  "owner context", apply the verdict via `judge:apply`, stamp `resolvedAt`.
- The update-postings skill gains a "Drain review queue" step (before the scrape) documenting
  both drains.

## Non-goals

- No user accounts/multi-user auth (single-owner token, same trust level as /audit).
- No public visibility of notes/flags.
