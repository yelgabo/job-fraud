# Public launch runbook

Goal: the site stays up through the first spike after the public announcement, with a target of
1,000 requests per second on the public pages.

## How the load is absorbed

- `/`, `/companies` (every filter and page URL), `/j/*`, `/e/*` and `/about` are cached by
  Railway's edge. The origin renders each URL about once per 10 minutes; everything else is
  answered from the edge (`docs/TECHNICAL_INFO.md`, "Railway edge CDN").
- `middleware.ts` redirects tracking-parameter URLs (`?fbclid=`, `?utm_*`) to their clean form
  first, so social and newsletter clicks land on cached URLs.
- List pages link with plain `<a>`, so browsing them makes no background origin requests.
- Not cached: `/analysis` and `/audit/*` (owner pages), and any client-side navigation (`?_rsc=`),
  which the edge always passes to the origin.

## Before the announcement

1. **Freeze deploys.** Every deploy purges the edge's HTML (`purgeOnDeploy: html`), so a deploy
   during the spike sends every visitor to the origin at once. Push nothing to `main` from the
   last check below until the spike has passed.
2. **Scale to 2 replicas**, so a cache miss is shared between two Node processes. The service
   runs in the legacy region ID `iad`, which `railway scale` rejects; `railway scale us-east=2`
   adds a *second* region instead (that happened on 2026-10-27 and had to be cancelled). Set it
   through the API from a directory linked to the project:

   ```bash
   railway api 'mutation($cfg: JSON) { serviceInstanceUpdate(serviceId: "0309422a-5384-410b-ab67-0a74d59ee57d", environmentId: "f24aa401-b559-4665-aeb6-bdd2cf34e3bc", input: { multiRegionConfig: $cfg }) }' \
     --variables '{"cfg": {"iad": {"numReplicas": 2}}}'
   ```

   The running deployment picks it up without a redeploy. Set 2026-10-27, so this step is done
   unless someone scaled back. Each replica keeps its own data cache, so a
   `/api/revalidate` call refreshes only one of them; the other catches up within 10 minutes.
3. **Warm the edge through the public domain** after the last deploy, so the first visitors hit
   the cache:

   ```bash
   B=https://job-fraud-production.up.railway.app
   for p in / "/?band=high" "/?band=medium" "/?band=low" "/?posted=7" "/?posted=30" /companies /about; do
     curl -s -o /dev/null -w "%{http_code} %header{x-cache} $p\n" "$B$p"
   done
   ```

   A second run should show `HIT` on every line.
4. **Load test** the same URLs, including tracking-parameter variants, and check that the error
   rate is zero and the edge answers nearly everything:

   ```bash
   oha -z 60s -q 1000 "https://job-fraud-production.up.railway.app/?band=high"
   oha -z 30s -q 300 --redirect 0 "https://job-fraud-production.up.railway.app/?fbclid=test"
   ```

   This sends real traffic at production, so run it with the owner's go-ahead.

## During the spike

- Watch Railway's metrics for the `job-fraud` service (CPU, memory, 5xx).
- If the origin is still overwhelmed: `railway cdn update --service job-fraud --html-caching force`
  makes the edge cache every page for at least 30 minutes (published verdicts then lag by up to
  that long), and `railway waf under-attack enable --duration 1h` challenges visitors for an
  active flood. Undo both afterwards (`--html-caching auto`, `railway waf under-attack disable`).
- Do not run `npm run judge` or `recheck-cached-verdicts` during the spike: they write to the
  database the site reads and, with `REVALIDATE_TOKEN` set, clear the caches.

## After

- Scale back to 1 replica once traffic is back to normal: the mutation above with `"numReplicas": 1`.
- Unfreeze deploys.
