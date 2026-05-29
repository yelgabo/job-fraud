import { bandFor, type RiskBand } from "@/lib/risk-band"
import { cn } from "@/lib/utils"

const BAND_STYLE: Record<RiskBand, string> = {
  high: "bg-red-100 text-red-800 ring-red-600/20",
  medium: "bg-amber-100 text-amber-800 ring-amber-600/20",
  low: "bg-green-100 text-green-800 ring-green-600/20",
  unknown: "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
}

export function ScoreChip({ score, className }: { score: number; className?: string }) {
  const band = bandFor(score)
  const label = score < 0 ? "—" : String(score)
  return (
    <span
      className={cn(
        "inline-flex min-w-[3rem] items-center justify-center rounded-md px-2 py-1 text-sm font-semibold tabular-nums ring-1 ring-inset",
        BAND_STYLE[band],
        className,
      )}
      title={`${band} risk (score ${label})`}
    >
      {label}
    </span>
  )
}
