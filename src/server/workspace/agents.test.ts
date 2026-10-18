import { describe, expect, it } from "vitest";
import { normalizePairingCode, sha256 } from "@/server/agent/tokens";
import { createAgentPairing, revokeAgent, type AgentAdminDeps } from "./agents";
import type { OrgRole } from "./types";
import type { WriteDeps } from "./use-cases";

function deps(role: OrgRole | null, over: Partial<AgentAdminDeps> = {}) {
  const calls: unknown[] = [];
  const d = {
    role: async () => role,
    billing: async () => ({ state: "free" as const }),
    now: () => new Date("2026-10-18T12:00:00Z"),
    createAgentPairing: async (i: unknown) => {
      calls.push(i);
      return { ok: true as const, value: "pairing-1" };
    },
    revokeAgent: async (i: unknown) => {
      calls.push(i);
      return { ok: true as const, value: null };
    },
    ...over,
  } as unknown as WriteDeps & AgentAdminDeps;
  return { d, calls };
}

describe("pairing from the web app", () => {
  it("creates a 10-minute code for a contributor and stores only its hash", async () => {
    const { d, calls } = deps("member");
    const r = await createAgentPairing(d, { orgId: "o1", userId: "u1" });
    expect(r).toMatchObject({ ok: true, value: { expiresAt: "2026-10-18T12:10:00.000Z" } });
    if (!r.ok) return;
    expect(r.value.code).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
    expect(calls[0]).toEqual({ orgId: "o1", actor: "u1", codeSha256: sha256(normalizePairingCode(r.value.code)!), expiresAt: "2026-10-18T12:10:00.000Z", agentLimit: 1 });
  });

  it("refuses viewers and non-members, and reports the plan's agent limit", async () => {
    expect(await createAgentPairing(deps("viewer").d, { orgId: "o1", userId: "u1" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await createAgentPairing(deps(null).d, { orgId: "o1", userId: "u1" })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    const full = deps("owner", { createAgentPairing: async () => ({ ok: false, error: "AGENT_LIMIT" }) });
    expect(await createAgentPairing(full.d, { orgId: "o1", userId: "u1" })).toMatchObject({ ok: false, code: "AGENT_LIMIT", message: expect.stringMatching(/Every agent on this plan/) });
  });

  it("revokes through the database, which decides who may", async () => {
    const { d, calls } = deps("member");
    expect(await revokeAgent(d, { orgId: "o1", userId: "u1", agentId: "a1" })).toEqual({ ok: true, value: null });
    expect(calls[0]).toEqual({ agentId: "a1", actor: "u1" });
    const other = deps("member", { revokeAgent: async () => ({ ok: false, error: "FORBIDDEN" }) });
    expect(await revokeAgent(other.d, { orgId: "o1", userId: "u1", agentId: "a1" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});
