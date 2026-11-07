import { z } from "zod"

/**
 * The searches a keyless helper agent reports alongside its verdict. Claude Code's WebSearch does
 * not hand the orchestrator raw API blocks, so this is the agent's own account of what it searched
 * and which results it relied on. The /audit page labels it as agent-reported for that reason.
 */
export const AgentSearchLogSchema = z
    .array(
        z.object({
            query: z.string().min(1).max(500),
            results: z
                .array(z.object({ url: z.string().url().max(2000), title: z.string().max(500).optional() }))
                .max(20)
                .default([]),
        }),
    )
    .max(30)

export type AgentSearchLog = z.infer<typeof AgentSearchLogSchema>

export const AGENT_SEARCH_BLOCK = "agent_web_search"

/** The EmployerWebSearchLog row data for an agent-reported search log. */
export function agentSearchLogRow(log: AgentSearchLog, reportedBy: string): { queries: string[]; blocks: unknown[] } {
    return {
        queries: log.map((g) => g.query),
        blocks: log.map((g) => ({
            type: AGENT_SEARCH_BLOCK,
            reportedBy,
            query: g.query,
            results: g.results.map((r) => ({ type: "web_search_result", url: r.url, title: r.title })),
        })),
    }
}
