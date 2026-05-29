const SUFFIXES = [
  "incorporated",
  "corporation",
  "company",
  "inc",
  "llc",
  "ltd",
  "limited",
  "corp",
  "co",
]

export function normalizeEmployer(name: string): string {
  let s = name.toLowerCase().trim()
  s = s.replace(/[.,;:]+$/g, "")
  s = s.replace(/\s+/g, " ")
  for (const suf of SUFFIXES) {
    const re = new RegExp(`(\\s|,)+${suf}\\.?$`, "i")
    s = s.replace(re, "").trim()
  }
  s = s.replace(/[.,;:]+$/g, "").trim()
  return s
}
