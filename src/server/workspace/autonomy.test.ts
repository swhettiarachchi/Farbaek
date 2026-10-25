import { describe, expect, it } from "vitest";
import { trialWindow, type BillingSnapshot } from "@/core/billing/trial";
import type { FileDeps } from "./files";
import { AUTONOMY_OFF, SHADOW_NOT_IN_PLAN, limitsFrom, setWorkspaceAutonomy, type AutonomyDeps } from "./autonomy";
import type { WriteDeps } from "./use-cases";

const NOW = new Date("2026-10-25T10:00:00.000Z");

function fakeDeps(billing: BillingSnapshot, role: "owner" | "member" = "owner") {
  const calls: Parameters<AutonomyDeps["setAutonomy"]>[0][] = [];
  const deps: WriteDeps & FileDeps & AutonomyDeps = {
    role: async () => role,
    billing: async () => billing,
    countActiveProjects: async () => 0,
    loadTask: async () => null,
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    importFiles: async () => ({ ok: true, value: { created: 0, updated: 0, unchanged: 0 } }),
    saveFile: async () => ({ ok: true, value: 1 }),
    deleteFile: async () => ({ ok: true, value: null }),
    newEventId: () => "key-1",
    now: () => NOW,
    setAutonomy: async (input) => (calls.push(input), { ok: true, value: null }),
  };
  return { deps, calls };
}

const input = { orgId: "o1", userId: "u1", maxFiles: 2, allowCreates: false };

describe("shadow mode settings (ADR 0075)", () => {
  it("turns limits into a rehearsal at level 0, and into real limits only at level 2", () => {
    expect(limitsFrom(AUTONOMY_OFF)).toBeNull();
    expect(limitsFrom({ ...AUTONOMY_OFF, shadowSince: NOW.toISOString(), maxFiles: 2 })).toEqual({ level: 2, maxFiles: 2, allowCreates: false, rehearsal: true });
    expect(limitsFrom({ ...AUTONOMY_OFF, level: 2, maxFiles: 2 })).toEqual({ level: 2, maxFiles: 2, allowCreates: false });
    // A suspended level 2 rehearses nothing and allows nothing.
    expect(limitsFrom({ ...AUTONOMY_OFF, level: 2, suspendedAt: NOW.toISOString(), suspendedReason: "x" })).toBeNull();
  });

  it("lets the trial and Pro rehearse, and says which plans include it otherwise", async () => {
    const trial = fakeDeps({ state: "trialing", trial: trialWindow(NOW) });
    expect(await setWorkspaceAutonomy(trial.deps, { ...input, level: 0, shadow: true })).toEqual({ ok: true, value: null });
    expect(trial.calls[0]).toMatchObject({ level: 0, shadow: true });

    const free = fakeDeps({ state: "free" });
    expect(await setWorkspaceAutonomy(free.deps, { ...input, level: 0, shadow: true })).toEqual({ ok: false, code: "FEATURE_NOT_IN_PLAN", message: SHADOW_NOT_IN_PLAN });
    expect(free.calls).toEqual([]);
    // Turning it off, or level 0 on its own, needs no plan.
    expect(await setWorkspaceAutonomy(free.deps, { ...input, level: 0 })).toEqual({ ok: true, value: null });
    expect(free.calls[0]).toMatchObject({ shadow: false });
  });

  it("never rehearses at level 2, and is for owners and admins only", async () => {
    const { deps, calls } = fakeDeps({ state: "trialing", trial: trialWindow(NOW) });
    await setWorkspaceAutonomy(deps, { ...input, level: 2, shadow: true });
    expect(calls[0]).toMatchObject({ level: 2, shadow: false });
    const member = fakeDeps({ state: "trialing", trial: trialWindow(NOW) }, "member");
    expect(await setWorkspaceAutonomy(member.deps, { ...input, level: 0, shadow: true })).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});
