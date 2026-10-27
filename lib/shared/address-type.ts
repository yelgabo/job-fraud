import type { WebVerification } from "./json-schemas"

/** Mailing addresses that floor a posting at High. */
export const PRIVATE_ADDRESS_TYPES = ["residential", "po_box", "virtual"] as const

/**
 * The address type the score and the site act on. A `home_business` verdict only counts as one
 * when the employer itself was verified, business and location both: otherwise it is a home the
 * check could not tie to a real business, which is what `residential` means, floor included.
 * Without this a verifier that over-used the label could lower an unverified employer's rating.
 */
export function scoredAddressType(web: Pick<WebVerification, "applicationAddressType" | "businessMatch" | "locationMatch">): WebVerification["applicationAddressType"] {
  if (web.applicationAddressType !== "home_business") return web.applicationAddressType
  return web.businessMatch === "match" && web.locationMatch === "match" ? "home_business" : "residential"
}

export const isPrivateAddress = (type: string | undefined): boolean => (PRIVATE_ADDRESS_TYPES as readonly string[]).includes(type ?? "")
