import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USAGE_CAPS, USAGE_STEP_UP_UNITS } from "@/core/office/permissions";
import { as, createOrg, createTestDb, USERS } from "./harness";

/**
 * Migration v21 (ADR 0032, phase 2): staff controls enforced in the
 * database. A suspended workspace refuses its members' writes and new
 * activity; a paused feature refuses its inserts; a blocked site can't go
 * live again; usage additions are capped adjustment grants; every staff
 * call records one chained event, and a refused one records none.
 */

const CEO = "00000000-0000-4000-8000-0000000000c0";
let db: PGlite;
let org: string;
let project: string;
let site: string;
let ceoSession: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const events = async () => Number((await su<{ n: number }>("select count(*)::int as n from public.staff_audit_events"))[0]!.n);
const lastEvent = async () => (await su<{ action: string; org_id: string | null; reason: string | null }>("select action, org_id, reason from public.staff_audit_events order by seq desc limit 1"))[0]!;
const REASON = "Phishing report from a customer, checked by hand";
const NOTICE = "This workspace is paused while Farbaek reviews a report. Write to support@farbaek.com.";

const createProject = (name: string) => q<{ id: string }>("select public.app_create_project($1, $2, $3, null, null) as id", [org, USERS.alice, name]);
const servingState = async (name = "sunrise-bakery") => (await q<{ r: { state: string } }>("select public.app_site_for_serving($1) as r", [name]))[0]!.r.state;

beforeAll(async () => {
  db = await createTestDb();
  await su("insert into auth.users (id, email, email_confirmed_at) values ($1, 'info@farbaek.com', now())", [CEO]);
  org = await createOrg(db, USERS.alice, "Alice Studio");
  project = (await createProject("Bakery"))[0]!.id;
  await q("select public.app_import_files($1, $2, $3, 524288, 4194304, 26214400, 3000)", [project, USERS.alice, JSON.stringify([{ path: "index.html", content: "<h1>Bakery</h1>" }])]);
  const report = (await q<{ id: string }>("select public.app_start_security_report($1, $2, $3) as id", [org, USERS.alice, project]))[0]!.id;
  await q("select public.app_finish_security_report($1, 'done', 90, 'A', $2, $3, $4, null)", [
    report,
    JSON.stringify({ critical: 0, high: 0, medium: 0, low: 0, info: 0 }),
    JSON.stringify({ predicateType: "https://farbaek.dev/security-report/v1", predicate: {} }),
    "c".repeat(64),
  ]);
  const files = await su("select path, revision, sha256, size_bytes as size from public.project_files where project_id = $1 order by path", [project]);
  await q("select public.app_publish_site($1, $2, $3, 'sunrise-bakery', $4, $5, $6, $7)", [org, USERS.alice, project, JSON.stringify(files), "d".repeat(64), report, "No agent changes in this project yet."]);
  site = (await su<{ id: string }>("select id from public.sites where name = 'sunrise-bakery'"))[0]!.id;

  ceoSession = crypto.randomUUID();
  await su("insert into auth.sessions (id, user_id) values ($1, $2)", [ceoSession, CEO]);
  await q("select public.app_staff_begin_session($1, $2, now(), null, null, 'info@farbaek.com')", [CEO, ceoSession]);
}, 90_000);

afterAll(async () => {
  await db.close();
});

describe("who can call the controls", () => {
  it("keeps browsers out of the functions and the switches", async () => {
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_staff_set_flag($1, $2, 'ai_runs', true, $3, $4, 'step_up', null, null)", [USERS.alice, ceoSession, NOTICE, REASON]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("update public.platform_flags set paused = true"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select updated_by from public.platform_flags"))).rejects.toThrow(/permission denied/);
    expect(await as(db, "authenticated", USERS.alice, async () => (await db.query("select key, paused from public.platform_flags order by key")).rows)).toHaveLength(6);
    await expect(q("update public.platform_flags set paused = true")).rejects.toThrow(/permission denied/);
    await expect(q("select public.app_staff_suspend_workspace($1, $2, $3, 'Alice Studio', $4, $5, null, null)", [USERS.bob, crypto.randomUUID(), org, NOTICE, REASON])).rejects.toThrow(/NOT_STAFF/);
  });
});

