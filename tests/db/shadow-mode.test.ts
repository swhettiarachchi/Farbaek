/**
 * Migration v46: shadow mode (ADR 0075). Owners and admins can rehearse
 * level 2 at level 0; a proposal keeps its rehearsal only while the
 * workspace rehearses, and never loses the proposal over it.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `e-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;
const setAutonomy = (actor: string, level: number, shadow: boolean) => q("select public.app_set_autonomy($1, $2, $3, 3, false, $4)", [org, actor, level, shadow]);
const shadowSince = async () => (await admin<{ shadow_since: string | null }>("select shadow_since from public.org_autonomy where org_id = $1", [org]))[0]?.shadow_since ?? null;

async function approvedTask(title: string): Promise<string> {
  const id = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]))[0]!.id;
  const body = JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 });
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [id, USERS.alice, body, H("c"), JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")])]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [id, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  return id;
}

const SHADOW = { outcome: "ALLOW_WITHIN_LIMITS", reasons: [], detail: "Level 2 would have applied this on its own.", maxFiles: 3, allowCreates: false };

async function propose(task: string, policy: Record<string, unknown>) {
  const base = (await admin<{ revision: number }>("select revision from public.project_files where project_id = $1 and path = 'src/cart.ts'", [project]))[0]!.revision;
  const content = `export const max = ${++seq};\n`;
  const change = { path: "src/cart.ts", kind: "edit", base_revision: base, content, sha256: sha(content), reason: "r" };
  const id = (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'm', 1, 1, $6, $7, $8, 1000, $9, $10) as id", [
      task,
      USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([change]),
      H("b"),
      await version(task),
      JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
      JSON.stringify(policy),
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date(Date.now() + 86_400_000).toISOString(),
    ])
  )[0]!.id;
  return (await admin<{ policy: Record<string, unknown> }>("select policy from public.change_proposals where id = $1", [id]))[0]!.policy;
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
  await q("select public.app_import_files($1, $2, $3, 524288, 4194304, 26214400, 3000)", [project, USERS.alice, JSON.stringify([{ path: "src/cart.ts", content: "export const max = 1;\n" }])]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("the rehearsal switch", () => {
  it("is for owners and admins, at level 0 only, keeps its start, and is recorded", async () => {
    await expect(setAutonomy(USERS.bob, 0, true)).rejects.toThrow(/FORBIDDEN/);
    await setAutonomy(USERS.alice, 0, true);
    const started = await shadowSince();
    expect(started).not.toBeNull();
    await setAutonomy(USERS.alice, 0, true);
    expect(await shadowSince()).toEqual(started);
    const [audit] = await admin<{ metadata: { to: { shadow: boolean } } }>("select metadata from public.audit_events where action = 'autonomy.changed' order by id desc limit 1");
    expect(audit!.metadata.to.shadow).toBe(true);
    // Level 2 ends the rehearsal, and the table refuses a rehearsal at level 2.
    await setAutonomy(USERS.alice, 2, true);
    expect(await shadowSince()).toBeNull();
    await expect(admin("update public.org_autonomy set shadow_since = now() where org_id = $1", [org])).rejects.toThrow(/org_autonomy_shadow/);
  });

  it("still takes the five arguments the app sent before this migration", async () => {
    await q("select public.app_set_autonomy($1, $2, 0, 3, false)", [org, USERS.alice]);
    expect(await shadowSince()).toBeNull();
  });

  it("is closed to browsers", async () => {
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_set_autonomy($1, $2, 0, 3, false, true)", [org, USERS.alice]))).rejects.toThrow(/permission denied/);
  });
});

describe("rehearsals on proposals", () => {
  it("are kept while the workspace rehearses", async () => {
    await setAutonomy(USERS.alice, 0, true);
    const policy = await propose(await approvedTask("Rehearsed"), { outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [], shadow: SHADOW });
    expect(policy).toMatchObject({ outcome: "REQUIRE_APPROVAL", shadow: { outcome: "ALLOW_WITHIN_LIMITS" } });
  });

  it("are dropped, never the proposal, once the rehearsal has ended", async () => {
    await setAutonomy(USERS.alice, 0, false);
    const policy = await propose(await approvedTask("Too late"), { outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [], shadow: SHADOW });
    expect(policy).toEqual({ outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] });
  });

  it("never ride with a change that applies on its own", async () => {
    await setAutonomy(USERS.alice, 2, false);
    const policy = await propose(await approvedTask("Level 2"), { outcome: "ALLOW_WITHIN_LIMITS", version: H("e"), findings: [], shadow: SHADOW });
    expect(policy).not.toHaveProperty("shadow");
  });
});
