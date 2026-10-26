/**
 * Migration v60: Mesh's secure relay (ADR 0094). Only the server records
 * which agents are reachable, the day's relayed bytes against the
 * workspace's allowance, and one audit event per session; members can read
 * the first two, and no browser writes any of it.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let other: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const asUser = <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) => as(db, "authenticated", uid, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
let n = 0;

async function agent(orgId: string, actor: string, name: string): Promise<string> {
  const code = `RELAY-${++n}`;
  await q("select public.app_create_agent_pairing($1, $2, $3, $4, null)", [orgId, actor, sha(code), new Date(Date.now() + 10 * 60_000).toISOString()]);
  const rows = await q<{ agent_id: string }>("select * from public.app_redeem_agent_pairing($1, $2, $3, 'windows', '0.3.0', null)", [sha(code), sha(`token-${n}`), name]);
  return rows[0]!.agent_id;
}
const setRelay = (id: string, fp: string | null, on: boolean) => q("select public.app_agent_set_mesh_relay($1, $2, $3)", [id, fp, on]);
const use = (orgId: string, bytes: number, cap: number) => q<{ ok: boolean }>("select public.app_mesh_relay_use($1, $2, $3) as ok", [orgId, bytes, cap]).then((r) => r[0]!.ok);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  other = await createOrg(db, USERS.bob, "Bob Labs");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("Mesh's secure relay", () => {
  it("records which agents are reachable, audits each change, and shows members but not strangers", async () => {
    const laptop = await agent(org, USERS.alice, "Laptop");
    await setRelay(laptop, "0123456789abcdef", true);
    await setRelay(laptop, "0123456789abcdef", true);
    expect((await admin<{ mesh_fingerprint: string; on: boolean }>("select mesh_fingerprint, mesh_reachable_at is not null as on from public.agents where id = $1", [laptop]))[0]).toEqual({ mesh_fingerprint: "0123456789abcdef", on: true });
    expect((await asUser(USERS.alice, "select mesh_fingerprint from public.agents where id = $1", [laptop])).length).toBe(1);
    expect(await asUser(USERS.bob, "select mesh_fingerprint from public.agents where id = $1", [laptop])).toEqual([]);
    await setRelay(laptop, null, false);
    const actions = (await admin<{ action: string }>("select action from public.audit_events where target = $1 and action like 'mesh.%' order by id", [laptop])).map((r) => r.action);
    // The repeated "on" with the same fingerprint isn't a change.
    expect(actions).toEqual(["mesh.relay_reachable", "mesh.relay_unreachable"]);
    await expect(setRelay(laptop, "not-hex", true)).rejects.toThrow(/INVALID_REQUEST/);
    await expect(asUser(USERS.alice, "update public.agents set mesh_reachable_at = now() where id = $1", [laptop])).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, "select public.app_agent_set_mesh_relay($1, '0123456789abcdef', true)", [laptop])).rejects.toThrow(/permission denied/);
  });

  it("counts relayed bytes per workspace and day, and refuses past the cap", async () => {
    expect(await use(org, 600, 1_000)).toBe(true);
    expect(await use(org, 400, 1_000)).toBe(true);
    expect(await use(org, 1, 1_000)).toBe(false);
    // Another workspace has its own day.
    expect(await use(other, 900, 1_000)).toBe(true);
    expect(await asUser<{ bytes: number }>(USERS.alice, "select bytes from public.mesh_relay_days")).toEqual([{ bytes: 1001 }]);
    await expect(asUser(USERS.alice, "insert into public.mesh_relay_days (org_id, day, bytes) values ($1, current_date, 0)", [org])).rejects.toThrow(/permission denied/);
    await expect(use(org, -1, 1_000)).rejects.toThrow(/INVALID_REQUEST/);
  });

  it("records one audit event per session, between agents of the same workspace, with no file details", async () => {
    const a = await agent(org, USERS.alice, "Desk");
    const b = await agent(org, USERS.alice, "Home");
    await q("select public.app_mesh_relay_session_ended($1, $2, $3, 4096, 'done')", [org, a, b]);
    const [event] = await admin<{ action: string; actor_id: string; metadata: Record<string, unknown> }>("select action, actor_id, metadata from public.audit_events where action = 'mesh.relay_session' order by id desc limit 1");
    expect(event).toEqual({ action: "mesh.relay_session", actor_id: USERS.alice, metadata: { caller: a, callee: b, bytes: 4096, ended: "done" } });
    const stranger = await agent(other, USERS.bob, "Elsewhere");
    await expect(q("select public.app_mesh_relay_session_ended($1, $2, $3, 1, 'done')", [org, a, stranger])).rejects.toThrow(/NOT_FOUND/);
    await expect(q("select public.app_mesh_relay_session_ended($1, $2, $3, 1, 'whatever')", [org, a, b])).rejects.toThrow(/INVALID_REQUEST/);
    await expect(asUser(USERS.alice, "select public.app_mesh_relay_use($1, 1, 10)", [org])).rejects.toThrow(/permission denied/);
  });
});
