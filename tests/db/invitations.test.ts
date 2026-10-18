/**
 * Migration 13: invitations. Only the token's hash is stored; an invitation
 * works once, for the invited (confirmed) email only, within its expiry and
 * the workspace's seats; only owners and admins invite and revoke.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
const CAROL = "00000000-0000-4000-8000-0000000ca201";

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const hash = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

let n = 0;
async function invite(email: string, opts: { role?: string; actor?: string; seats?: number | null; org?: string } = {}) {
  const token = `token-${++n}-${email}`;
  const rows = await q<{ id: string }>("select public.app_create_invitation($1, $2, $3, $4, $5, $6, $7) as id", [
    opts.org ?? org,
    opts.actor ?? USERS.alice,
    email,
    opts.role ?? "member",
    hash(token),
    inDays(7),
    opts.seats === undefined ? 10 : opts.seats,
  ]);
  return { id: rows[0]!.id, token };
}

const accept = (token: string, actor: string, seats: number | null = 10) =>
  q<{ org: string }>("select public.app_accept_invitation($1, $2, $3) as org", [hash(token), actor, seats]).then((r) => r[0]!.org);
const preview = (token: string) => q<{ org_name: string; role: string; email: string; state: string }>("select * from public.app_invitation_preview($1)", [hash(token)]);
const isMember = async (user: string) => (await q("select 1 from public.organization_members where org_id = $1 and user_id = $2", [org, user])).length === 1;

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'Carol@Example.test', now())", [CAROL]);
  org = await createOrg(db, USERS.alice, "Alice Studio");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("inviting and accepting", () => {
  it("lets the invited person join once, with the role they were invited with", async () => {
    const { token } = await invite("BOB@example.test ");
    expect(await preview(token)).toEqual([expect.objectContaining({ org_name: "Alice Studio", role: "member", email: "bob@example.test", state: "open" })]);
    expect(await accept(token, USERS.bob)).toBe(org);
    expect(await isMember(USERS.bob)).toBe(true);
    expect((await q<{ role: string }>("select role from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]))[0]!.role).toBe("member");
    expect((await preview(token))[0]!.state).toBe("accepted");
    await expect(accept(token, USERS.bob)).rejects.toThrow(/INVITATION_CLOSED/);
    expect(await q("select 1 from public.audit_events where action = 'invitation.accepted' and org_id = $1", [org])).toHaveLength(1);
  });

  it("works only for the invited, confirmed email", async () => {
    const { token } = await invite("carol@example.test");
    await expect(accept(token, USERS.unverified)).rejects.toThrow(/WRONG_ACCOUNT/);
    // Email matching ignores case.
    expect(await accept(token, CAROL)).toBe(org);
    const other = await invite("new@example.test");
    // The address exists but isn't confirmed.
    await expect(accept(other.token, USERS.unverified)).rejects.toThrow(/WRONG_ACCOUNT/);
    await expect(accept("not-a-real-token", USERS.unverified)).rejects.toThrow(/NOT_FOUND/);
  });

  it("refuses people who are already in, and a second open invitation for the same person", async () => {
    await expect(invite("bob@example.test")).rejects.toThrow(/ALREADY_MEMBER/);
    await expect(invite("new@example.test")).rejects.toThrow(/ALREADY_INVITED/);
  });

  it("counts open invitations as seats, and checks seats again on accept", async () => {
    // Alice, Bob and Carol are members, and new@example.test holds an invitation: 4 seats in use.
    await expect(invite("dana@example.test", { seats: 4 })).rejects.toThrow(/SEAT_LIMIT/);
    const { token } = await invite("erin@example.test", { seats: 5 });
    expect((await preview(token))[0]!.state).toBe("open");
    // The plan shrank after the invitation was sent.
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-4000-8000-00000000e417', 'erin@example.test', now())");
    await expect(accept(token, "00000000-0000-4000-8000-00000000e417", 3)).rejects.toThrow(/SEAT_LIMIT/);
    expect(await accept(token, "00000000-0000-4000-8000-00000000e417", 5)).toBe(org);
  });

  it("closes expired invitations and lets a new one be sent", async () => {
    const { id, token } = await invite("fay@example.test");
    await q("update public.organization_invitations set created_at = now() - interval '10 days', expires_at = now() - interval '1 day' where id = $1", [id]);
    expect((await preview(token))[0]!.state).toBe("expired");
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-4000-8000-000000000fa1', 'fay@example.test', now())");
    await expect(accept(token, "00000000-0000-4000-8000-000000000fa1")).rejects.toThrow(/INVITATION_CLOSED/);
    const again = await invite("fay@example.test");
    expect((await preview(again.token))[0]!.state).toBe("open");
    expect((await preview(token))[0]!.state).toBe("revoked");
  });
});

describe("who may invite", () => {
  it("lets owners and admins invite and revoke, and never invites an owner", async () => {
    await q("update public.organization_members set role = 'admin' where org_id = $1 and user_id = $2", [org, CAROL]);
    // Bob is a member: can't invite. Carol is an admin: can invite members, not admins.
    await expect(invite("gil@example.test", { actor: USERS.bob })).rejects.toThrow(/FORBIDDEN/);
    await expect(invite("gil@example.test", { actor: CAROL, role: "admin" })).rejects.toThrow(/FORBIDDEN/);
    await expect(invite("gil@example.test", { role: "owner" })).rejects.toThrow(/FORBIDDEN/);
    const { id, token } = await invite("gil@example.test", { actor: CAROL, role: "viewer" });
    await expect(q("select public.app_revoke_invitation($1, $2)", [id, USERS.bob])).rejects.toThrow(/FORBIDDEN/);
    await q("select public.app_revoke_invitation($1, $2)", [id, USERS.alice]);
    expect((await preview(token))[0]!.state).toBe("revoked");
    await expect(q("select public.app_revoke_invitation($1, $2)", [id, USERS.alice])).rejects.toThrow(/INVITATION_CLOSED/);
    // An owner may invite an admin.
    await invite("hal@example.test", { role: "admin", seats: null });
  });
});

describe("privacy", () => {
  it("shows invitations to owners and admins only, never the token hash, and only the server writes", async () => {
    const read = (uid: string, sql: string) => as(db, "authenticated", uid, async () => (await db.query(sql)).rows);
    expect((await read(USERS.alice, "select email, role from public.organization_invitations")).length).toBeGreaterThan(0);
    expect(await read(USERS.bob, "select email from public.organization_invitations")).toEqual([]);
    await expect(read(USERS.alice, "select token_sha256 from public.organization_invitations")).rejects.toThrow(/permission denied/);
    await expect(read(USERS.alice, "select public.app_invitation_preview('x')")).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("insert into public.organization_invitations (org_id, email, role, token_sha256, invited_by, expires_at) values ($1, 'x@y.z', 'member', $2, $3, now() + interval '1 day')", [org, "a".repeat(64), USERS.alice]))).rejects.toThrow(/permission denied/);
  });
});
