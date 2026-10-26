import { describe, expect, it } from "vitest";
import { runIncidentEscalation, type DueIncident, type EscalationDeps } from "./incident-escalation";

const incident = (over: Partial<DueIncident> = {}): DueIncident => ({ id: "i1", orgId: "o1", number: 1, title: "Shop is down", severity: "high", ...over });

function fakeDeps(over: { due?: DueIncident[]; tools?: Record<string, boolean>; claimed?: Set<string>; failFor?: string } = {}) {
  const told: [string, string][] = [];
  const claimed = over.claimed ?? new Set<string>();
  const deps: EscalationDeps = {
    due: async () => over.due ?? [incident()],
    hasTools: async (orgId) => over.tools?.[orgId] ?? true,
    claim: async (id) => (claimed.has(id) ? false : (claimed.add(id), true)),
    managers: async () => ["owner-1", "admin-1"],
    tell: async (userId, i) => {
      if (userId === over.failFor) throw new Error("bounced");
      told.push([userId, i.id]);
    },
  };
  return { deps, told, claimed };
}

describe("incident escalation", () => {
  it("tells every owner and admin once", async () => {
    const { deps, told, claimed } = fakeDeps();
    expect(await runIncidentEscalation(deps)).toEqual({ escalated: 1, told: 2, withoutTools: 0 });
    expect(told).toEqual([
      ["owner-1", "i1"],
      ["admin-1", "i1"],
    ]);
    const again = fakeDeps({ claimed });
    expect(await runIncidentEscalation(again.deps)).toEqual({ escalated: 0, told: 0, withoutTools: 0 });
  });

  it("skips workspaces without incident response tools, and keeps going when one person fails", async () => {
    const { deps, told } = fakeDeps({ due: [incident(), incident({ id: "i2", orgId: "o2" })], tools: { o1: false }, failFor: "owner-1" });
    expect(await runIncidentEscalation(deps)).toEqual({ escalated: 1, told: 1, withoutTools: 1 });
    expect(told).toEqual([["admin-1", "i2"]]);
  });
});
