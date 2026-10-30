/**
 * Migration v76: a workspace's own model key (ADR 0125). Only owners and
 * admins set or remove it, each change is audited without the key, members
 * see which key is set but never its sealed value, and only the server logs
 * own-key usage.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const SEALED = `v1.k1.${"A".repeat(60)}`;
const setKey = (actor: string, base: string | null = null, orgId = org) => q("select public.app_set_model_key($1, $2, 'anthropic', $3, 'abcd', $4)", [orgId, actor, SEALED, base]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  otherOrg = await createOrg(db, USERS.bob, "Bob Labs");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("setting and removing the key", () => {
  it("lets an owner set and replace it, recording each change without the key", async () => {
    await setKey(USERS.alice);
    await setKey(USERS.alice, "https://gw.example.com/anthropic");
    const rows = await admin<{ base_url: string | null; key_hint: string }>("select base_url, key_hint from public.workspace_model_keys where org_id = $1", [org]);
    expect(rows).toEqual([{ base_url: "https://gw.example.com/anthropic", key_hint: "abcd" }]);
    const events = await admin<{ metadata: Record<string, unknown> }>("select metadata from public.audit_events where org_id = $1 and action = 'workspace.model_key_set' order by id", [org]);
    expect(events.map((e) => e.metadata)).toEqual([
      { provider: "anthropic", key_ends: "abcd", gateway: null },
      { provider: "anthropic", key_ends: "abcd", gateway: "gw.example.com" },
    ]);
    expect(JSON.stringify(events)).not.toContain(SEALED);
  });

  it("refuses members, viewers and other workspaces", async () => {
    await expect(setKey(USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    for (const role of ["member", "viewer"]) {
      await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, $3) on conflict (org_id, user_id) do update set role = excluded.role", [org, USERS.bob, role]);
      await expect(setKey(USERS.bob)).rejects.toThrow(/FORBIDDEN/);
      await expect(q("select public.app_remove_model_key($1, $2)", [org, USERS.bob])).rejects.toThrow(/FORBIDDEN/);
    }
    await admin("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });

  it("keeps only https gateways and short hints in the table itself", async () => {
    await expect(setKey(USERS.alice, "http://gw.example.com")).rejects.toThrow(/workspace_model_keys_base_url_check/);
    await expect(q("select public.app_set_model_key($1, $2, 'anthropic', $3, 'too-long-hint', null)", [org, USERS.alice, SEALED])).rejects.toThrow(/key_hint/);
    await expect(q("select public.app_set_model_key($1, $2, 'anthropic', 'sk-ant-plain-key', 'abcd', null)", [org, USERS.alice])).rejects.toThrow(/key_sealed/);
  });

  it("removes it, records that, and says when there's nothing to remove", async () => {
    await setKey(USERS.bob, null, otherOrg);
    await q("select public.app_remove_model_key($1, $2)", [otherOrg, USERS.bob]);
    expect(await admin("select 1 from public.workspace_model_keys where org_id = $1", [otherOrg])).toEqual([]);
    expect(await admin("select 1 from public.audit_events where org_id = $1 and action = 'workspace.model_key_removed'", [otherOrg])).toHaveLength(1);
    await expect(q("select public.app_remove_model_key($1, $2)", [otherOrg, USERS.bob])).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("own-key usage", () => {
  it("logs a call and marks the key used, only while a key is set", async () => {
    await q("select public.app_record_model_key_usage($1, $2, null, 'agent_step', 'claude-sonnet-5-5', 1000, 200, 5000, 0)", [org, USERS.alice]);
    expect(await admin("select operation, input_tokens, output_tokens, cache_read_tokens from public.model_key_usage where org_id = $1", [org])).toEqual([
      { operation: "agent_step", input_tokens: 1000, output_tokens: 200, cache_read_tokens: 5000 },
    ]);
    expect((await admin<{ last_used_at: string | null }>("select last_used_at from public.workspace_model_keys where org_id = $1", [org]))[0]!.last_used_at).not.toBeNull();
    await expect(q("select public.app_record_model_key_usage($1, $2, null, 'agent_step', 'm', 1, 1, 0, 0)", [otherOrg, USERS.bob])).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("who can see and change it", () => {
  it("shows members which key is set but never the sealed value, and lets only the server write", async () => {
    const asAlice = <T>(fn: () => Promise<T>) => as(db, "authenticated", USERS.alice, fn);
    expect((await asAlice(async () => (await db.query("select key_hint, base_url from public.workspace_model_keys where org_id = $1", [org])).rows))).toEqual([{ key_hint: "abcd", base_url: "https://gw.example.com/anthropic" }]);
    await expect(asAlice(() => db.query("select key_sealed from public.workspace_model_keys"))).rejects.toThrow(/permission denied/);
    await expect(asAlice(() => db.query("update public.workspace_model_keys set key_hint = 'zzzz'"))).rejects.toThrow(/permission denied/);
    await expect(asAlice(() => db.query("select public.app_set_model_key($1, $2, 'anthropic', $3, 'abcd', null)", [org, USERS.alice, SEALED]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select public.app_record_model_key_usage($1, $2, null, 'x', 'm', 1, 1, 0, 0)", [org, USERS.alice]))).rejects.toThrow(/permission denied/);
    expect((await asAlice(async () => (await db.query("select operation from public.model_key_usage where org_id = $1", [org])).rows))).toHaveLength(1);
    // Bob isn't in Alice's workspace and sees none of it.
    expect((await as(db, "authenticated", USERS.bob, async () => (await db.query("select key_hint from public.workspace_model_keys where org_id = $1", [org])).rows))).toEqual([]);
  });
});
