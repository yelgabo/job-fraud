// The /about page renders the README's plain-language methodology sections so the caveats
// ("a rating is a screening signal, not a verdict"; "it can be wrong") live on the site that
// publishes the ratings, not only in the repo. README.md stays the single owner of that
// language: this module only slices and slugs, it never rewords. Do not add site-only copy
// here that asserts more or less than the README does.

/**
 * The visitor-facing slice of the README: everything from the first `## ` section heading
 * (the h1 + repo intro above it are site-redundant) up to the trailing `---` divider that
 * precedes the developer-docs footer. If either marker disappears from the README the slice
 * degrades to showing more, never less.
 */
export function methodologySlice(readme: string): string {
  const start = readme.search(/^## /m)
  const body = start === -1 ? readme : readme.slice(start)
  const cut = body.lastIndexOf("\n---")
  return cut === -1 ? body : body.slice(0, cut)
}

/**
 * Heading slug shared by the /about renderer and the links that target it. Only internal
 * consistency matters (both sides call this function); it is not exactly GitHub's algorithm.
 */
export function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

/** Anchor of the README's "How each posting is rated" section on /about. */
export const RATING_ANCHOR = "how-each-posting-is-rated"
