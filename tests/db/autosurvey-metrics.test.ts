/**
 * The owner's read-only success-metrics query (scripts/vps/autosurvey-metrics.ps1, stage 237), taken from the script itself and run
 * against the real migrations, so the script can't drift from the schema. SYNTHETIC projects, runs, versions and AI reads.
 */
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const stages = (importMs: number, drawMs: number) =>
  JSON.stringify([
    { id: "import", label: "Importing 1 file", state: "done", ms: importMs },
    { id: "draw", label: "Drawing the plan", state: "done", ms: drawMs },
    { id: "sketches", label: "No sketches to read", state: "skipped" },
  ]);
const doc = JSON.stringify({ schema: 1, boundary: [], features: [], labelOffsets: {}, layers: {}, sheet: {}, settings: {}, surveyorUserId: null });

async function project(name: string): Promise<string> {
  return (await q<{ id: string }>("select public.app_survey_create_project($1, $2, $3, 'cadastral', 'EPSG:5235', true, $4::jsonb) as id", [org, USERS.alice, name, doc]))[0]!.id;
}
async function run(projectId: string, state: "done" | "failed" | "running", s = "[]"): Promise<string> {
  const id = (await q<{ id: string }>("select public.app_survey_job_start($1, $2, $3, 'generate', $4::jsonb) as id", [org, USERS.alice, projectId, s]))[0]!.id;
  if (state !== "running") await q("select public.app_survey_job_update($1, $2, $3::jsonb, $4, '{}'::jsonb)", [org, id, s, state]);
  return id;
}
/** A saved version, as the database owner, so its time can be set. */
async function version(projectId: string, n: number, note: string, hoursAgo: number): Promise<string> {
  return (await db.query<{ id: string }>("insert into public.survey_drawings (project_id, org_id, version, document, note, created_at) values ($1, $2, $3, $4::jsonb, $5, now() - make_interval(secs => $6)) returning id", [projectId, org, n, doc, note, hoursAgo * 3600])).rows[0]!.id;
}
async function exported(projectId: string, kind: string, options: Record<string, unknown>) {
  await db.query("insert into public.survey_exports (project_id, org_id, drawing_version, kind, sha256, size_bytes, options) values ($1, $2, 2, $3, $4, 100, $5::jsonb)", [projectId, org, kind, "a".repeat(64), JSON.stringify(options)]);
}
async function read(status: "settled" | "refunded", input: number, output: number, key: string) {
  await db.query(
    "insert into public.ai_credit_ledger (org_id, idempotency_key, operation, credits, status, model, input_tokens, output_tokens, settled_at) values ($1, $2, 'survey_read', 1, $3, 'claude-sonnet-5-5', $4, $5, now())",
    [org, key, status, input, output],
  );
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Surveys");
  // A: drawn, one press to confirm, one edit, a sketch read, approved two hours after the draft, its plan PDF and a CSV exported.
  const a = await project("Sample A");
  await run(a, "done", stages(400, 1_200));
  await version(a, 2, "Drawn by AutoSurvey from 1 file", 3);
  await version(a, 3, "Confirmed: Lot 1", 2.5);
  await version(a, 4, "Lots, roads and features", 2);
  const last = await version(a, 5, "Read 2 photos with Claude: 9 things as written", 1.5);
  await db.query("insert into public.survey_approvals (project_id, org_id, drawing_id, drawing_version, surveyor, content_sha256, approved_at) values ($1, $2, $3, 5, '{}'::jsonb, $4, now() - interval '1 hour')", [a, org, last, "b".repeat(64)]);
  await exported(a, "pdf", { paper: "A4" });
  await exported(a, "csv", {});
  // B: drawn and left as drawn; only its checks and sources report exported.
  const b = await project("Sample B");
  await run(b, "done", stages(600, 1_800));
  await version(b, 2, "Drawn by AutoSurvey from 2 files", 1);
  await exported(b, "pdf", { content: "report" });
  // C: a run stopped by a failed stage; D: a run gone quiet.
  await run(await project("Sample C"), "failed");
  const quiet = await run(await project("Sample D"), "running");
  await db.query("update public.survey_jobs set updated_at = now() - interval '20 minutes' where id = $1", [quiet]);
  await read("settled", 1_000, 200, "r1");
  await read("settled", 3_000, 400, "r2");
  await read("refunded", 0, 0, "r3");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("the owner's AutoSurvey success metrics query", () => {
  it("reads how runs ended, the server's time, what was changed by hand, approvals, exports and AI reads, from the script as written", async () => {
    const script = readFileSync("scripts/vps/autosurvey-metrics.ps1", "utf8").replace(/\r\n/g, "\n");
    const sql = /<<'SQL'\n([\s\S]*?)\nSQL\n/.exec(script)![1]!.replace(/^begin read only;\n/, "").replace(/\nrollback;$/, "");
    const rows = (await db.query<Record<string, string>>(sql.replace(/;\s*$/, ""))).rows.map((r) => Object.values(r) as [string, string]);
    expect(Object.fromEntries(rows)).toEqual({
      "plans generated in the last 30 days": "4",
      "plans drawn by AutoSurvey": "2",
      "runs stopped by a failed stage": "1",
      "runs cut off": "1",
      "runs finished after a cut-off": "0",
      "median upload to drawn plan on the server (s), 2 measured": "2.00",
      "median edits after the draft": "0.5",
      "plans with no edit after the draft": "1",
      "median confirmations after the draft": "0.5",
      "plans approved at least once": "1",
      "median draft to approval (h)": "2.0",
      "plans with the plan PDF exported": "1",
      "median files exported per plan": "1.5",
      "AI photo reads": "3",
      "AI photo reads refunded": "1",
      "median tokens per AI photo read (in, out)": "2000, 300",
      "AI photo read models": "claude-sonnet-5-5",
    });
  });

  it("only reads, in a transaction it rolls back (the test above shows every line it prints: counts, medians and model names)", async () => {
    const script = readFileSync("scripts/vps/autosurvey-metrics.ps1", "utf8").replace(/\r\n/g, "\n");
    expect(script).toContain("begin read only;\nwith gen as (");
    expect(script).toMatch(/\nrollback;\nSQL\n/);
    expect(script).not.toMatch(/\b(insert|update|delete|truncate|alter|drop|grant)\b/i);
  });
});
