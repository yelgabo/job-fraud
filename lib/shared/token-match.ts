import { createHash, timingSafeEqual } from "node:crypto"

/** Constant-time comparison over fixed-length digests so neither content nor length leaks. */
export function tokenMatches(given: string, expected: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest()
  return timingSafeEqual(h(given), h(expected))
}
