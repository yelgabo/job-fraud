// The prose shown under "Verdict" on the posting page, written from the composed result so it
// can never disagree with the number next to it. A model wrote this text before the composer,
// without knowing the final score; a 74 could sit beside reassuring prose.

import type { Signal } from "../shared/json-schemas"
import { humanizeSignalLabel } from "../shared/signal-labels"
import type { ComposeResult, Judgments } from "./compose"
import { ROUTE_PLAUSIBLE_THRESHOLD } from "./weights"

const BAND_SENTENCE: Record<string, string> = {
  low: "Rated low risk.",
  medium: "Rated medium risk: worth a second look before applying.",
  high: "Rated high risk: strong warning signs.",
}

const NAMED_SIGNALS = 3

function clause(s: Signal): string {
  const text = humanizeSignalLabel(s.label)
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

export function explainVerdict(result: ComposeResult, judgments: Judgments | null): string {
  const parts: string[] = [BAND_SENTENCE[result.riskBand] ?? `Rated ${result.riskBand}.`]

  const fraud = result.signals.filter((s) => s.weight > 0).slice(0, NAMED_SIGNALS)
  // signals arrive sorted strongest fraud first, so the strongest credits are at the end
  const legit = result.signals.filter((s) => s.weight < 0).sort((a, b) => a.weight - b.weight).slice(0, NAMED_SIGNALS)

  if (fraud.length) parts.push(`Counting against it: ${list(fraud.map(clause))}.`)
  if (legit.length) parts.push(`In its favour: ${list(legit.map(clause))}.`)

  if (result.routeDisowned === "judgment" && judgments) {
    parts.push(
      `The application route does not look like one this employer would use (route plausibility ${judgments.routePlausibleForEmployer.toFixed(2)}, below ${ROUTE_PLAUSIBLE_THRESHOLD}), so confirming the employer exists was not credited to this posting.`,
    )
  } else if (result.routeDisowned === "flags") {
    parts.push("Applications go to a free mailbox or messaging app rather than the employer, so confirming the employer exists was not credited to this posting.")
  }

  if (!fraud.length && !legit.length) parts.push("No check produced evidence either way.")

  parts.push("The score is computed from a fixed weight table; no model chose the number.")
  return parts.join(" ")
}