describe("suspending a workspace", () => {
  it("needs the exact workspace name, a notice and a reason, and records nothing when refused", async () => {
    const before = await events();
    await expect(q("select public.app_staff_suspend_workspace($1, $2, $3, 'alice studio', $4, $5, null, null)", [CEO, ceoSession, org, NOTICE, REASON])).rejects.toThrow(/CONFIRM_NAME_MISMATCH/);
    await expect(q("select public.app_staff_suspend_workspace($1, $2, $3, 'Alice Studio', 'short', $4, null, null)", [CEO, ceoSession, org, REASON])).rejects.toThrow(/NOTICE_REQUIRED/);
    await expect(q("select public.app_staff_suspend_workspace($1, $2, $3, 'Alice Studio', $4, 'short', null, null)", [CEO, ceoSession, org, NOTICE])).rejects.toThrow(/REASON_REQUIRED/);
    expect(await events()).toBe(before);
  });

  it("stops members' writes and new activity, keeps the data, and lets system work finish", async () => {
    const before = await events();
    await q("select public.app_staff_suspend_workspace($1, $2, $3, 'Alice Studio', $4, $5, null, null)", [CEO, ceoSession, org, NOTICE, REASON]);
    expect(await events()).toBe(before + 1);
    expect(await lastEvent()).toMatchObject({ action: "workspace.suspended", org_id: org, reason: REASON });
    expect(await su("select action, metadata from public.audit_events where org_id = $1 and action like 'farbaek.%'", [org])).toEqual([{ action: "farbaek.workspace_suspended", metadata: { notice: NOTICE } }]);

    // Through require_contributor, and through the insert guards for paths that check membership themselves.
    await expect(createProject("Another")).rejects.toThrow(/WORKSPACE_SUSPENDED/);
    await expect(q("select public.app_create_task($1, $2, $3, 'A task')", [org, USERS.alice, project])).rejects.toThrow(/WORKSPACE_SUSPENDED/);
    await expect(su("insert into public.projects (org_id, name, created_by) values ($1, 'Direct', $2)", [org, USERS.alice])).rejects.toThrow(/WORKSPACE_SUSPENDED/);
    await expect(su("insert into public.organization_invitations (org_id, email, role, invited_by, token_sha256, expires_at) values ($1, 'x@example.test', 'member', $2, $3, now() + interval '1 day')", [org, USERS.alice, "e".repeat(64)])).rejects.toThrow(/WORKSPACE_SUSPENDED/);
    // The site stops serving, and can't go live again while the workspace is suspended.
    expect(await servingState()).toBe("suspended");
    // Data stays, and plain updates (what system cleanup does) still work.
    await su("update public.projects set description = 'kept' where id = $1", [project]);
    expect(await su("select count(*)::int as n from public.projects where org_id = $1", [org])).toEqual([{ n: 1 }]);
    await expect(q("select public.app_staff_suspend_workspace($1, $2, $3, 'Alice Studio', $4, $5, null, null)", [CEO, ceoSession, org, NOTICE, REASON])).rejects.toThrow(/ALREADY_SUSPENDED/);
  });

  it("restores the workspace and its writes", async () => {
    await q("select public.app_staff_restore_workspace($1, $2, $3, $4, null, null)", [CEO, ceoSession, org, REASON]);
    expect((await createProject("After restore"))[0]!.id).toBeTruthy();
    expect(await servingState()).toBe("live");
    await expect(q("select public.app_staff_restore_workspace($1, $2, $3, $4, null, null)", [CEO, ceoSession, org, REASON])).rejects.toThrow(/NOT_SUSPENDED/);
  });
});

describe("taking a site offline", () => {
  it("blocks it, keeps it and its name, and refuses to make it live again until unblocked", async () => {
    const deployment = (await su<{ id: string }>("select id from public.site_deployments where site_id = $1 limit 1", [site]))[0]!.id;
    await q("select public.app_staff_block_site($1, $2, $3, $4, $5, null, null)", [CEO, ceoSession, site, NOTICE, REASON]);
    expect(await su("select live_deployment_id, blocked_notice from public.sites where id = $1", [site])).toEqual([{ live_deployment_id: null, blocked_notice: NOTICE }]);
    expect(await servingState()).toBe("blocked");
    await expect(su("update public.sites set live_deployment_id = $1 where id = $2", [deployment, site])).rejects.toThrow(/SITE_BLOCKED/);
    await expect(q("select public.app_set_live_deployment($1, $2, $3, $4)", [org, USERS.alice, site, deployment])).rejects.toThrow(/SITE_BLOCKED/);
    // Taking it offline is always allowed.
    await q("select public.app_set_live_deployment($1, $2, $3, null)", [org, USERS.alice, site]);

    await q("select public.app_staff_unblock_site($1, $2, $3, $4, null, null)", [CEO, ceoSession, site, REASON]);
    expect(await servingState()).toBe("none");
    await q("select public.app_set_live_deployment($1, $2, $3, $4)", [org, USERS.alice, site, deployment]);
    expect(await servingState()).toBe("live");
    expect(await servingState("no-such-site")).toBe("none");
  });
});

