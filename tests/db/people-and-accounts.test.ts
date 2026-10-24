/**
 * Migration v37 (ADR 0064): roles, removing people and leaving, deleting an
 * account, and one free trial per email address.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
const CAROL = "00000000-0000-4000-8000-00000000ca01";
const DAN = "00000000-0000-4000-8000-00000000da01";

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const asUser = async <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) => as(db, "authenticated", uid, async () => (await db.query<T>(sql, params)).rows);
const roleOf = (org: string, user: string) => q<{ role: string }>("select role from public.organization_members where org_id = $1 and user_id = $2", [org, user]).then((r) => r[0]?.role ?? null);
const setRole = (org: string, actor: string, user: string, role: string) => q("select public.app_set_member_role($1, $2, $3, $4)", [org, actor, user, role]);
const remove = (org: string, actor: string, user: string) => q("select public.app_remove_member($1, $2, $3)", [org, actor, user]);
const join = (org: string, user: string, role: string) => q("insert into public.organization_members (org_id, user_id, role) values ($1, $2, $3)", [org, user, role]);
const billing = (org: string) => q<{ state: string }>("select state from public.billing_accounts where org_id = $1", [org]).then((r) => r[0]!.state);

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'carol@example.test', now()), ($2, 'dan@example.test', now())", [CAROL, DAN]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("one free trial per email address", () => {
  it("treats case, +tags and Gmail's dots as the same mailbox", async () => {
    const n = (e: string) => db.query<{ n: string }>("select private.normalized_email($1) as n", [e]).then((r) => r.rows[0]!.n);
    expect(await n(" First.Last+test@GoogleMail.com ")).toBe("firstlast@gmail.com");
    expect(await n("first.last+x@example.com")).toBe("first.last@example.com");
  });

  it("doesn't start a second trial after the account is deleted and made again", async () => {
    const first = await createOrg(db, CAROL, "Carol Studio");
    expect(await billing(first)).toBe("trialing");
    await q("select public.app_delete_account_data($1)", [CAROL]);
    await db.query("delete from auth.users where id = $1", [CAROL]);
    expect(await q("select 1 from public.organizations where id = $1", [first])).toEqual([]);

    const again = "00000000-0000-4000-8000-00000000ca02";
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'Carol+again@Example.test', now())", [again]);
    const second = await createOrg(db, again, "Carol Again");
    expect(await billing(second)).toBe("free");
    expect(await q("select metadata from public.audit_events where org_id = $1 and action = 'organization.created'", [second])).toEqual([{ metadata: { trial_started: false } }]);
  });
});

describe("roles", () => {
  let org: string;
  beforeAll(async () => {
    org = await createOrg(db, USERS.alice, "Alice Studio");
    await join(org, USERS.bob, "member");
    await join(org, DAN, "viewer");
  });

  it("are set by owners, and by admins only between member and viewer", async () => {
    await setRole(org, USERS.alice, USERS.bob, "admin");
    expect(await roleOf(org, USERS.bob)).toBe("admin");
    await setRole(org, USERS.bob, DAN, "member");
    expect(await roleOf(org, DAN)).toBe("member");
    await expect(setRole(org, USERS.bob, DAN, "admin")).rejects.toThrow(/FORBIDDEN/);
    await expect(setRole(org, USERS.bob, USERS.alice, "member")).rejects.toThrow(/FORBIDDEN/);
    await expect(setRole(org, DAN, DAN, "admin")).rejects.toThrow(/FORBIDDEN/);
    const audit = await q<{ metadata: unknown }>("select metadata from public.audit_events where org_id = $1 and action = 'member.role_changed' order by id", [org]);
    expect(audit[0]!.metadata).toEqual({ from: "member", to: "admin" });
  });

  it("always leave the workspace an owner", async () => {
    await expect(setRole(org, USERS.alice, USERS.alice, "admin")).rejects.toThrow(/LAST_OWNER/);
    await setRole(org, USERS.alice, USERS.bob, "owner");
    await setRole(org, USERS.alice, USERS.alice, "admin");
    expect([await roleOf(org, USERS.alice), await roleOf(org, USERS.bob)]).toEqual(["admin", "owner"]);
    await setRole(org, USERS.bob, USERS.alice, "owner");
  });
});

describe("removing people and leaving", () => {
  let org: string;
  beforeAll(async () => {
    org = (await q<{ id: string }>("select org_id as id from public.organization_members where user_id = $1 and role = 'owner' order by org_id limit 1", [USERS.alice]))[0]!.id;
  });

  it("lets owners remove people, members leave, and nobody else remove anyone", async () => {
    // Bob is an owner here now; make him an admin and Dan a member.
    await setRole(org, USERS.alice, USERS.bob, "admin");
    await expect(remove(org, DAN, USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    await expect(remove(org, USERS.bob, USERS.alice)).rejects.toThrow(/FORBIDDEN/);
    await q("insert into public.organization_invitations (org_id, email, role, token_sha256, invited_by, expires_at, accepted_at, accepted_by) values ($1, 'dan@example.test', 'member', $2, $3, now() + interval '1 day', now(), $4)", [org, "d".repeat(64), USERS.alice, DAN]);
    await remove(org, DAN, DAN);
    expect(await roleOf(org, DAN)).toBeNull();
    expect(await q("select 1 from public.organization_invitations where org_id = $1 and accepted_by = $2", [org, DAN])).toEqual([]);
    await remove(org, USERS.alice, USERS.bob);
    expect(await roleOf(org, USERS.bob)).toBeNull();
    const actions = await q<{ action: string }>("select action from public.audit_events where org_id = $1 and action like 'member.%' order by id", [org]);
    expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(["member.left", "member.removed"]));
  });

  it("never lets the last owner leave", async () => {
    await expect(remove(org, USERS.alice, USERS.alice)).rejects.toThrow(/LAST_OWNER/);
  });
});

describe("deleting an account", () => {
  it("says what happens to each workspace, and stops when a team would lose its last owner or a plan is paid", async () => {
    const solo = await createOrg(db, DAN, "Dan Solo");
    const team = await createOrg(db, DAN, "Dan Team");
    await join(team, USERS.bob, "member");
    const bobs = await createOrg(db, USERS.bob, "Bob Labs");
    await join(bobs, DAN, "member");

    const plan = await q<{ org_name: string; outcome: string }>("select org_name, outcome from public.app_account_deletion_plan($1)", [DAN]);
    expect(plan).toEqual([
      { org_name: "Bob Labs", outcome: "left" },
      { org_name: "Dan Solo", outcome: "deleted" },
      { org_name: "Dan Team", outcome: "blocked_last_owner" },
    ]);
    await expect(q("select public.app_delete_account_data($1)", [DAN])).rejects.toThrow(/ACCOUNT_DELETION_BLOCKED/);

    await q("update public.billing_accounts set state = 'active', paid_plan_id = 'pro' where org_id = $1", [solo]);
    expect((await q<{ outcome: string }>("select outcome from public.app_account_deletion_plan($1) where org_id = $2", [DAN, solo]))[0]!.outcome).toBe("blocked_paid");
    await q("update public.billing_accounts set state = 'free', paid_plan_id = null where org_id = $1", [solo]);

    await setRole(team, DAN, USERS.bob, "owner");
    expect(await q("select public.app_delete_account_data($1) as r", [DAN])).toEqual([{ r: { deleted_workspaces: 1, left_workspaces: 2 } }]);
    expect(await q("select 1 from public.organizations where id = $1", [solo])).toEqual([]);
    expect(await roleOf(team, DAN)).toBeNull();
    expect(await roleOf(bobs, DAN)).toBeNull();
    expect((await q<{ action: string }>("select action from public.audit_events where org_id = $1 and target = $2 order by id desc limit 1", [bobs, DAN]))[0]!.action).toBe("member.account_deleted");
  });

  it("is done by the server only", async () => {
    for (const sql of ["select public.app_delete_account_data($1)", "select * from public.app_account_deletion_plan($1)", "select public.app_remove_member(gen_random_uuid(), $1, $1)"]) {
      await expect(asUser(USERS.bob, sql, [USERS.bob])).rejects.toThrow(/permission denied/);
    }
    await expect(asUser(USERS.bob, "select * from public.trial_claims")).rejects.toThrow(/permission denied/);
  });
});
