import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/agents/tool-actions", () => ({ approveAgentToolsAction: async () => ({ status: "idle" }) }));
const { ToolPinPanel } = await import("./tool-pin");

describe("ToolPinPanel (ADR 0133, ADR 0148)", () => {
  it("says where a tool from an MCP server comes from, and that each call still waits for a person", () => {
    const html = renderToStaticMarkup(
      createElement(ToolPinPanel, {
        agentId: "a1",
        pin: { status: "quarantined", tools: 7, pendingId: "p".repeat(64), diff: { added: ["mcp__notes__search_notes", "review_site"], removed: [], changed: [] } },
        canApprove: true,
        disabledReason: null,
      }),
    );
    expect(html).toContain("Its tools changed, so its AI steps are paused until they&#x27;re reviewed.");
    expect(html).toContain("a tool from the MCP server “notes” added on that computer. Each call still waits for the person there to approve it.");
    // Farbaek's own tool gets no such note.
    expect(html.match(/a tool from the MCP server/g)).toHaveLength(1);
    expect(html).toContain("Approve these tools");
  });
});
