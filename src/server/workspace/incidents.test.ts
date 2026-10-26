import { describe, expect, it } from "vitest";
import type { BillingSnapshot } from "@/core/billing/trial";
import {
  INCIDENT_TOOLS_NOT_IN_PLAN,
  RESUME_MANAGERS_ONLY,
  addIncidentNote,
  changeIncident,
  openIncidentByHand,
  pauseAgents,
  recordPrevention,
  resolveIncident,
  resumeAgents,
  type IncidentDeps,
} from "./incidents";
import type { OrgRole } from "./types";
import type { WriteDeps } from "./use-cases";

const MAX_2X: BillingSnapshot = { state: "active", paidPlanId: "max_2x" };

function fakeDeps(over: { role?: OrgRole; billing?: BillingSnapshot; error?: string; running?: number } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const rpc = <T>(name: string, value: T) => async (input: unknown) => (calls.push({ name, input }), over.error ? { ok: false as const, error: over.error } : { ok: true as const, value });
  const deps: WriteDeps & IncidentDeps = {
    role: async () => over.role ?? "member",
    billing: async () => over.billing ?? { state: "free" },
    countActiveProjects: async () => 0,
    loadTask: async () => null,
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    setAgentsPause: rpc("pause", true),
    stopRuns: (orgId) => (calls.push({ name: "stop", input: orgId }), over.running ?? 0),
    openIncident: rpc("open", 4),
    addIncidentEvent: rpc("event", null),
    updateIncident: rpc("update", null),
    newEventId: () => "key-1",
    now: () => new Date("2026-10-25T10:00:00Z"),
  };
  return { deps, calls };
}
const base = { orgId: "o1", userId: "u1" };

describe("the emergency pause", () => {
  it("lets any contributor pause, on any plan, and stops live runs", async () => {
    const { deps, calls } = fakeDeps({ running: 2 });
    expect(await pauseAgents(deps, { ...base, reason: "  Odd   changes  " })).toEqual({ ok: true, value: { changed: true, stopped: 2 } });
    expect(calls[0]).toMatchObject({ name: "pause", input: { paused: true, reason: "Odd changes" } });
    expect(calls[1]).toEqual({ name: "stop", input: "o1" });
    expect(await pauseAgents(fakeDeps({ role: "viewer" }).deps, { ...base, reason: null })).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("is resumed only by an owner or admin", async () => {
    expect(await resumeAgents(fakeDeps().deps, base)).toMatchObject({ ok: false, code: "FORBIDDEN", message: RESUME_MANAGERS_ONLY });
    const { deps, calls } = fakeDeps({ role: "admin" });
    expect(await resumeAgents(deps, base)).toEqual({ ok: true, value: { changed: true } });
    expect(calls).toEqual([{ name: "pause", input: { orgId: "o1", actor: "u1", paused: false, reason: null } }]);
  });
});

describe("incident tools", () => {
  it("open by hand, take notes and change severity on Max 2x and up only", async () => {
    const free = fakeDeps();
    expect(await openIncidentByHand(free.deps, { ...base, title: "Prices wrong", severity: "high", projectId: null, text: null })).toMatchObject({ ok: false, code: "FEATURE_NOT_IN_PLAN", message: INCIDENT_TOOLS_NOT_IN_PLAN });
    expect(await addIncidentNote(free.deps, { ...base, number: 1, text: "x" })).toMatchObject({ ok: false, code: "FEATURE_NOT_IN_PLAN" });
    expect(await changeIncident(free.deps, { ...base, number: 1, severity: "low" })).toMatchObject({ ok: false, code: "FEATURE_NOT_IN_PLAN" });
    expect(free.calls).toEqual([]);

    const { deps, calls } = fakeDeps({ billing: MAX_2X });
    expect(await openIncidentByHand(deps, { ...base, title: "Prices wrong", severity: "high", projectId: null, text: "Seen by customers." })).toEqual({ ok: true, value: { number: 4 } });
    expect(await changeIncident(deps, { ...base, number: 4, status: "contained" })).toEqual({ ok: true, value: null });
    expect(calls[1]!.input).toMatchObject({ number: 4, severity: null, status: "contained" });
    expect(await changeIncident(deps, { ...base, number: 4, status: "resolved" })).toMatchObject({ ok: false, code: "INVALID_INCIDENT" });
    expect(await openIncidentByHand(deps, { ...base, title: "x", severity: "high", projectId: null, text: null })).toMatchObject({ ok: false, code: "INVALID_INCIDENT" });
  });

  it("resolves on every plan, with what happened", async () => {
    const { deps, calls } = fakeDeps();
    expect(await resolveIncident(deps, { ...base, number: 2, outcome: "short" })).toMatchObject({ ok: false, code: "INVALID_INCIDENT" });
    expect(await resolveIncident(deps, { ...base, number: 2, outcome: "The host restarted; nothing in the project changed." })).toEqual({ ok: true, value: null });
    expect(calls[0]!.input).toMatchObject({ status: "resolved", outcome: "The host restarted; nothing in the project changed." });
  });

  it("records prevention with the rules version, and passes the database's refusals on", async () => {
    const { deps, calls } = fakeDeps();
    await recordPrevention(deps, { ...base, number: 3, rulesVersion: 5 });
    expect(calls[0]!.input).toMatchObject({ kind: "prevention", ref: { rulesVersion: 5 } });
    expect(await resolveIncident(fakeDeps({ error: "INCIDENT_RESOLVED" }).deps, { ...base, number: 2, outcome: "Already done, nothing new here." })).toMatchObject({ ok: false, code: "INCIDENT_RESOLVED" });
  });
});
