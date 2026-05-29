import { z } from "zod"

export const WebVerificationSchema = z.object({
  websiteUrl: z
    .string()
    .transform((s) => (s.trim() ? s.trim() : null))
    .nullable(),
  websiteReachable: z.enum(["yes", "no", "unknown"]),
  businessMatch: z.enum(["match", "mismatch", "uncertain"]),
  locationMatch: z.enum(["match", "mismatch", "uncertain"]),
  hasJobsListing: z.enum(["yes", "no", "unknown"]),
  // Nature of the address applicants are told to mail materials to. A residence / PO box /
  // virtual mailbox (especially one unrelated to the company's real office) is a strong fraud
  // signal for a professional role. "none" = the posting has no mailing address (applies online).
  applicationAddressType: z
    .enum(["business", "residential", "po_box", "virtual", "none", "uncertain"])
    .default("none"),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
})

export type WebVerification = z.infer<typeof WebVerificationSchema>

export const ChecksSchema = z
  .object({
    websiteReachable: z.boolean().nullable().optional(),
    websiteStatusCode: z.number().nullable().optional(),
    applicationReachable: z.boolean().nullable().optional(),
    addressGeocoded: z.boolean().nullable().optional(),
    addressMatchConfidence: z.number().nullable().optional(),
    addressResolvedTo: z.string().nullable().optional(),
    addressMatchesCity: z.boolean().nullable().optional(),
    addressFlags: z.array(z.string()).optional(),
    web: WebVerificationSchema.nullable().optional(),
  })
  .passthrough()

export const ApplicationFlagSchema = z.object({
  flag: z.string(),
  evidence: z.string(),
})

export const ApplicationFlagsSchema = z.array(ApplicationFlagSchema)

export const SignalSchema = z.object({
  label: z.string(),
  weight: z.number(),
  evidence: z.string(),
})

export const SignalsSchema = z.array(SignalSchema)

export type Checks = z.infer<typeof ChecksSchema>
export type ApplicationFlag = z.infer<typeof ApplicationFlagSchema>
export type Signal = z.infer<typeof SignalSchema>

export function parseChecks(v: unknown): Checks {
  if (v == null) return {}
  return ChecksSchema.parse(v)
}

export function parseFlags(v: unknown): ApplicationFlag[] {
  if (v == null) return []
  return ApplicationFlagsSchema.parse(v)
}

export function parseSignals(v: unknown): Signal[] {
  if (v == null) return []
  return SignalsSchema.parse(v)
}
