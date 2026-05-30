# WorkBC Job Posting Reviews

**A review of software and tech job postings on [WorkBC](https://www.workbc.ca) — British
Columbia's public job board — rating each one on whether it looks like a genuine attempt to hire
locally, or a posting that exists for other reasons.**

**Browse the reviews:** https://job-fraud-production.up.railway.app

---

## Why these postings are worth reviewing

In Canada, an employer who wants to hire a foreign worker usually has to first show they *tried to
hire a Canadian or permanent resident and couldn't find one*. A key part of that proof is **publicly
advertising the job** — including on official boards like WorkBC — for a set period and showing that
no qualified local applicant turned up. That "no Canadian available" result supports a **Labour
Market Impact Assessment (LMIA)**, which in turn supports a foreign worker's work permit or visa.

That requirement can be abused. Some employers post **sham listings** — jobs that are fake,
deliberately unappealing, or never genuinely meant to hire anyone locally — purely to tick the
advertising box. Once a posting has been up long enough, the listing (and its WorkBC job ID) becomes
paperwork evidence in an immigration application, even though it was never a real opening for a
British Columbian. Genuine job seekers are collateral damage — they apply to jobs that were never
going to hire them — but the core abuse is **manufacturing immigration evidence**.

These reviews exist to surface such postings. Every WorkBC listing is rated for signs that it
**isn't a real local hiring effort** — an employer that can't be verified as a real business, an
application routed to a private home or a throwaway email, a well-known company's name on a posting
that clearly isn't theirs — and sorted into **Low**, **Medium**, or **High** risk, so anyone (a
journalist, a policymaker, an auditor, or a job seeker) can see which postings look suspicious and why.

## What each review looks at

For every posting, three kinds of evidence are weighed:

1. **The posting itself** — who the employer claims to be, the job, the pay, and especially *how
   you're told to apply*: through a website, an email address, or a physical mailing address.

2. **Tell-tale wording** — the application instructions are checked for patterns that recur in fake
   or non-genuine postings, for example:
   - being told to **mail a paper résumé to an address** for an office/tech job,
   - a **free personal email** (Gmail, Outlook, Yahoo) used instead of a company email,
   - requests for **payment, banking details, or ID up front**,
   - being asked to apply **only through WhatsApp or Telegram**.

3. **The company's real-world footprint** — a web search checks: *Is this a real, findable business?
   Does the application address look like an actual office, or is it a house, a PO box, or a
   mail-forwarding service? Is the company named in the posting really the one behind it — or is
   someone using a well-known brand's name?*

## How each posting is rated

The signals above are combined into a risk rating:

- **🟢 Low** — a real, verifiable company taking applications through its normal channels (its own
  website or a standard, recognized hiring system).
- **🟡 Medium** — broadly plausible, but with something unusual worth a second look.
- **🔴 High** — strong warning signs, such as: being told to **mail your application to a private
  home or PO box**, a "company" that **can't be found anywhere**, or a posting that uses a
  **well-known company's name but routes applications to an unrelated free email address**.

Two real examples:

- A posting *"from Accenture"* whose application link goes to Accenture's own official hiring
  system → **Low** (it's really them).
- A posting telling applicants to **mail a résumé to a Surrey apartment** → **High**.

## What a rating means — and what it doesn't

- **A rating is a screening signal, not a verdict.** A High rating means *"worth a closer look,"* not
  proof of fraud or of any immigration violation. A Low rating is reassurance, not a guarantee.
- **It can be wrong.** A legitimate small business with little web presence can look suspicious, and
  judging whether a company is "real" is sometimes a close call.
- The reviews cover only public WorkBC postings, and the ratings are produced automatically.

## How the reviews are produced

The ratings are generated in two steps: postings are first collected from WorkBC, then each company
is researched once (including a web search for its real presence) and each of its postings is rated.
The research-and-rating step is done with the help of AI. The public site shows only postings that
have already been reviewed.

---

*Developer setup, methodology, and the exact rating rules: see
[docs/TECHNICAL_INFO.md](docs/TECHNICAL_INFO.md).*
