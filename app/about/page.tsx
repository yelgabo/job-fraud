import fs from "node:fs"
import path from "node:path"
import type { Metadata } from "next"
import { Marked, type Tokens } from "marked"
import { headingSlug, methodologySlice } from "@/lib/shared/methodology"

export const metadata: Metadata = {
  title: "About — Job Fraud Scanner",
  description:
    "Why WorkBC job postings are reviewed, what the Low/Medium/High ratings mean, and what a rating does and does not tell you.",
}

// Heading ids let other pages deep-link a specific section (e.g. the rating bands).
const marked = new Marked({
  renderer: {
    heading({ tokens, depth, text }: Tokens.Heading) {
      const html = this.parser.parseInline(tokens)
      return `<h${depth} id="${headingSlug(text)}">${html}</h${depth}>\n`
    },
  },
})

export default function AboutPage() {
  // README.md owns the methodology language (see lib/shared/methodology.ts); this page only
  // renders it. Trusted repo-authored markdown, hence dangerouslySetInnerHTML.
  const readme = fs.readFileSync(path.join(process.cwd(), "README.md"), "utf8")
  const html = marked.parse(methodologySlice(readme)) as string

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-zinc-900">About these reviews</h1>
      <div className="methodology mt-6" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
