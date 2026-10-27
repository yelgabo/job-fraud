# Plan: rotate the Postgres superuser password

Status: proposed 2026-10-27, not done.

## Why

Until 2026-10-27 every local `.env` connected as `postgres`, the superuser, over the public TCP
proxy (`mainline.proxy.rlwy.net:56856`). Local runs now use the row-only `jobfraud_local` login
(AGENTS.md, "Repository state"), but the superuser password has been sitting in at least one laptop
file and in that file's backups. A superuser can run shell commands on the database host
(`COPY ... TO PROGRAM`), so a leaked copy is worth more than any other credential in the project.
Rotating it makes the old copies useless.

## What went wrong last time

The 2026-10-22 incident was a credential rotation. Afterwards Postgres was private until
2026-10-26 and the public proxy had to be recreated. The steps below exist so this one does not
take the site down.

## Steps

1. **Inventory who uses the superuser.** For each service in the project (`railway service list
   --json`), read its variables in the Railway dashboard and note whether `DATABASE_URL` is a
   reference to the Postgres service (`${{Postgres-t4uu.DATABASE_URL}}`) or a pasted literal.
   A reference picks up the new password on the next deploy; a literal keeps the old one and breaks.
   Expected users: `job-fraud` (web) and `job-fraud-scheduler` (cron). Nothing local should remain;
   confirm with `grep -l "postgres:" ~/GitHub/*/.env` returning nothing for this host.
2. **Turn any literals into references** before rotating.
3. **Take a backup** (`pg_dump` through the proxy as `postgres`, before the change, into a file
   outside the repo).
4. **Rotate.** `ALTER ROLE postgres PASSWORD '<new>'` and set the Postgres service's
   `POSTGRES_PASSWORD` / `PGPASSWORD` variables to the same value, so Railway's generated
   `DATABASE_URL` / `DATABASE_PUBLIC_URL` match. Do both together; if only one changes, the
   references point at a password the server no longer accepts.
5. **Redeploy** `job-fraud` and trigger one `job-fraud-scheduler` run, then check: the site
   returns 200 on `/` and `/companies`, and the scheduler log reaches the judge step.
6. **Confirm the old password is refused** from a local connection.

## Rollback

`ALTER ROLE postgres PASSWORD '<old>'` (kept only until step 6 passes) and restore the old
variable values. `jobfraud_local` is unaffected throughout, so local scripts keep working.
