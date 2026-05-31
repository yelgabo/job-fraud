# System Architecture

A presentation-oriented overview of the whole system. For developer/operator detail see
[TECHNICAL_INFO.md](TECHNICAL_INFO.md); for a file-by-file map see [CODEMAP.md](CODEMAP.md); for the
plain-language overview see [../README.md](../README.md).

---

## 1. What it is

An automated system that reviews WorkBC (BC's public job board) software/tech postings and rates each
for signs it **isn't a genuine local hiring effort** — surfacing postings that may exist to
manufacture "no Canadian available" evidence for immigration (LMIA) rather than to actually hire.
Output: every posting sorted into **Low / Medium / High** risk with cited reasons.

## 2. Architecture at a glance — three decoupled parts, one shared database

```
                WorkBC JSON APIs (search + job detail)
                              │
        ┌─────────────────────▼─────────────────────┐
        │  ① SCRAPE  — offline CLI, pure HTTP, no AI │
        │     collect postings + deterministic        │
        │     signals (regex flags, NOC category,      │
        │     ATS classification)                      │
        └─────────────────────┬─────────────────────┘
                              │ upsert as "pending"
                              ▼
                   ┌────────────────────┐
                   │   PostgreSQL       │   (Railway)
                   │   Employer / Job / │
                   │   WebSearchLog     │
                   └─────────┬──────────┘
                              ▲ │
        ┌─────────────────────┼─┴─────────────────────┐
        │  ② JUDGE — offline CLI, AI evaluation        │
        │     Stage 1: web-verify each company (once)  │  Claude + live web search
        │     Stage 2: score each posting              │  Claude (cheap, no web)
        │     + brand-impersonation detection          │  Claude Opus + web search
        └──────────────────────────────────────────────┘
                              │ writes scores
                              ▼
        ┌──────────────────────────────────────────────┐
        │  ③ WEB APP — Next.js, read-only               │
        │     postings · companies · analysis · audit   │
        └──────────────────────────────────────────────┘
```

**The key decision:** collection, evaluation, and presentation are fully separated. The two heavy
jobs are **offline CLI tools**; the **deployed website only reads** the database (no API keys, no
pipeline). One process writes at a time → no race conditions.

## 3. Phase ① Scrape (cheap, deterministic)

- Pulls postings from WorkBC's **JSON APIs** (search + per-job detail) — clean structured data, no
  browser/HTML scraping.
- Extracts **deterministic signals for free** (no AI): regex flags (mail-to-residential, generic
  email, crypto/fee/ID-upfront, WhatsApp-only), the **NOC occupation code** → job-type category, and
  the **apply-URL → ATS classification** (Workday / Greenhouse / …).
- Upserts each posting as **pending** (`scoredAt = null`). Re-runs accumulate; nothing is wiped.

## 4. Phase ② Judge (AI — two stages + a guard)

- **Stage 1 — verify each distinct company _once_** (deduplicated): a Claude call with **live web
  search** answers *is this a real business? does the application go to a real office or a house/PO
  box? is a known brand being misused?* The verdict is cached on the company and reused by all its
  postings.
- **Stage 2 — score each posting** (cheap Claude call, no web): combines the company verdict + the
  posting's own flags into a **0–100 score**, weighted from −30 (legitimacy) to +30 (fraud) →
  Low / Medium / High band.
- **Brand-impersonation detection:** if a posting names company X but its apply link routes to a
  _different_ company's hiring system, a stronger model (Opus) confirms via web search and
  re-attributes it to the real company.
- **Robustness:** single DB writer; cached verdicts (don't re-verify); a billing/error fail-fast so a
  mid-run failure leaves work _pending_ rather than corrupting it.

## 5. Phase ③ Web app (read-only)

- **Postings** list with risk-band tabs **×** job-type category filters.
- **Company** pages (risk mix, web-verdict, its postings).
- **Analysis** — elevated-risk rate by job type, *by company* and *by posting*.
- **Audit** (internal, token-gated) — the raw web-search trail behind every verdict.

## 6. Data model (3 tables)

- **Employer** — canonical company + cached web-verdict (`checks.web`).
- **Job** — posting facts, deterministic flags, NOC/category, ATS, and the AI score / band /
  reasoning / signals (nullable until judged).
- **EmployerWebSearchLog** — append-only audit trail of every web search behind a verdict.

## 7. Tech stack

Next.js 15 (App Router, server components) · Prisma + PostgreSQL (Railway) · Claude
(`haiku-4-5` for bulk, `opus-4-8` for impersonation reasoning, with the server-side `web_search`
tool) · zod (validation) · p-limit (concurrency) · Vitest (65 tests).

## 8. Why it's built this way (talking points)

- **Decoupled phases** → collection is cheap/frequent; expensive AI evaluation is controlled and
  re-runnable; the public site is a trivial, safe read layer.
- **Per-company dedup** → one web search per company, not per posting (~10× cheaper).
- **Deterministic-first** → free regex / NOC / ATS signals do the easy work; AI is spent only on
  judgment calls.
- **Audit trail** → every AI verdict is backed by its actual sources (defensible, reviewable).
- **Hard-won lesson:** the original browser-based scraper silently captured the wrong posting's data
  (a hash-routed SPA that didn't reload) and produced bogus mass-"fraud" results → replaced with the
  JSON API. *Trust structured data over scraped DOM.*

## 9. Scale (current)

**2,920 postings · 1,157 companies · all judged** → Low 2,667 / Medium 191 / High 62. Risk
concentrates in individual / small-operator categories (care, food, trades); corporate / verifiable
categories (healthcare, engineering, software) are lowest.
