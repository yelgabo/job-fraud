export type RiskBand = "low" | "medium" | "high" | "unknown"

export function bandFor(score: number): RiskBand {
  if (score < 0) return "unknown"
  if (score < 30) return "low"
  if (score < 70) return "medium"
  return "high"
}