describe("platform switches", () => {
  const setFlag = (key: string, paused: boolean, strength = "step_up", message: string | null = NOTICE) =>
    q("select public.app_staff_set_flag($1, $2, $3, $4, $5, $6, $7, null, null)", [CEO, ceoSession, key, paused, message, REASON, strength]);

  it("need a fresh code, a known switch and a message when pausing", async () => {
    await expect(setFlag("ai_runs", true, "aal2")).rejects.toThrow(/STEP_UP_REQUIRED/);
    await expect(setFlag("everything", true)).rejects.toThrow(/INVALID_FLAG/);
    await expect(setFlag("ai_runs", true, "step_up", null)).rejects.toThrow(/NOTICE_REQUIRED/);
  });

  it("stop new workspaces, publishing and serving while paused, and only those", async () => {
    await setFlag("new_workspaces", true);
    await expect(createOrg(db, USERS.bob, "Bob Labs")).rejects.toThrow(/PAUSED_BY_FARBAEK:new_workspaces/);
    expect((await createProject("Still fine"))[0]!.id).toBeTruthy();
    await setFlag("new_workspaces", false, "step_up", null);
    expect(await createOrg(db, USERS.bob, "Bob Labs")).toBeTruthy();

    await setFlag("serve_published_sites", true);
    expect(await servingState()).toBe("paused");
    await setFlag("serve_published_sites", false, "step_up", null);
    expect(await servingState()).toBe("live");

    await setFlag("publishing", true);
    await expect(q("select public.app_set_live_deployment($1, $2, $3, (select id from public.site_deployments where site_id = $3 limit 1))", [org, USERS.alice, site])).resolves.toBeDefined();
    await q("select public.app_set_live_deployment($1, $2, $3, null)", [org, USERS.alice, site]);
    await expect(q("select public.app_set_live_deployment($1, $2, $3, (select id from public.site_deployments where site_id = $3 limit 1))", [org, USERS.alice, site])).rejects.toThrow(/PAUSED_BY_FARBAEK:publishing/);
    await setFlag("publishing", false, "step_up", null);

    expect((await su<{ action: string }>("select action from public.staff_audit_events where action like 'platform.%' order by seq")).map((e) => e.action)).toEqual([
      "platform.paused",
      "platform.resumed",
      "platform.paused",
      "platform.resumed",
      "platform.paused",
      "platform.resumed",
    ]);
  });

  it("stop AI usage while ai_runs is paused", async () => {
    await setFlag("ai_runs", true);
    const grant = JSON.stringify({ kind: "plan", units: 10_000, starts_at: new Date(Date.now() - 86_400_000).toISOString(), expires_at: new Date(Date.now() + 20 * 86_400_000).toISOString(), source_key: "plan:pro:2026-10" });
    await expect(q("select public.app_reserve_usage($1, $2, 'k-paused', 'agent_step', null, 10, $3)", [org, USERS.alice, grant])).rejects.toThrow(/PAUSED_BY_FARBAEK:ai_runs/);
    await setFlag("ai_runs", false, "step_up", null);
  });
});

describe("adding AI usage", () => {
  const add = (units: number, days = 30, strength = "aal2") =>
    q<{ id: string }>("select public.app_staff_add_usage($1, $2, $3, $4, $5, $6, $7, null, null) as id", [CEO, ceoSession, org, units, days, REASON, strength]);

  it("is an adjustment grant within the role's cap, with a fresh code for large amounts, and never touches billing", async () => {
    const billing = await su("select state, paid_plan_id from public.billing_accounts where org_id = $1", [org]);
    await expect(add(USAGE_STEP_UP_UNITS + 1)).rejects.toThrow(/STEP_UP_REQUIRED/);
    await expect(add(USAGE_CAPS.owner! + 1, 30, "step_up")).rejects.toThrow(/USAGE_CAP/);
    await expect(add(500)).rejects.toThrow(/INVALID_UNITS/);
    await expect(add(10_000, 91)).rejects.toThrow(/INVALID_EXPIRY/);
    const id = (await add(250_000))[0]!.id;
    expect(await su("select kind, units::int as units, used::int as used, source_key like 'adjustment:%' as keyed, expires_at <= now() + interval '30 days 1 minute' as within from public.usage_grants where id = $1", [id])).toEqual([
      { kind: "adjustment", units: 250000, used: 0, keyed: true, within: true },
    ]);
    expect(await su("select state, paid_plan_id from public.billing_accounts where org_id = $1", [org])).toEqual(billing);
    expect(await lastEvent()).toMatchObject({ action: "usage.added", org_id: org });
  });
});

describe("announcements", () => {
  it("are read by signed-in people while live, without who wrote them", async () => {
    const id = (await q<{ id: string }>("select public.app_staff_publish_announcement($1, $2, $3, 'incident', true, null, $4, null, null) as id", [CEO, ceoSession, "Builds are slow right now while we fix a provider issue.", REASON]))[0]!.id;
    const asAlice = <T>(sql: string) => as(db, "authenticated", USERS.alice, async () => (await db.query<T>(sql)).rows);
    expect(await asAlice("select id, tone, dismissible from public.announcements")).toEqual([{ id, tone: "incident", dismissible: false }]);
    await expect(asAlice("select created_by from public.announcements")).rejects.toThrow(/permission denied/);
    await expect(q("select public.app_staff_publish_announcement($1, $2, 'too short', 'info', true, null, $3, null, null)", [CEO, ceoSession, REASON])).rejects.toThrow(/INVALID_ANNOUNCEMENT/);
    await q("select public.app_staff_end_announcement($1, $2, $3, $4, null, null)", [CEO, ceoSession, id, REASON]);
    expect(await asAlice("select id from public.announcements")).toEqual([]);
    await expect(q("select public.app_staff_end_announcement($1, $2, $3, $4, null, null)", [CEO, ceoSession, id, REASON])).rejects.toThrow(/ANNOUNCEMENT_MISSING/);
  });
});
