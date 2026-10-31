import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildTrustGraph, type TrustInput } from "@/core/trust/trust-graph";
import { TrustMap } from "./trust-map";

const base: TrustInput = {
  members: [{ userId: "u1", label: "ada@studio.example", role: "owner", approveWithheld: false }],
  agents: [{ id: "a1", name: "Laptop", pairedBy: "u1", revoked: false, lease: { expiresAt: "2026-12-01T00:00:00Z", projects: null, capabilities: ["propose"] } }],
  projects: [{ id: "p1", name: "Storefront", archived: false }],
  repoLinks: [],
  services: [],
  workflows: [],
  now: new Date("2026-10-31T12:00:00Z"),
};
const render = (input: TrustInput) => renderToStaticMarkup(createElement(TrustMap, { graph: buildTrustGraph(input), focus: null }));

describe("TrustMap (ADR 0146)", () => {
  it("draws a column for tools and one for rules when there are some, with each in words", () => {
    const html = render({ ...base, toolPins: [{ agentId: "a1", quarantined: true, tools: ["write_file"] }], rules: { version: 1, rules: [{ id: "r1", paths: ["src/payments/**"], effect: "block", reason: "By hand only." }] } });
    expect(html).toContain(">Tools<");
    expect(html).toContain(">Rules and services<");
    expect(html).toContain('aria-label="write_file: Tool pinned on 1 agent, on one waiting for review"');
    expect(html).toContain('aria-label="src/payments/**: Stop the change. By hand only."');
    // The quarantined agent's tool edge is dashed.
    expect(html).toContain('stroke-dasharray="5 4"');
  });

  it("leaves out columns with nothing in them", () => {
    const html = render(base);
    expect(html).not.toContain(">Tools<");
    expect(html).not.toContain(">Rules and services<");
    expect(html).toContain(">People<");
  });
});
