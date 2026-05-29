import { z } from "zod"

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
