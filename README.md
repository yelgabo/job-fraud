# Job Fraud Scanner

**An automated tool that reviews job postings on [WorkBC](https://www.workbc.ca) — British
Columbia's public job board — and flags the ones showing warning signs of an employment scam.**

**See it live:** https://job-fraud-production.up.railway.app

---

## Why this exists

Job boards, including official government ones, are a favourite target for scammers. Fake postings
are used to steal money (bogus "application", "training", or "equipment" fees), harvest personal
information (Social Insurance Numbers, banking details, copies of ID), or trick people into
forwarding money or packages. A job seeker scrolling a trusted public board has little way to tell a
real listing from a convincing fake.

This tool does that triage automatically: it reviews each posting, looks for the patterns scams tend
to share, checks whether the employer is a real and findable business, and sorts every posting into
**Low**, **Medium**, or **High** risk so a person can focus their attention where it matters.

## What it looks at

For every posting it gathers three kinds of evidence:

1. **The posting itself** — who the employer claims to be, the job, the pay, and especially *how
   you're told to apply*: through a website, an email address, or a physical mailing address.

2. **Tell-tale wording** — application instructions are checked for patterns that show up again and
   again in scams, for example:
   - being told to **mail a paper résumé to an address** for an office/tech job,
   - a **free personal email** (Gmail, Outlook, Yahoo) used instead of a company email,
   - requests for **payment, banking details, or ID up front**,
   - being asked to apply **only through WhatsApp or Telegram**,
   - mention of being **paid in cryptocurrency**.

3. **The company's real-world footprint** — the tool searches the web for the employer and asks:
   *Is this a real, findable business? Does the application address look like an actual office, or
   is it a house, a PO box, or a mail-forwarding service? Is the company named in the posting really
   the one behind it — or is someone impersonating a well-known brand?*

## How it decides the risk level

The signals above are combined into a risk score and sorted into three bands:

- **🟢 Low** — a real, verifiable company taking applications through its normal channels (its own
  website or a standard, recognized hiring system).
- **🟡 Medium** — broadly plausible, but with something unusual worth a second look.
- **🔴 High** — strong warning signs, such as: being told to **mail your application to a private
  home or PO box**, a "company" that **can't be found anywhere**, or a posting that uses a
  **famous company's name but routes applications to an unrelated free email address** (impersonation).

A couple of real examples from the tool:

- A posting *"from Accenture"* whose application link goes to Accenture's own official hiring
  system → **Low risk** (it's really them).
- A posting telling applicants to **mail a résumé to a Surrey apartment** → **High risk**.

## Important caveats

- **This is a screening aid, not a verdict.** A High score means *"worth a closer look,"* not
  *"proven fraud."* The opposite is also true — a Low score is reassurance, not a guarantee.
- **It can be wrong.** A legitimate small business with little web presence can look suspicious, and
  judging whether a company is "real" is sometimes a close call.
- It reviews only public WorkBC postings, and the scores are automated estimates.

## How it works, briefly

The tool runs in two separate steps so the heavier research can be done in manageable batches:

1. **Collect** — it gathers job postings from WorkBC.
2. **Judge** — it researches each company once and scores each of that company's postings.

The public website only displays postings that have already been judged.

---

*Built with the help of AI for the research-and-scoring step. For setup, the exact scoring rules,
and developer documentation, see [TECHNICAL_INFO.md](TECHNICAL_INFO.md).*
