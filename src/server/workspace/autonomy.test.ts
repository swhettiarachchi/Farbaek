import { describe, expect, it } from "vitest";
import { trialWindow, type BillingSnapshot } from "@/core/billing/trial";
import type { FileDeps } from "./files";
import { AUTONOMY_OFF, LEVEL_3_NOT_IN_PLAN, SHADOW_NOT_IN_PLAN, limitsFrom, setWorkspaceAutonomy, type AutonomyDeps } from "./autonomy";
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

describe("level 3 settings (ADR 0086)", () => {
  const MAX_3X: BillingSnapshot = { state: "active", paidPlanId: "max_3x" };

  it("is for Max 3x and up, with up to 10 files and a daily limit from the list", async () => {
    const { deps, calls } = fakeDeps(MAX_3X);
    expect(await setWorkspaceAutonomy(deps, { ...input, level: 3, maxFiles: 8, dailyLimit: 20 })).toEqual({ ok: true, value: null });
    expect(calls[0]).toMatchObject({ level: 3, maxFiles: 8, dailyLimit: 20 });
    expect(await setWorkspaceAutonomy(deps, { ...input, level: 3, maxFiles: 11, dailyLimit: 20 })).toMatchObject({ ok: false, message: "Choose a file limit from 1 to 10." });
    expect(await setWorkspaceAutonomy(deps, { ...input, level: 3, maxFiles: 8, dailyLimit: 7 })).toMatchObject({ ok: false, message: expect.stringContaining("5, 10, 20, 50") });
    expect(await setWorkspaceAutonomy(deps, { ...input, level: 2, maxFiles: 8 })).toMatchObject({ ok: false, message: "Choose a file limit from 1 to 5." });

    const pro = fakeDeps({ state: "active", paidPlanId: "pro" });
    expect(await setWorkspaceAutonomy(pro.deps, { ...input, level: 3, maxFiles: 8, dailyLimit: 20 })).toEqual({ ok: false, code: "FEATURE_NOT_IN_PLAN", message: LEVEL_3_NOT_IN_PLAN });
    expect(pro.calls).toEqual([]);
  });

  it("sends no daily limit below level 3, and gives the policy what's left of today's budget", async () => {
    const { deps, calls } = fakeDeps(MAX_3X);
    await setWorkspaceAutonomy(deps, { ...input, level: 2, dailyLimit: 20 });
    expect(calls[0]).toMatchObject({ level: 2, dailyLimit: null });
    expect(limitsFrom({ ...AUTONOMY_OFF, level: 3, maxFiles: 8, allowCreates: true, dailyLimit: 10, appliedToday: 7 })).toEqual({ level: 3, maxFiles: 8, allowCreates: true, dailyLeft: 3 });
    expect(limitsFrom({ ...AUTONOMY_OFF, level: 3, maxFiles: 8, dailyLimit: 10, appliedToday: 12 })).toMatchObject({ dailyLeft: 0 });
    expect(limitsFrom({ ...AUTONOMY_OFF, level: 3, dailyLimit: 10, suspendedAt: NOW.toISOString(), suspendedReason: "x" })).toBeNull();
  });
});
