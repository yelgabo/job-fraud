"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { after } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { webEnv } from "@/lib/env"
import { DATA_CACHE_TAG } from "@/lib/shared/cache-tags"
import { requestRevalidation } from "@/lib/shared/request-revalidation"
import { tokenMatches } from "@/lib/shared/token-match"

// The app's only write path. Every action re-verifies the audit token server-side (the page
// guard alone doesn't protect POSTs) and throws rather than 404s so a bad token can't silently
// mutate. Notes and requests are append-only; the Job row is only touched to send it back to pending.
function requireToken(token: string): void {
  if (!webEnv.AUDIT_TOKEN || !tokenMatches(token, webEnv.AUDIT_TOKEN)) throw new Error("forbidden")
}

export async function addNote(token: string, workbcId: string, formData: FormData): Promise<void> {
  requireToken(token)
  const body = String(formData.get("body") ?? "").trim()
  if (!body) return
  await prisma.reviewNote.create({ data: { workbcId, body } })
  revalidatePath(`/audit/${token}/j/${workbcId}`)
}

const FlagForm = z.object({
  kind: z.enum(["rerun", "deep"]),
  note: z
    .string()
    .nullable()
    .transform((s) => s?.trim() || null),
})

export async function flagForJudge(token: string, workbcId: string, formData: FormData): Promise<void> {
  requireToken(token)
  const parsed = FlagForm.safeParse({ kind: formData.get("kind"), note: formData.get("note") })
  if (!parsed.success) throw new Error(`invalid review request: kind must be "rerun" or "deep"`)
  const { kind, note } = parsed.data

  // Serializable so two submissions racing past the open-request check cannot both insert:
  // Postgres aborts one of them instead.
  const sentBack = await prisma.$transaction(
    async (tx) => {
      const open = await tx.judgeRequest.findFirst({
        where: { workbcId, kind, resolvedAt: null },
        select: { id: true, note: true },
      })
      if (!open) await tx.judgeRequest.create({ data: { workbcId, kind, note } })
      // The deep-look agent reads its owner context from the request's note
      // (.claude/skills/update-postings/SKILL.md), so a repeat flag adds to it.
      else if (note) {
        await tx.judgeRequest.update({
          where: { id: open.id },
          data: { note: open.note ? `${open.note}\n${note}` : note },
        })
      }
      if (note) await tx.reviewNote.create({ data: { workbcId, body: `[${kind} flag] ${note}` } })
      // A rerun goes back to pending immediately so the next update's normal judge pass picks it
      // up. A deep request keeps its current score, and the posting stays on the site, until
      // judge-keyless:apply re-scores it from the agent's verdict (lib/shared/deep-requests.ts).
      if (kind !== "rerun") return null
      // sendBackToPending's write, inlined because it cannot join this transaction.
      // lib/scoring/write-verdict.ts owns the rule; keep the two in step.
      return tx.job.update({
        where: { workbcId },
        data: { scoredAt: null, status: "PENDING" },
        select: { employerId: true },
      })
    },
    { isolationLevel: "Serializable" },
  )

  revalidatePath(`/audit/${token}/j/${workbcId}`)
  if (!sentBack) return

  // The posting just left the public site. These purge this replica as the action returns; the
  // other replica only hears about it through the revalidate endpoint, called after the response
  // so the owner does not wait on the warm renders.
  revalidateTag(DATA_CACHE_TAG)
  revalidatePath(`/j/${workbcId}`)
  if (sentBack.employerId) revalidatePath(`/e/${sentBack.employerId}`)
  after(requestRevalidation)
}
