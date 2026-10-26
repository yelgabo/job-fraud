// Measures the composer against human labels. Pure: the evidence comes from a frozen fixture
// (scripts/snapshot-labelled-evidence.ts), so the result moves only when the scoring code, the
// labels, or a deliberate re-snapshot moves it.

import type { ApplicationFlag, Checks } from "../shared/json-schemas"
import type { Category } from "../signals/job-category"
import type { RiskBand } from "../shared/risk-band"
import { composeScore, type Judgments } from "../scoring/compose"
import type { WorksheetLabel } from "./labels"

export type EvalCase = {
  index: number
  workbcId: string
  title: string
  employer: string | null
  checks: Checks
  flags: ApplicationFlag[]
  category: Category
  judgments: Judgments | null
}

type DecidedBand = "low" | "medium" | "high"

export type CaseResult = {
  index: number
  workbcId: string
  title: string
  employer: string | null
  human: DecidedBand
  reason: string
  composed: RiskBand
  score: number
}

export type Agreement = {
  /** Labelled low/medium/high; `unsure` labels are counted separately and never scored. */
  decided: number
  agree: number
  unsure: number
  byBand: Record<DecidedBand, { agree: number; of: number }>
  /** confusion[human][composed] */
  confusion: Record<DecidedBand, Partial<Record<RiskBand, number>>>
  misses: CaseResult[]
}

export function measureAgreement(
  cases: EvalCase[],
  labels: Map<number, WorksheetLabel>,
  opts: { useJudgments: boolean } = { useJudgments: true },
): Agreement {
  const byIndex = new Map(cases.map((c) => [c.index, c]))
  const result: Agreement = {
    decided: 0,
    agree: 0,
    unsure: 0,
    byBand: { low: { agree: 0, of: 0 }, medium: { agree: 0, of: 0 }, high: { agree: 0, of: 0 } },
    confusion: { low: {}, medium: {}, high: {} },
    misses: [],
  }
  for (const l of [...labels.values()].sort((a, b) => a.index - b.index)) {
    const c = byIndex.get(l.index)
    if (!c) throw new Error(`labelled posting ${l.index} has no evidence in the fixture; re-run npm run eval:snapshot`)
    if (l.label === "unsure") {
      result.unsure++
      continue
    }
    const composed = composeScore({
      judgments: opts.useJudgments ? c.judgments : null,
      checks: c.checks,
      flags: c.flags,
      category: c.category,
    })
    const human = l.label
    result.decided++
    result.byBand[human].of++
    result.confusion[human][composed.riskBand] = (result.confusion[human][composed.riskBand] ?? 0) + 1
    if (composed.riskBand === human) {
      result.agree++
      result.byBand[human].agree++
    } else {
      result.misses.push({
        index: c.index,
        workbcId: c.workbcId,
        title: c.title,
        employer: c.employer,
        human,
        reason: l.reason,
        composed: composed.riskBand,
        score: composed.fraudScore,
      })
    }
  }
  return result
}
