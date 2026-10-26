import { describe, expect, it } from "vitest";
import type { BillingSnapshot } from "@/core/billing/trial";
import type { Permission, WithheldPermissions } from "@/core/workspace/permissions";
import { PERMISSIONS_NOT_IN_PLAN, setMemberPermissions } from "./member-permissions";
import type { OrgRole } from "./types";

const NOW = new Date("2026-10-26T10:00:00Z");
const ALL_ON: Record<Permission, boolean> = { approve: true, publish: true, run_agents: true };
const MAX: BillingSnapshot = { state: "active", paidPlanId: "max" };

function fakes(over: { role?: OrgRole | null; target?: { role: OrgRole; permissions: WithheldPermissions } | null; billing?: BillingSnapshot | null; error?: string } = {}) {
  const saved: unknown[] = [];
  return {
    saved,
    deps: {
      role: async () => (over.role === undefined ? "admin" : over.role),
      billing: async () => (over.billing === undefined ? MAX : over.billing),
      now: () => NOW,
      member: async () => (over.target === undefined ? { role: "member" as const, permissions: {} } : over.target),
      setPermissions: async (i: unknown) => {
        saved.push(i);
        return over.error ? { ok: false as const, error: over.error } : { ok: true as const, value: null };
      },
    },
  };
}

const set = (f: ReturnType<typeof fakes>, permissions: Record<Permission, boolean>) =>
  setMemberPermissions(f.deps, { orgId: "o1", userId: "u-admin", memberId: "u-member", permissions });

describe("setMemberPermissions", () => {
  it("lets an owner or admin turn a member's permissions off on a plan that includes it", async () => {
    const f = fakes();
    expect(await set(f, { ...ALL_ON, publish: false })).toEqual({ ok: true, value: null });
    expect(f.saved).toEqual([{ orgId: "o1", actor: "u-admin", userId: "u-member", permissions: { approve: true, publish: false, run_agents: true } }]);
  });

  it("is for owners and admins, and only for members", async () => {
    expect(await set(fakes({ role: "member" }), ALL_ON)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await set(fakes({ role: null }), ALL_ON)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await set(fakes({ target: null }), ALL_ON)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await set(fakes({ target: { role: "viewer", permissions: {} } }), ALL_ON)).toMatchObject({ ok: false, code: "INVALID_PERMISSIONS" });
  });

  it("needs the plan to turn one off, but never to turn one back on", async () => {
    const free = fakes({ billing: { state: "free" } });
    expect(await set(free, { ...ALL_ON, approve: false })).toMatchObject({ ok: false, code: "FEATURE_NOT_IN_PLAN", message: PERMISSIONS_NOT_IN_PLAN });
    expect(free.saved).toEqual([]);
    const lapsed = fakes({ billing: { state: "free" }, target: { role: "member", permissions: { approve: false, publish: false } } });
    // Keeping one off that already was, and turning another back on, adds nothing new.
    expect(await set(lapsed, { ...ALL_ON, approve: false })).toEqual({ ok: true, value: null });
    expect(await set(lapsed, { ...ALL_ON, run_agents: false })).toMatchObject({ ok: false, code: "FEATURE_NOT_IN_PLAN" });
  });

  it("explains what the database refused", async () => {
    expect(await set(fakes({ error: "FORBIDDEN" }), ALL_ON)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await set(fakes({ error: "INVALID_PERMISSIONS" }), ALL_ON)).toMatchObject({ ok: false, code: "INVALID_PERMISSIONS" });
  });
});
