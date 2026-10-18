import { describe, expect, it } from "vitest";
import type { BillingSnapshot } from "@/core/billing/trial";
import { trialWindow } from "@/core/billing/trial";
import { invitableRoles, invitationTokenHash, isInvitationToken, newInvitationToken, normalizeInviteEmail } from "@/core/workspace/invitations";
import { acceptInvitation, createInvitation, previewInvitation, revokeInvitation, type InvitationDeps, type InvitationPreview } from "./invitations";
import type { OrgRole } from "./types";
import type { WriteDeps } from "./use-cases";

const NOW = new Date("2026-10-18T10:00:00Z");
const TRIAL: BillingSnapshot = { state: "trialing", trial: trialWindow(new Date("2026-10-14T00:00:00Z")) };

function fakeDeps(over: { role?: OrgRole | null; billing?: BillingSnapshot | null; preview?: InvitationPreview | null; rpcError?: string } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const deps: WriteDeps & InvitationDeps = {
    role: async () => (over.role === undefined ? "owner" : over.role),
    billing: async () => (over.billing === undefined ? TRIAL : over.billing),
    countActiveProjects: async () => 0,
    loadTask: async () => null,
    createProject: async () => ({ ok: true, value: "p" }),
    createTask: async () => ({ ok: true, value: "t" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    createInvitation: async (input) => (calls.push({ name: "create", input }), over.rpcError ? { ok: false, error: over.rpcError } : { ok: true, value: "inv-1" }),
    revokeInvitation: async (input) => (calls.push({ name: "revoke", input }), over.rpcError ? { ok: false, error: over.rpcError } : { ok: true, value: null }),
    invitationPreview: async (hash) => (calls.push({ name: "preview", input: hash }), over.preview === undefined ? { orgId: "o1", orgName: "Far001", role: "member", email: "bob@example.test", expiresAt: "2026-10-25T10:00:00Z", state: "open" } : over.preview),
    orgBillingAsSystem: async () => (over.billing === undefined ? TRIAL : over.billing),
    acceptInvitation: async (input) => (calls.push({ name: "accept", input }), over.rpcError ? { ok: false, error: over.rpcError } : { ok: true, value: "o1" }),
    newEventId: () => "e1",
    now: () => NOW,
  };
  return { deps, calls };
}

describe("invitation rules", () => {
  it("lets owners invite admins, admins invite members and viewers, and nobody else invite", () => {
    expect(invitableRoles("owner")).toEqual(["admin", "member", "viewer"]);
    expect(invitableRoles("admin")).toEqual(["member", "viewer"]);
    expect(invitableRoles("member")).toEqual([]);
    expect(invitableRoles(null)).toEqual([]);
  });

  it("normalizes addresses and makes unguessable tokens", async () => {
    expect(normalizeInviteEmail("  Bob@Example.TEST ")).toBe("bob@example.test");
    expect(normalizeInviteEmail("not an email")).toBeNull();
    const a = newInvitationToken();
    expect(isInvitationToken(a)).toBe(true);
    expect(a).not.toBe(newInvitationToken());
    expect(await invitationTokenHash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(isInvitationToken("short")).toBe(false);
  });
});

describe("createInvitation", () => {
  it("stores only the token's hash, with the plan's seats and a 7-day expiry, and returns the token once", async () => {
    const { deps, calls } = fakeDeps();
    const r = await createInvitation(deps, { orgId: "o1", userId: "u1", email: " Bob@example.test", role: "member" });
    expect(r).toMatchObject({ ok: true, value: { email: "bob@example.test", role: "member", expiresAt: "2026-10-25T10:00:00.000Z" } });
    const input = calls[0]!.input;
    expect(input.tokenSha256).toBe(await invitationTokenHash(r.ok ? r.value.token : ""));
    expect(input.seatLimit).toBe(3);
    expect(JSON.stringify(input)).not.toContain(r.ok ? r.value.token : "x");
  });

  it("refuses members, roles above the inviter's, bad addresses and unknown billing", async () => {
    expect(await createInvitation(fakeDeps({ role: "member" }).deps, { orgId: "o1", userId: "u1", email: "a@b.co", role: "viewer" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await createInvitation(fakeDeps({ role: "admin" }).deps, { orgId: "o1", userId: "u1", email: "a@b.co", role: "admin" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await createInvitation(fakeDeps().deps, { orgId: "o1", userId: "u1", email: "a@b.co", role: "owner" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await createInvitation(fakeDeps().deps, { orgId: "o1", userId: "u1", email: "nope", role: "member" })).toMatchObject({ ok: false, code: "INVALID_EMAIL" });
    expect(await createInvitation(fakeDeps({ billing: null }).deps, { orgId: "o1", userId: "u1", email: "a@b.co", role: "member" })).toMatchObject({ ok: false, code: "ENTITLEMENT_UNAVAILABLE" });
  });

  it("reports the database's refusals plainly", async () => {
    expect(await createInvitation(fakeDeps({ rpcError: "SEAT_LIMIT" }).deps, { orgId: "o1", userId: "u1", email: "a@b.co", role: "member" })).toMatchObject({ ok: false, code: "SEAT_LIMIT" });
    expect(await createInvitation(fakeDeps({ rpcError: "ALREADY_INVITED" }).deps, { orgId: "o1", userId: "u1", email: "a@b.co", role: "member" })).toMatchObject({ ok: false, code: "ALREADY_INVITED" });
  });
});

describe("accepting and revoking", () => {
  const token = newInvitationToken();

  it("checks the link, then accepts with the inviting workspace's seats", async () => {
    const { deps, calls } = fakeDeps();
    expect(await acceptInvitation(deps, { userId: "u2", token })).toEqual({ ok: true, value: { orgId: "o1" } });
    expect(calls.find((c) => c.name === "accept")!.input).toMatchObject({ tokenSha256: await invitationTokenHash(token), actor: "u2", seatLimit: 3 });
  });

  it("explains closed and invalid links without touching the database", async () => {
    expect(await acceptInvitation(fakeDeps({ preview: null }).deps, { userId: "u2", token })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await acceptInvitation(fakeDeps({ preview: { orgId: "o1", orgName: "Far001", role: "member", email: "x@y.z", expiresAt: "", state: "expired" } }).deps, { userId: "u2", token })).toMatchObject({
      ok: false,
      code: "INVITATION_CLOSED",
      message: expect.stringMatching(/expired/),
    });
    const { deps, calls } = fakeDeps();
    expect(await previewInvitation(deps, "../../etc")).toBeNull();
    expect(calls).toEqual([]);
  });

  it("passes on a wrong-account refusal", async () => {
    expect(await acceptInvitation(fakeDeps({ rpcError: "WRONG_ACCOUNT" }).deps, { userId: "u2", token })).toMatchObject({ ok: false, code: "WRONG_ACCOUNT" });
  });

  it("lets only owners and admins revoke", async () => {
    expect(await revokeInvitation(fakeDeps({ role: "member" }).deps, { orgId: "o1", userId: "u1", invitationId: "i1" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await revokeInvitation(fakeDeps({ role: "admin" }).deps, { orgId: "o1", userId: "u1", invitationId: "i1" })).toEqual({ ok: true, value: null });
  });
});
