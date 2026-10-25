/**
 * Migration v53: the emergency pause and incidents (ADR 0083). A pause
 * stops agents and automatic applies but not people; incidents open on
 * their own from audited signals, and a repeat adds to the open one.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let other: string;
let project: string;
const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `in-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;
const pause = (actor: string, paused: boolean, reason: string | null = null) => q<{ changed: boolean }>("select public.app_set_agents_pause($1, $2, $3, $4) as changed", [org, actor, paused, reason]);
const incidents = () => admin<{ number: number; title: string; source: string; status: string; severity: string; id: string }>("select id, number, title, source, status, severity from public.incidents where org_id = $1 order by number", [org]);
const events = (id: string) => admin<{ kind: string; text: string | null }>("select kind, text from public.incident_events where incident_id = $1 order by id", [id]);

/** A pending proposal decided with `outcome`. */
async function propose(outcome: string) {
  const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, `Change ${++seq}`]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [
    task,
    USERS.alice,
    JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1, requiredChecks: [] }),
    H("c"),
    JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")]),
  ]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  const content = `x${seq}`;
  return q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'm', 1, 1, $6, $7, $8, 1000, $9, $10) as id", [
    task,
    USERS.alice,
    JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
    JSON.stringify([{ path: `docs/${seq}.md`, kind: "create", base_revision: 0, content, sha256: sha(content), reason: "r" }]),
    H("b"),
    await version(task),
    JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
    JSON.stringify({ outcome, version: H("e"), findings: [] }),
    new Date(Date.now() - 86_400_000).toISOString(),
    new Date(Date.now() + 86_400_000).toISOString(),
  ]);
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  other = await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
  await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.unverified]);
  await q("select public.app_set_autonomy($1, $2, 2, 3, true, false)", [org, USERS.alice]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("the emergency pause", () => {
  it("lets any contributor pause, and opens an incident", async () => {
    expect((await pause(USERS.unverified, true, "Something looks wrong."))[0]!.changed).toBe(true);
    expect((await pause(USERS.alice, true))[0]!.changed).toBe(false);
    const [i] = await incidents();
    expect(i).toMatchObject({ number: 1, source: "pause", title: "Agents paused", status: "open" });
    expect((await events(i!.id))[0]).toMatchObject({ kind: "opened", text: expect.stringContaining("Something looks wrong.") });
  });

  it("refuses automatic applies and agents' changes, but not people's", async () => {
    await expect(propose("ALLOW_WITHIN_LIMITS")).rejects.toThrow(/AGENTS_PAUSED/);
    await expect(propose("REQUIRE_APPROVAL")).resolves.toHaveLength(1);
    const trigger = await admin<{ tgname: string }>("select tgname from pg_trigger where tgrelid = 'public.agent_runs'::regclass and tgname = 'agent_runs_paused'");
    expect(trigger).toHaveLength(1);
  });

  it("is resumed only by an owner or admin, and the incident records it", async () => {
    await expect(pause(USERS.unverified, false)).rejects.toThrow(/FORBIDDEN/);
    await expect(pause(USERS.bob, true)).rejects.toThrow(/FORBIDDEN/);
    expect((await pause(USERS.alice, false))[0]!.changed).toBe(true);
    const [i] = await incidents();
    expect((await events(i!.id)).map((e) => e.kind)).toEqual(["opened", "resumed"]);
    await expect(propose("ALLOW_WITHIN_LIMITS")).resolves.toHaveLength(1);
  });

  it("can't be called from a browser", async () => {
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_set_agents_pause($1, $2, true, null)", [org, USERS.alice]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("update public.organizations set agents_paused_at = now() where id = $1", [org]))).rejects.toThrow(/permission denied/);
  });
});

describe("incidents that open on their own", () => {
  it("opens one when what's live goes down, adds to it when it comes back, and opens again after it's resolved", async () => {
    const audit = (action: string, detail: string) => admin("insert into public.audit_events (org_id, action, target, metadata) values ($1, $2, $3, $4)", [org, action, project, JSON.stringify({ detail })]);
    await audit("watch.down", "HTTP 502");
    await audit("watch.down", "HTTP 503");
    await audit("watch.recovered", "HTTP 200");
    const watch = (await incidents()).filter((i) => i.source === "outcome_watch");
    expect(watch).toHaveLength(1);
    expect(watch[0]).toMatchObject({ title: "Storefront is down", severity: "high" });
    expect((await events(watch[0]!.id)).map((e) => e.kind)).toEqual(["opened", "check_failed", "recovered"]);

    await q("select public.app_update_incident($1, $2, $3, null, 'resolved', 'The host restarted; nothing in the project changed.')", [org, USERS.alice, watch[0]!.number]);
    await audit("watch.down", "HTTP 500");
    expect((await incidents()).filter((i) => i.source === "outcome_watch")).toHaveLength(2);
  });

  it("opens one when a change applied on its own fails its checks, linked to that change", async () => {
    const proposal = (await propose("REQUIRE_APPROVAL"))[0]!.id;
    await admin("insert into public.audit_events (org_id, action, target, metadata) values ($1, 'autonomy.suspended', $2, $3)", [org, proposal, JSON.stringify({ proofpack: H("d"), status: "failed" })]);
    const row = (await admin<{ proposal_id: string; project_id: string; source: string }>("select proposal_id, project_id, source from public.incidents where org_id = $1 and source = 'autonomy_failure'", [org]))[0];
    expect(row).toMatchObject({ proposal_id: proposal, project_id: project });
    const [opened] = await admin<{ ref: { task: string; proofpack: string } }>("select e.ref from public.incident_events e join public.incidents i on i.id = e.incident_id where i.source = 'autonomy_failure'");
    expect(opened!.ref).toMatchObject({ task: expect.any(String), proofpack: H("d") });
  });
});

describe("working an incident", () => {
  it("opens by hand with the next number, takes notes, and resolves only with what happened", async () => {
    const n = (await q<{ n: number }>("select public.app_open_incident($1, $2, 'Wrong prices on the shop', 'critical', $3, 'Customers reported it.') as n", [org, USERS.alice, project]))[0]!.n;
    expect(n).toBe((await incidents()).length);
    await q("select public.app_add_incident_event($1, $2, $3, 'note', 'Rolled back the pricing change.', '{}')", [org, USERS.unverified, n]);
    await expect(q("select public.app_add_incident_event($1, $2, $3, 'opened', 'x', '{}')", [org, USERS.alice, n])).rejects.toThrow(/INVALID_INCIDENT/);
    await expect(q("select public.app_update_incident($1, $2, $3, null, 'resolved', 'short')", [org, USERS.alice, n])).rejects.toThrow(/INVALID_INCIDENT/);
    await q("select public.app_update_incident($1, $2, $3, 'high', 'contained', null)", [org, USERS.alice, n]);
    await q("select public.app_update_incident($1, $2, $3, null, 'resolved', 'A rounding bug in the cart; fixed and a rule added.')", [org, USERS.alice, n]);
    await expect(q("select public.app_update_incident($1, $2, $3, 'low', null, null)", [org, USERS.alice, n])).rejects.toThrow(/INCIDENT_RESOLVED/);
    const id = (await incidents()).find((i) => i.number === n)!.id;
    expect((await events(id)).map((e) => e.kind)).toEqual(["opened", "note", "severity", "status", "resolved"]);
  });

  it("keeps workspaces apart and lets only the server write", async () => {
    await expect(q("select public.app_open_incident($1, $2, 'Not mine', 'low', null, null)", [org, USERS.bob])).rejects.toThrow(/FORBIDDEN/);
    await expect(q("select public.app_open_incident($1, $2, 'Wrong project', 'low', $3, null)", [other, USERS.bob, project])).rejects.toThrow(/NOT_FOUND/);
    const mine = await as(db, "authenticated", USERS.alice, () => db.query("select id from public.incidents"));
    expect(mine.rows.length).toBeGreaterThan(0);
    expect((await as(db, "authenticated", USERS.bob, () => db.query("select id from public.incident_events where org_id = $1", [org]))).rows).toEqual([]);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("insert into public.incidents (org_id, number, title, severity, source) values ($1, 99, 'Forged', 'low', 'manual')", [org]))).rejects.toThrow(/permission denied/);
  });

  it("escalates each incident once", async () => {
    const id = (await incidents()).find((i) => i.status !== "resolved")!.id;
    expect((await q<{ c: boolean }>("select public.app_claim_incident_escalation($1) as c", [id]))[0]!.c).toBe(true);
    expect((await q<{ c: boolean }>("select public.app_claim_incident_escalation($1) as c", [id]))[0]!.c).toBe(false);
  });
});
