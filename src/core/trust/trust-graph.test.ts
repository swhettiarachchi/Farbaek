import { describe, expect, it } from "vitest";
import { agentId, buildTrustGraph, neighbours, personId, projectId, whoCanChange, type TrustInput } from "./trust-graph";

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
      ["bo@studio.example", ["can propose changes"]],
      ["Ada's laptop", ["paired", "can propose changes"]],
    ]);
    // The viewer's agent holds a lease but its person can only view, so it isn't counted; it's shown as limited.
    expect(g.edges.find((e) => e.from === agentId("a2") && e.to === projectId("p1"))).toMatchObject({ limited: true, label: "lease, but its person can only view" });
    // An expired lease and a revoked agent reach nothing; an archived project takes no edges.
    expect(g.edges.some((e) => e.from === agentId("a3") || e.from === agentId("a4"))).toBe(false);
    expect(g.edges.some((e) => e.to === projectId("p3"))).toBe(false);
    expect(g.nodes.find((n) => n.id === agentId("a3"))).toMatchObject({ inactive: true, detail: "Lease expired" });
  });

  it("includes workflows, which run as the person who approved them", () => {
    const g = buildTrustGraph(base);
    const p2 = whoCanChange(g, "p2");
    expect(p2.at(-1)).toMatchObject({ node: { kind: "workflow", label: "Harden checkout" } });
    expect(p2.at(-1)!.via.map((e) => e.label)).toEqual(["approved; its runs start as them", "runs agents on"]);
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
