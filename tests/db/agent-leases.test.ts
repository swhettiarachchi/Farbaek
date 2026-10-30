/**
 * Migration v74: permission leases for paired agents (ADR 0117). Every agent
 * holds a lease that ends; the pairer, owners and admins set it within the
 * limits; each change is one audit event; the session returns it so the
 * server can check it; browsers can read it but never write it.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;
let project: string;
let otherProject: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const DAY = 86_400_000;

let n = 0;
async function pairedAgent(actor: string = USERS.alice): Promise<{ id: string; token: string }> {
  const code = `LEASE-${++n}`;
  const token = `fa_lease_${n}`;
  await q("select public.app_create_agent_pairing($1, $2, $3, $4, null)", [org, actor, sha(code), new Date(Date.now() + 600_000).toISOString()]);
  const rows = await q<{ agent_id: string }>("select * from public.app_redeem_agent_pairing($1, $2, 'Office PC', 'windows', '0.1.0', null)", [sha(code), sha(token)]);
  return { id: rows[0]!.agent_id, token };
}

type Session = { agent_id: string; lease_expires_at: string | Date; lease_projects: string[] | null; lease_capabilities: string[]; lease_actions_per_hour: number };
const session = async (token: string) => (await q<Session>("select * from public.app_agent_session($1)", [sha(token)]))[0];

const setLease = (agent: string, actor: string, days: number | null, projects: string[] | null, capabilities: string[] | null, perHour: number | null) =>
  q<{ ends: string | Date }>("select public.app_agent_lease_set($1, $2, $3, $4, $5, $6) as ends", [agent, actor, days, projects, capabilities, perHour]);

const leaseEvents = async (agent: string) => q<{ actor_id: string; metadata: Record<string, unknown> }>("select actor_id, metadata from public.audit_events where action = 'agent.lease_set' and target = $1", [agent]);

const daysFromNow = (t: string | Date) => (new Date(t).getTime() - Date.now()) / DAY;

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  otherOrg = await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
  otherProject = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Bob site', null, null) as id", [otherOrg, USERS.bob]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("a new agent's lease", () => {
  it("lasts 90 days, on every project, with everything an agent can do and 600 requests an hour", async () => {
    const agent = await pairedAgent();
    const s = await session(agent.token);
    expect(daysFromNow(s!.lease_expires_at)).toBeGreaterThan(89.9);
    expect(daysFromNow(s!.lease_expires_at)).toBeLessThanOrEqual(90);
    expect(s).toMatchObject({ agent_id: agent.id, lease_projects: null, lease_capabilities: ["read", "propose", "model", "mesh"], lease_actions_per_hour: 600 });
  });
});

describe("setting a lease", () => {
  it("lets the pairer narrow it, returns when it ends and records one audit event", async () => {
    const agent = await pairedAgent();
    const [r] = await setLease(agent.id, USERS.alice, 30, [project, project], ["propose", "read", "read"], 120);
    expect(Math.round(daysFromNow(r!.ends))).toBe(30);
    expect(await session(agent.token)).toMatchObject({ lease_projects: [project], lease_capabilities: ["propose", "read"], lease_actions_per_hour: 120 });
    const events = await leaseEvents(agent.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor_id: USERS.alice, metadata: { name: "Office PC", projects: 1, all_projects: false, actions_per_hour: 120 } });
    const stored = await admin<{ lease_set_by: string; lease_set_at: string | null }>("select lease_set_by, lease_set_at from public.agents where id = $1", [agent.id]);
    expect(stored[0]!.lease_set_by).toBe(USERS.alice);
    expect(stored[0]!.lease_set_at).not.toBeNull();
  });

  it("widens it back to every project", async () => {
    const agent = await pairedAgent();
    await setLease(agent.id, USERS.alice, 7, [project], ["read"], 10);
    await setLease(agent.id, USERS.alice, 90, null, ["read", "propose", "model", "mesh"], 5000);
    expect(await session(agent.token)).toMatchObject({ lease_projects: null, lease_capabilities: ["mesh", "model", "propose", "read"], lease_actions_per_hour: 5000 });
    expect(await leaseEvents(agent.id)).toHaveLength(2);
  });

  it("lets owners and admins set it, but not other members or other workspaces", async () => {
    const agent = await pairedAgent();
    // Bob is outside Alice's workspace.
    await expect(setLease(agent.id, USERS.bob, 30, null, ["read"], 100)).rejects.toThrow(/FORBIDDEN/);
    // As a member who didn't pair it, still no.
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
    await expect(setLease(agent.id, USERS.bob, 30, null, ["read"], 100)).rejects.toThrow(/FORBIDDEN/);
    // As an admin, yes.
    await admin("update public.organization_members set role = 'admin' where org_id = $1 and user_id = $2", [org, USERS.bob]);
    await setLease(agent.id, USERS.bob, 30, null, ["read"], 100);
    expect((await leaseEvents(agent.id)).map((e) => e.actor_id)).toEqual([USERS.bob]);
    await admin("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });

  it("refuses leases outside the limits and records nothing", async () => {
    const agent = await pairedAgent();
    const tooMany = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    for (const [days, projects, caps, perHour] of [
      [0, null, ["read"], 100],
      [91, null, ["read"], 100],
      [null, null, ["read"], 100],
      [30, null, [], 100],
      [30, null, ["read", "delete"], 100],
      [30, null, null, 100],
      [30, null, ["read"], 9],
      [30, null, ["read"], 5001],
      [30, [otherProject], ["read"], 100],
      [30, [], ["read"], 100],
      [30, tooMany, ["read"], 100],
    ] as const) {
      await expect(setLease(agent.id, USERS.alice, days, projects as string[] | null, caps as string[] | null, perHour)).rejects.toThrow(/INVALID_LEASE/);
    }
    expect(await leaseEvents(agent.id)).toEqual([]);
    expect(await session(agent.token)).toMatchObject({ lease_projects: null, lease_actions_per_hour: 600 });
  });

  it("refuses a revoked agent and one that doesn't exist", async () => {
    const agent = await pairedAgent();
    await q("select public.app_revoke_agent($1, $2)", [agent.id, USERS.alice]);
    await expect(setLease(agent.id, USERS.alice, 30, null, ["read"], 100)).rejects.toThrow(/AGENT_REVOKED/);
    await expect(setLease("00000000-0000-4000-8000-0000000000ff", USERS.alice, 30, null, ["read"], 100)).rejects.toThrow(/NOT_FOUND/);
  });

  it("keeps the limits in the table too", async () => {
    const agent = await pairedAgent();
    await expect(admin("update public.agents set lease_capabilities = array['admin'] where id = $1", [agent.id])).rejects.toThrow(/agents_lease_capabilities/);
    await expect(admin("update public.agents set lease_actions_per_hour = 1 where id = $1", [agent.id])).rejects.toThrow(/agents_lease_actions/);
    await expect(admin("update public.agents set lease_projects = '{}'::uuid[] where id = $1", [agent.id])).rejects.toThrow(/agents_lease_projects/);
    await expect(admin("update public.agents set lease_expires_at = null where id = $1", [agent.id])).rejects.toThrow(/null/);
  });
});

describe("who can see and change a lease", () => {
  it("lets members read it, and only the server key set it", async () => {
    const agent = await pairedAgent();
    const asAlice = <T>(fn: () => Promise<T>) => as(db, "authenticated", USERS.alice, fn);
    const rows = await asAlice(async () => (await db.query<{ lease_actions_per_hour: number }>("select lease_expires_at, lease_projects, lease_capabilities, lease_actions_per_hour, lease_set_at from public.agents where id = $1", [agent.id])).rows);
    expect(rows).toEqual([expect.objectContaining({ lease_actions_per_hour: 600 })]);
    await expect(asAlice(() => db.query("select lease_set_by from public.agents"))).rejects.toThrow(/permission denied/);
    await expect(asAlice(() => db.query("update public.agents set lease_expires_at = now() + interval '900 days' where id = $1", [agent.id]))).rejects.toThrow(/permission denied/);
    await expect(asAlice(() => db.query("select public.app_agent_lease_set($1, $2, 30, null, array['read'], 100)", [agent.id, USERS.alice]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select public.app_agent_lease_set($1, $2, 30, null, array['read'], 100)", [agent.id, USERS.alice]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select public.app_agent_session('x')"))).rejects.toThrow(/permission denied/);
  });
});
