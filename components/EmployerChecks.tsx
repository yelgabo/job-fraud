import type { Checks } from "@/lib/shared/json-schemas"

// Keyed, plain-language rendering of an employer's verification record, replacing the raw
// JSON dump the posting page used to show. Every known field of ChecksSchema has a row here;
// rows render only when the field was actually recorded (null/undefined means "not checked",
// per the scoring rubric, and saying "not checked" for every absent probe would drown the
// real results). Keys this component does not know about still render, as raw JSON at the
// bottom, so adding a field to ChecksSchema without a row here shows up as debug output on
// the site instead of silently disappearing.

const KNOWN_KEYS = new Set([
  "websiteReachable",
  "websiteStatusCode",
  "applicationReachable",
  "addressGeocoded",
  "addressMatchConfidence",
  "addressResolvedTo",
  "addressMatchesCity",
  "addressFlags",
  "web",
])

const MATCH_TEXT: Record<string, string> = {
  match: "matches the posting",
  mismatch: "does not match the posting",
  uncertain: "could not be confirmed",
}

const ADDRESS_TYPE_TEXT: Record<string, string> = {
  business: "a business address",
  residential: "a residential address",
  po_box: "a PO box",
  virtual: "a virtual office or mail-forwarding service",
  none: "none - the posting has no mailing address",
  uncertain: "uncertain",
}

function yesNo(v: boolean): string {
  return v ? "yes" : "no"
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr className="border-t border-zinc-100 first:border-t-0">
      <th scope="row" className="w-56 py-1.5 pr-4 text-left align-top font-medium text-zinc-500">
        {label}
      </th>
      <td className="py-1.5 align-top text-zinc-700">{value}</td>
    </tr>
  )
}

export function EmployerChecks({ checks, checkedAt }: { checks: Checks; checkedAt?: Date | null }) {
  const web = checks.web
  const extras = Object.fromEntries(Object.entries(checks).filter(([k]) => !KNOWN_KEYS.has(k)))
  const hasExtras = Object.keys(extras).length > 0

  const rows: Array<{ label: string; value: React.ReactNode }> = []

  if (web) {
    rows.push({
      label: "Website found",
      value: web.websiteUrl ? (
        <a href={web.websiteUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-500">
          {web.websiteUrl}
        </a>
      ) : (
        "none found"
      ),
    })
    rows.push({
      label: "Website reachable",
      value: web.websiteReachable === "unknown" ? "not checked" : web.websiteReachable,
    })
    rows.push({ label: "Business identity", value: MATCH_TEXT[web.businessMatch] ?? web.businessMatch })
    rows.push({ label: "Location", value: MATCH_TEXT[web.locationMatch] ?? web.locationMatch })
    rows.push({
      label: "Job listings on its site",
      value: web.hasJobsListing === "unknown" ? "not checked" : web.hasJobsListing,
    })
    rows.push({
      label: "Mail-application address",
      value: ADDRESS_TYPE_TEXT[web.applicationAddressType] ?? web.applicationAddressType,
    })
    rows.push({
      label: "How it was verified",
      value:
        web.source === "ats-tenant-match"
          ? "presumed real: every posting applies through the employer's own account on a recognized hiring system"
          : "web search",
    })
    rows.push({ label: "Confidence", value: web.confidence.toFixed(2) })
    if (web.summary) rows.push({ label: "Summary", value: web.summary })
  }

  if (checks.websiteReachable != null) rows.push({ label: "Website probe", value: yesNo(checks.websiteReachable) })
  if (checks.websiteStatusCode != null) rows.push({ label: "Website status code", value: checks.websiteStatusCode })
  if (checks.applicationReachable != null)
    rows.push({ label: "Application link reachable", value: yesNo(checks.applicationReachable) })
  if (checks.addressGeocoded != null) rows.push({ label: "Address found on a map", value: yesNo(checks.addressGeocoded) })
  if (checks.addressResolvedTo != null) rows.push({ label: "Address resolved to", value: checks.addressResolvedTo })
  if (checks.addressMatchConfidence != null)
    rows.push({ label: "Address match confidence", value: checks.addressMatchConfidence.toFixed(2) })
  if (checks.addressMatchesCity != null)
    rows.push({ label: "Address in the claimed city", value: yesNo(checks.addressMatchesCity) })
  if (checks.addressFlags && checks.addressFlags.length > 0)
    rows.push({ label: "Address flags", value: checks.addressFlags.join(", ") })
  if (checkedAt) rows.push({ label: "Checked on", value: checkedAt.toISOString().slice(0, 10) })

  if (rows.length === 0 && !hasExtras) {
    return <p className="mt-3 text-sm text-zinc-400">This employer has not been checked yet.</p>
  }

  return (
    <div className="mt-3">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <Row key={r.label} label={r.label} value={r.value} />
          ))}
        </tbody>
      </table>
      {hasExtras && (
        <pre className="mt-3 overflow-x-auto rounded bg-zinc-50 p-3 text-xs text-zinc-700">
          {JSON.stringify(extras, null, 2)}
        </pre>
      )}
    </div>
  )
}
