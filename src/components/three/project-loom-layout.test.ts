import { describe, expect, it } from "vitest";
import type { Lane } from "@/core/insights/project-graph";
import { LOOM_MAX_LANES, LOOM_STATE_COLORS, loomLayout } from "./project-loom-layout";

const lane = (n: number, states: Lane["stages"][number]["state"][] = ["reached", "reached", "waiting", "not_yet", "not_yet"]): Lane => ({
  taskId: `t${n}`,
  title: `Task ${n}`,
  createdAt: "2026-10-30T10:00:00.000Z",
  incidents: [],
  stages: (["intent", "contract", "change", "proof", "live"] as const).map((key, i) => ({ key, state: states[i]!, label: key === "change" ? "Waiting for review" : "", detail: null, at: null, href: states[i] === "not_yet" ? null : `/app/tasks/t${n}#${key}` })),
});

describe("the Real-Project Loom's layout (ADR 0142)", () => {
  it("places each real stage as a node that keeps its record's link, stages across and tasks in depth", () => {
    const { nodes, edges, shown } = loomLayout([lane(1), lane(2)]);
    expect(shown).toBe(2);
    expect(nodes).toHaveLength(10);
    expect(nodes[0]).toMatchObject({ id: "t1:intent", position: [-4.8, 0, 0.85], color: LOOM_STATE_COLORS.reached, href: "/app/tasks/t1#intent" });
    expect(nodes[5]!.position[2]).toBeCloseTo(-0.85);
    expect(nodes.find((n) => n.id === "t1:change")).toMatchObject({ state: "waiting", label: "Task 1: Change, waiting. Waiting for review" });
    expect(nodes.find((n) => n.id === "t1:proof")!.href).toBeNull();
    const repeated = loomLayout([{ ...lane(3), stages: lane(3).stages.map((s) => (s.key === "live" ? { ...s, label: "Not yet" } : s)) }]);
    expect(repeated.nodes.find((n) => n.stage === "live")!.label).toBe("Task 3: Live, not yet");
    // Intent to contract and contract to change are solid; change to proof and proof to live aren't.
    expect(edges.slice(0, 4).map((e) => e.solid)).toEqual([true, true, false, false]);
  });

  it("shows at most the newest lanes it can keep readable", () => {
    expect(loomLayout(Array.from({ length: 40 }, (_, i) => lane(i))).shown).toBe(LOOM_MAX_LANES);
    expect(loomLayout([])).toEqual({ nodes: [], edges: [], shown: 0 });
  });
});
