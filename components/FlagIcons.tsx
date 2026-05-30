import type { ApplicationFlag } from "@/lib/json-schemas"

const FLAG_META: Record<string, { icon: string; label: string }> = {
  mail_physical_resume: { icon: "✉️", label: "Apply by physical mail" },
  whatsapp_telegram_only: { icon: "💬", label: "WhatsApp/Telegram only" },
  generic_email_domain: { icon: "📧", label: "Generic email domain" },
  fee_to_apply: { icon: "💸", label: "Fee to apply" },
  id_upfront: { icon: "🪪", label: "ID requested upfront" },
  crypto_payment: { icon: "🪙", label: "Crypto payment" },
  banking_info_upfront: { icon: "🏦", label: "Bank details upfront" },
  external_apply_unreachable: { icon: "🔗", label: "Apply link unreachable" },
  ats_known_provider: { icon: "✅", label: "Known ATS provider" },
  apply_host_mismatch: { icon: "🎭", label: "Brand impersonation (apply link → different company)" },
  apply_host_mismatch_review: { icon: "❓", label: "Apply link company unclear — review" },
}

export function FlagIcons({ flags }: { flags: ApplicationFlag[] }) {
  if (flags.length === 0) return <span className="text-zinc-300">—</span>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((f, i) => {
        const meta = FLAG_META[f.flag] ?? { icon: "⚑", label: f.flag }
        return (
          <span
            key={`${f.flag}-${i}`}
            className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700"
            title={`${meta.label}: ${f.evidence}`}
          >
            <span aria-hidden>{meta.icon}</span>
            <span className="hidden sm:inline">{meta.label}</span>
          </span>
        )
      })}
    </span>
  )
}
