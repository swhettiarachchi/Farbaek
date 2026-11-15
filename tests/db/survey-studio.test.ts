/**
 * Migration v93: Survey Studio (stage 190, ADR 0198). Members read; only the
 * server writes, through app_survey_* functions that check the role again and
 * audit every change. Imported points can't be changed; drawings are
 * append-only versions; only the surveyor a drawing names can approve it.
 * All coordinates are SYNTHETIC.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USAGE_OPERATIONS } from "@/config/usage";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;
let project: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const doc = (extra: Record<string, unknown> = {}) => JSON.stringify({ schema: 1, boundary: [], features: [], labelOffsets: {}, layers: {}, sheet: {}, settings: {}, surveyorUserId: null, ...extra });
const points = (rows: [string, number, number, number | null][]) => JSON.stringify(rows.map(([point_id, e, n, z], i) => ({ point_id, e, n, z, code: "CP", line: i + 1 })));
const create = (actor: string, orgId = org, type = "cadastral", confirm = true) =>
  q<{ id: string }>("select public.app_survey_create_project($1, $2, 'Sample site', $3, 'EPSG:5235', $4, $5::jsonb) as id", [orgId, actor, type, confirm, doc()]).then((r) => r[0]!.id);
const importPoints = (actor: string, json: string, content = "synthetic", crs = "EPSG:5235") =>
  q<{ r: { source_id: string; added: number; skipped: number } }>("select public.app_survey_import($1, $2, $3, 'pts.csv', 'delimited', $4, $6::jsonb, $5::jsonb) as r", [org, actor, project, content, json, JSON.stringify({ crs })]).then((r) => r[0]!.r);
const save = (actor: string, base: number, document = doc(), orgId = org, projectId = project) =>
  q<{ v: number }>("select public.app_survey_save_drawing($1, $2, $3, $4, $5::jsonb, 'edit') as v", [orgId, actor, projectId, base, document]).then((r) => r[0]!.v);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Surveys");
  otherOrg = await createOrg(db, USERS.bob, "Bob Surveys");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("projects", () => {
  it("creates a cadastral project with its first drawing version, the CRS confirmation and an audit event", async () => {
    project = await create(USERS.alice);
    const [p] = await su<{ crs_id: string; crs_confirmed_by: string; plan_type: string }>("select crs_id, crs_confirmed_by, plan_type from public.survey_projects where id = $1", [project]);
    expect(p).toEqual({ crs_id: "EPSG:5235", crs_confirmed_by: USERS.alice, plan_type: "cadastral" });
    expect(await su("select version from public.survey_drawings where project_id = $1", [project])).toEqual([{ version: 1 }]);
    const events = await su<{ action: string }>("select action from public.audit_events where org_id = $1 and action like 'survey.%'", [org]);
    expect(events.map((e) => e.action)).toContain("survey.project_created");
  });

  it("refuses plan types that aren't available yet, other workspaces and viewers", async () => {
    await expect(create(USERS.alice, org, "topographic")).rejects.toThrow(/PLAN_TYPE_NOT_AVAILABLE/);
    await expect(create(USERS.bob, org)).rejects.toThrow(/FORBIDDEN/);
    await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'viewer')", [org, USERS.bob]);
    await expect(create(USERS.bob, org)).rejects.toThrow(/FORBIDDEN/);
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });

  it("clears the CRS confirmation when the CRS changes unless it is confirmed again", async () => {
    await q("select public.app_survey_update_project($1, $2, $3, 'Sample site', 'EPSG:5234', false)", [org, USERS.alice, project]);
    expect(await su("select crs_id, crs_confirmed_by from public.survey_projects where id = $1", [project])).toEqual([{ crs_id: "EPSG:5234", crs_confirmed_by: null }]);
    await q("select public.app_survey_update_project($1, $2, $3, 'Sample site', 'EPSG:5235', true)", [org, USERS.alice, project]);
    expect(await su("select crs_id, crs_confirmed_by from public.survey_projects where id = $1", [project])).toEqual([{ crs_id: "EPSG:5235", crs_confirmed_by: USERS.alice }]);
  });
});

describe("imported points", () => {
  it("stores the file with the database's own hash, and skips exact repeats", async () => {
    const first = await importPoints(USERS.alice, points([["1", 500012.345, 600004.21, 21.43], ["2", 500043.912, 600007.884, null]]), "1,600004.210,500012.345\n");
    expect(first).toMatchObject({ added: 2, skipped: 0 });
    const [src] = await su<{ sha256: string; size_bytes: number }>("select sha256, size_bytes from public.survey_sources where id = $1", [first.source_id]);
    expect(src!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(src!.size_bytes).toBe(24);
    const again = await importPoints(USERS.alice, points([["2", 500043.912, 600007.884, null], ["3", 500048.105, 600036.47, 22.61]]));
    expect(again).toMatchObject({ added: 1, skipped: 1 });
    // Decimals come back exactly as imported.
    expect(await su("select e::text, n::text from public.survey_points where project_id = $1 and point_id = '1'", [project])).toEqual([{ e: "500012.345", n: "600004.21" }]);
  });

  it("refuses an import that would change an existing point, as a whole", async () => {
    await expect(importPoints(USERS.alice, points([["4", 500027.66, 600049.902, 22.95], ["1", 500012.346, 600004.21, 21.43]]))).rejects.toThrow(/POINT_CONFLICT: 1/);
    expect(await su("select count(*)::int as c from public.survey_points where project_id = $1 and point_id = '4'", [project])).toEqual([{ c: 0 }]);
    // The same coordinates with a different code is a different point too: a corrected code never hides as "unchanged".
    const recoded = JSON.stringify([{ point_id: "1", e: 500012.345, n: 600004.21, z: 21.43, code: "MW", line: 1 }]);
    await expect(importPoints(USERS.alice, recoded)).rejects.toThrow(/POINT_CONFLICT: 1/);
  });

  it("refuses an import confirmed in a grid the project no longer has", async () => {
    await expect(importPoints(USERS.alice, points([["4", 500027.66, 600049.902, 22.95]]), "synthetic", "EPSG:5234")).rejects.toThrow(/CRS_CHANGED/);
    await expect(q("select public.app_survey_import($1, $2, $3, 'pts.csv', 'delimited', 'x', '{}'::jsonb, $4::jsonb)", [org, USERS.alice, project, points([["4", 1, 2, null]])])).rejects.toThrow(/CRS_CHANGED/);
  });

  it("never lets anyone change or delete a point from the browser", async () => {
    await as(db, "authenticated", USERS.alice, async () => {
      await expect(db.query("update public.survey_points set e = 0 where project_id = $1", [project])).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from public.survey_points where project_id = $1", [project])).rejects.toThrow(/permission denied/);
      await expect(db.query("insert into public.survey_drawings (project_id, org_id, version, document) values ($1, $2, 99, '{}')", [project, org])).rejects.toThrow(/permission denied/);
    });
  });
});

describe("drawing versions", () => {
  it("adds versions on top of the latest, and refuses a stale base", async () => {
    expect(await save(USERS.alice, 1)).toBe(2);
    await expect(save(USERS.alice, 1)).rejects.toThrow(/VERSION_CONFLICT/);
    expect(await save(USERS.alice, 2)).toBe(3);
    expect(await su("select count(*)::int as c from public.survey_drawings where project_id = $1", [project])).toEqual([{ c: 3 }]);
  });

  it("refuses another workspace's project", async () => {
    await expect(save(USERS.bob, 3, doc(), otherOrg, project)).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("approval", () => {
  const sha = "a".repeat(64);

  it("lets only the surveyor the drawing names, with a profile, approve the latest version", async () => {
    await expect(q("select public.app_survey_approve($1, $2, $3, 3, 'EPSG:5235', $4)", [org, USERS.alice, project, sha])).rejects.toThrow(/NOT_THE_SURVEYOR/);
    const v = await save(USERS.alice, 3, doc({ surveyorUserId: USERS.alice }));
    await expect(q("select public.app_survey_approve($1, $2, $3, $4, 'EPSG:5235', $5)", [org, USERS.alice, project, v, sha])).rejects.toThrow(/NO_SURVEYOR_PROFILE/);
    await q("select public.app_survey_set_profile($1, $2, 'A. Sample', 'Licensed surveyor (sample)', 'SAMPLE-0', 'Sample address', '')", [org, USERS.alice]);
    await expect(q("select public.app_survey_approve($1, $2, $3, $4, 'EPSG:5235', $5)", [org, USERS.alice, project, v - 1, sha])).rejects.toThrow(/VERSION_CONFLICT/);
    await q("select public.app_survey_approve($1, $2, $3, $4, 'EPSG:5235', $5)", [org, USERS.alice, project, v, sha]);
    await expect(q("select public.app_survey_approve($1, $2, $3, $4, 'EPSG:5235', $5)", [org, USERS.alice, project, v, sha])).rejects.toThrow(/ALREADY_APPROVED/);
    const [a] = await su<{ drawing_version: number; surveyor: { name: string } }>("select drawing_version, surveyor from public.survey_approvals where project_id = $1", [project]);
    expect(a).toMatchObject({ drawing_version: v, surveyor: { name: "A. Sample" } });
    // Approving against a grid that has changed since the server read it is refused.
    await expect(q("select public.app_survey_approve($1, $2, $3, $4, 'EPSG:5234', $5)", [org, USERS.alice, project, v, sha])).rejects.toThrow(/CRS_CHANGED/);

    // Changing the grid withdraws the approval (kept as a record), and the version can be approved again.
    await q("select public.app_survey_update_project($1, $2, $3, 'Sample site', 'EPSG:5234', true)", [org, USERS.alice, project]);
    expect(await su("select withdrawn_reason from public.survey_approvals where project_id = $1", [project])).toEqual([{ withdrawn_reason: "crs_changed" }]);
    const [ev] = await su<{ metadata: { approvals_withdrawn: number } }>("select metadata from public.audit_events where org_id = $1 and action = 'survey.crs_confirmed' order by id desc limit 1", [org]);
    expect(ev!.metadata.approvals_withdrawn).toBe(1);
    await q("select public.app_survey_approve($1, $2, $3, $4, 'EPSG:5234', $5)", [org, USERS.alice, project, v, "c".repeat(64)]);
    expect(await su("select count(*)::int as c from public.survey_approvals where project_id = $1 and withdrawn_at is null", [project])).toEqual([{ c: 1 }]);
    // Re-confirming the same grid withdraws nothing.
    await q("select public.app_survey_update_project($1, $2, $3, 'Sample site', 'EPSG:5234', true)", [org, USERS.alice, project]);
    expect(await su("select count(*)::int as c from public.survey_approvals where project_id = $1 and withdrawn_at is null", [project])).toEqual([{ c: 1 }]);

    // A later edit is a new, unapproved version.
    const next = await save(USERS.alice, v, doc({ surveyorUserId: USERS.alice }));
    expect(await su("select count(*)::int as c from public.survey_approvals a join public.survey_drawings d on d.id = a.drawing_id where d.version = $1 and d.project_id = $2", [next, project])).toEqual([{ c: 0 }]);
  });
});

describe("AI drafting (v94)", () => {
  it("meters drafting and reading as their own operations, exactly as the app lists them", async () => {
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const grant = JSON.stringify({ kind: "plan", units: 1_000, starts_at: from, expires_at: to, source_key: "plan:survey-ai" });
    await expect(q("select public.app_reserve_usage($1, $2, 'k-survey-draft', 'survey_draft', null, 30, $3)", [org, USERS.alice, grant])).resolves.toHaveLength(1);
    await expect(q("select public.app_reserve_usage($1, $2, 'k-survey-read', 'survey_read', null, 30, $3)", [org, USERS.alice, grant])).resolves.toHaveLength(1);
    const [check] = await su<{ def: string }>("select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'ai_credit_ledger_operation_check'");
    const listed = [...check!.def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(listed).toEqual([...USAGE_OPERATIONS].sort());
  });

  it("records each run with counts only, for contributors of an open project", async () => {
    await q("select public.app_survey_record_ai_draft($1, $2, $3, 'survey_draft', 'claude-sonnet-5-5', 12, 2, 1)", [org, USERS.alice, project]);
    const [e] = await su<{ metadata: Record<string, unknown> }>("select metadata from public.audit_events where org_id = $1 and action = 'survey.ai_drafted'", [org]);
    expect(e!.metadata).toEqual({ operation: "survey_draft", model: "claude-sonnet-5-5", accepted: 12, dropped: 2, questions: 1 });
    await expect(q("select public.app_survey_record_ai_draft($1, $2, $3, 'agent_step', 'claude-sonnet-5-5', 1, 0, 0)", [org, USERS.alice, project])).rejects.toThrow(/INVALID_OPERATION/);
    await expect(q("select public.app_survey_record_ai_draft($1, $2, $3, 'survey_read', 'Robert''); drop', 1, 0, 0)", [org, USERS.alice, project])).rejects.toThrow(/INVALID_MODEL/);
    await expect(q("select public.app_survey_record_ai_draft($1, $2, $3, 'survey_read', 'claude-sonnet-5-5', -1, 0, 0)", [org, USERS.alice, project])).rejects.toThrow(/INVALID_COUNTS/);
    await expect(q("select public.app_survey_record_ai_draft($1, $2, $3, 'survey_read', 'claude-sonnet-5-5', 1, 0, 0)", [org, USERS.bob, project])).rejects.toThrow(/FORBIDDEN/);
    // A viewer of the workspace can't either.
    await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'viewer')", [org, USERS.bob]);
    await expect(q("select public.app_survey_record_ai_draft($1, $2, $3, 'survey_read', 'claude-sonnet-5-5', 1, 0, 0)", [org, USERS.bob, project])).rejects.toThrow(/FORBIDDEN/);
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
    await as(db, "authenticated", USERS.alice, async () => {
      await expect(db.query("select public.app_survey_record_ai_draft($1, $2, $3, 'survey_draft', 'claude-sonnet-5-5', 1, 0, 0)", [org, USERS.alice, project])).rejects.toThrow(/permission denied/);
    });
  });
});

describe("exports and reading", () => {
  it("records exports by any member, and audits them", async () => {
    await q("select public.app_survey_record_export($1, $2, $3, 1, 'pdf', $4, 1234, '{}'::jsonb)", [org, USERS.alice, project, "b".repeat(64)]);
    await expect(q("select public.app_survey_record_export($1, $2, $3, 1, 'pdf', $4, 1234, '{}'::jsonb)", [org, USERS.bob, project, "b".repeat(64)])).rejects.toThrow(/FORBIDDEN/);
    await expect(q("select public.app_survey_record_export($1, $2, $3, 999, 'pdf', $4, 1234, '{}'::jsonb)", [org, USERS.alice, project, "b".repeat(64)])).rejects.toThrow(/NOT_FOUND/);
    expect(await su("select count(*)::int as c from public.audit_events where org_id = $1 and action = 'survey.exported'", [org])).toEqual([{ c: 1 }]);
    // A paused workspace makes no new files.
    await su("update public.organizations set suspended_at = now() where id = $1", [org]);
    await expect(q("select public.app_survey_record_export($1, $2, $3, 1, 'pdf', $4, 1234, '{}'::jsonb)", [org, USERS.alice, project, "b".repeat(64)])).rejects.toThrow(/WORKSPACE_SUSPENDED/);
    await su("update public.organizations set suspended_at = null where id = $1", [org]);
  });

  it("shows members their own workspace's survey data and nothing of others'", async () => {
    const mine = await as(db, "authenticated", USERS.alice, async () => (await db.query("select id from public.survey_projects")).rows);
    expect(mine).toEqual([{ id: project }]);
    const theirs = await as(db, "authenticated", USERS.bob, async () => (await db.query("select id from public.survey_points")).rows);
    expect(theirs).toEqual([]);
    await as(db, "authenticated", USERS.alice, async () => {
      await expect(db.query("select public.app_survey_save_drawing($1, $2, $3, 1, '{}'::jsonb, null)", [org, USERS.alice, project])).rejects.toThrow(/permission denied/);
    });
  });

  it("archives a project, which then takes no more edits", async () => {
    await q("select public.app_survey_archive_project($1, $2, $3)", [org, USERS.alice, project]);
    await expect(importPoints(USERS.alice, points([["9", 1, 2, null]]))).rejects.toThrow(/NOT_FOUND/);
    await expect(q("select public.app_survey_record_export($1, $2, $3, 1, 'pdf', $4, 1234, '{}'::jsonb)", [org, USERS.alice, project, "b".repeat(64)])).rejects.toThrow(/NOT_FOUND/);
  });
});
