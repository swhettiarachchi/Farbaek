import { describe, expect, it } from "vitest";
import { agentId, buildTrustGraph, neighbours, personId, projectId, ruleId, rulesOn, toolId, whoCanChange, type TrustInput } from "./trust-graph";

const NOW = new Date("2026-10-30T12:00:00Z");
const base: TrustInput = {
  members: [
    { userId: "u-owner", label: "ada@studio.example", role: "owner", approveWithheld: false },
    { userId: "u-member", label: "bo@studio.example", role: "member", approveWithheld: true },
    { userId: "u-viewer", label: "cy@studio.example", role: "viewer", approveWithheld: false },
  ],
  agents: [
    { id: "a1", name: "Ada's laptop", pairedBy: "u-owner", revoked: false, lease: { expiresAt: "2026-12-01T00:00:00Z", projects: ["p1"], capabilities: ["read", "propose", "model"] } },
    { id: "a2", name: "Cy's desktop", pairedBy: "u-viewer", revoked: false, lease: { expiresAt: "2026-12-01T00:00:00Z", projects: null, capabilities: ["propose"] } },
    { id: "a3", name: "Old box", pairedBy: "u-owner", revoked: false, lease: { expiresAt: "2026-10-01T00:00:00Z", projects: null, capabilities: ["propose"] } },
    { id: "a4", name: "Lost phone", pairedBy: "u-member", revoked: true, lease: { expiresAt: "2026-12-01T00:00:00Z", projects: null, capabilities: ["propose"] } },
  ],
  projects: [
    { id: "p1", name: "Storefront", archived: false },
    { id: "p2", name: "Docs", archived: false },
    { id: "p3", name: "Old site", archived: true },
  ],
  repoLinks: [{ projectId: "p1", repo: "studio/shop" }],
  services: [{ id: "integration:github", label: "GitHub", detail: "Connected as studio-bot", setBy: "u-owner" }],
  workflows: [{ id: "w1", title: "Harden checkout", projectId: "p2", approvedBy: "u-owner", status: "running" }],
  now: NOW,
};

describe("the trust graph (ADR 0132)", () => {
  it("answers who and what can change a project, with how, and never through an inactive or limited path", () => {
    const g = buildTrustGraph(base);
    const p1 = whoCanChange(g, "p1");
    expect(p1.map((a) => [a.node.label, a.via.map((e) => e.label)])).toEqual([
      ["ada@studio.example", ["can change and approve"]],
      ["bo@studio.example", ["can suggest changes"]],
      ["Ada's laptop", ["paired", "can suggest changes"]],
    ]);
    // The viewer's agent holds a lease but its person can only view, so it isn't counted; it's shown as limited.
    expect(g.edges.find((e) => e.from === agentId("a2") && e.to === projectId("p1"))).toMatchObject({ limited: true, label: "has access, but its person can only view" });
    // An expired lease and a revoked agent reach nothing; an archived project takes no edges.
    expect(g.edges.some((e) => e.from === agentId("a3") || e.from === agentId("a4"))).toBe(false);
    expect(g.edges.some((e) => e.to === projectId("p3"))).toBe(false);
    expect(g.nodes.find((n) => n.id === agentId("a3"))).toMatchObject({ inactive: true, detail: "Its access has ended" });
  });

  it("includes workflows, which run as the person who approved them", () => {
    const g = buildTrustGraph(base);
    const p2 = whoCanChange(g, "p2");
    expect(p2.at(-1)).toMatchObject({ node: { kind: "workflow", label: "Harden checkout" } });
    expect(p2.at(-1)!.via.map((e) => e.label)).toEqual(["approved it; its runs use their access", "runs agents on this project"]);
  });

  it("shows what depends on a connected service, and who connected it", () => {
    const g = buildTrustGraph(base);
    const n = neighbours(g, "integration:github");
    expect(n.in.map((a) => [a.node.label, a.via[0]!.label])).toEqual([
      ["ada@studio.example", "connected"],
      ["Storefront", "pull requests to studio/shop"],
    ]);
    expect(neighbours(g, personId("u-viewer")).out.map((a) => a.via[0]!.kind)).toEqual(["can_view", "can_view", "paired"]);
  });
});

describe("tools and rules in the trust graph (ADR 0146)", () => {
  const withPins: TrustInput = {
    ...base,
    toolPins: [
      { agentId: "a1", quarantined: false, tools: ["read_file", "write_file"] },
      { agentId: "a2", quarantined: true, tools: ["read_file"] },
      // An expired agent's pin reaches nothing.
      { agentId: "a3", quarantined: false, tools: ["run_command"] },
    ],
    rules: { version: 3, rules: [{ id: "r1", paths: ["src/payments/**"], effect: "block", reason: "Payments change only by hand." }] },
  };

  it("shows the tools each active agent may call, and marks a quarantined agent's as refused", () => {
    const g = buildTrustGraph(withPins);
    expect(g.nodes.filter((n) => n.kind === "tool").map((n) => [n.label, n.detail])).toEqual([
      ["read_file", "Tool pinned on 2 agents, on one waiting for review"],
      ["write_file", "Tool pinned on 1 agent"],
    ]);
    expect(g.nodes.some((n) => n.id === toolId("run_command"))).toBe(false);
    const reads = neighbours(g, toolId("read_file")).in;
    expect(reads.map((a) => [a.node.id, a.via[0]!.label, a.via[0]!.limited])).toEqual([
      [agentId("a1"), "may call", false],
      [agentId("a2"), "its tools changed: refused until reviewed", true],
    ]);
  });

  it("shows each rule governing every active project, with its effect in words and its version", () => {
    const g = buildTrustGraph(withPins);
    const rule = g.nodes.find((n) => n.id === ruleId("r1"))!;
    expect(rule).toMatchObject({ kind: "rule", label: "src/payments/**", detail: "Stop the change. Payments change only by hand." });
    expect(rulesOn(g, "p1").map((a) => [a.via[0]!.label, a.via[0]!.source])).toEqual([["a change to src/payments/** is stopped, and no one can approve it", "Workspace rules, version 3"]]);
    expect(rulesOn(g, "p3")).toEqual([]);
    // Rules don't change who can change a project; they say what needs more.
    expect(whoCanChange(g, "p1")).toEqual(whoCanChange(buildTrustGraph(base), "p1"));
  });

  it("is the same graph as before without pins or rules", () => {
    expect(buildTrustGraph({ ...base, toolPins: [], rules: null })).toEqual(buildTrustGraph(base));
  });
});
