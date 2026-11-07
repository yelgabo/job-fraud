import { describe, expect, it } from "vitest"
import { AGENT_SEARCH_BLOCK, AgentSearchLogSchema, agentSearchLogRow } from "./agent-search-log"

describe("AgentSearchLogSchema", () => {
    it("accepts queries with results and defaults missing results to none", () => {
        const log = AgentSearchLogSchema.parse([
            { query: "acme victoria", results: [{ url: "https://acme.ca", title: "Acme" }] },
            { query: "4615 ocean park pl" },
        ])
        expect(log[1].results).toEqual([])
    })

    it("rejects a result without a real URL", () => {
        expect(AgentSearchLogSchema.safeParse([{ query: "q", results: [{ url: "acme.ca" }] }]).success).toBe(false)
    })
})

describe("agentSearchLogRow", () => {
    it("stores one labelled block per query and the query list", () => {
        const row = agentSearchLogRow([{ query: "acme", results: [{ url: "https://acme.ca" }] }], "haiku-5.5")
        expect(row.queries).toEqual(["acme"])
        expect(row.blocks).toEqual([
            {
                type: AGENT_SEARCH_BLOCK,
                reportedBy: "haiku-5.5",
                query: "acme",
                results: [{ type: "web_search_result", url: "https://acme.ca", title: undefined }],
            },
        ])
    })
})
