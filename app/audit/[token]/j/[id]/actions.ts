"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { webEnv } from "@/lib/env"

// The app's only write path. Every action re-verifies the audit token server-side (the page
// guard alone doesn't protect POSTs) and throws rather than 404s so a bad token can't silently
// mutate. Notes and requests are append-only; the Job row is only touched to clear scoredAt.
function requireToken(token: string): void {
  if (!webEnv.AUDIT_TOKEN || token !== webEnv.AUDIT_TOKEN) throw new Error("forbidden")
}

export async function addNote(token: string, workbcId: string, formData: FormData): Promise<void> {
  requireToken(token)
  const body = String(formData.get("body") ?? "").trim()
  if (!body) return
  await prisma.reviewNote.create({ data: { workbcId, body } })
  revalidatePath(`/audit/${token}/j/${workbcId}`)
}

export async function flagForJudge(token: string, workbcId: string, formData: FormData): Promise<void> {
  requireToken(token)
  const kind = formData.get("kind") === "deep" ? "deep" : "rerun"
  const note = String(formData.get("note") ?? "").trim() || null
  await prisma.judgeRequest.create({ data: { workbcId, kind, note } })
  if (note) await prisma.reviewNote.create({ data: { workbcId, body: `[${kind} flag] ${note}` } })
  // A rerun goes back to pending immediately so the next update's normal judge pass picks it up.
  // A deep request keeps its current score until the agent verdict overwrites it.
  if (kind === "rerun") {
    await prisma.job.update({ where: { workbcId }, data: { scoredAt: null } })
  }
  revalidatePath(`/audit/${token}/j/${workbcId}`)
}
