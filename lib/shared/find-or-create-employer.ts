// Find-or-create an Employer by normalized name, shared by the scraper and the impersonation write.
import { prisma } from "../db"
import { normalizeEmployer } from "../signals/normalize-employer"

/** The employer's id, or null when the name normalizes to nothing. Tolerates a concurrent creator. */
export async function findOrCreateEmployer(displayName: string): Promise<string | null> {
  const nameNormalized = normalizeEmployer(displayName)
  if (!nameNormalized) return null
  const existing = await prisma.employer.findUnique({ where: { nameNormalized } })
  if (existing) return existing.id
  try {
    return (await prisma.employer.create({ data: { nameNormalized, nameDisplay: displayName } })).id
  } catch {
    // The unique key: another task created it between the read and the create.
    const again = await prisma.employer.findUnique({ where: { nameNormalized } })
    if (again) return again.id
    throw new Error(`could not create employer "${displayName}"`)
  }
}
