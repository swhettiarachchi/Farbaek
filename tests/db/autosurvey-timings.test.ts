/**
 * The owner's read-only timings query (scripts/vps/autosurvey-timings.ps1, stage 235), taken from the script itself and run against
 * the real migrations, so the script can't drift from the schema. SYNTHETIC jobs with measured stages.
 */
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const stages = (importMs: number, drawMs: number) =>
  JSON.stringify([
    { id: "import", label: "Importing 1 file", state: "done", ms: importMs },
    { id: "draw", label: "Drawing the plan", state: "done", ms: drawMs },
    { id: "sketches", label: "No sketches to read", state: "skipped" },
  ]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Surveys");
  const doc = JSON.stringify({ schema: 1, boundary: [], features: [], labelOffsets: {}, layers: {}, sheet: {}, settings: {}, surveyorUserId: null });
  project = (await q<{ id: string }>("select public.app_survey_create_project($1, $2, 'Sample site', 'cadastral', 'EPSG:5235', true, $3::jsonb) as id", [org, USERS.alice, doc]))[0]!.id;
  // Three finished runs, timed, and one cut off.
  for (const [i, d] of [[400, 1_200], [600, 1_800], [800, 2_400]] as const) {
    const id = (await q<{ id: string }>("select public.app_survey_job_start($1, $2, $3, 'generate', $4::jsonb) as id", [org, USERS.alice, project, stages(i, d)]))[0]!.id;
    await q("select public.app_survey_job_update($1, $2, $3::jsonb, 'done', '{}'::jsonb)", [org, id, stages(i, d)]);
  }
  const cut = (await q<{ id: string }>("select public.app_survey_job_start($1, $2, $3, 'generate', '[]'::jsonb) as id", [org, USERS.alice, project]))[0]!.id;
  // As the database owner, as the script runs in production: a run gone quiet an hour ago, closed by the sweep.
  await db.query("update public.survey_jobs set updated_at = now() - interval '1 hour' where id = $1", [cut]);
  await db.query("select public.app_survey_jobs_sweep()");
  // A run gone quiet with no sweep since (no timer runs it yet): still "running" in the table, cut off as the page shows it.
  const quiet = (await q<{ id: string }>("select public.app_survey_job_start($1, $2, $3, 'generate', '[]'::jsonb) as id", [org, USERS.alice, project]))[0]!.id;
  await db.query("update public.survey_jobs set updated_at = now() - interval '20 minutes' where id = $1", [quiet]);
  // A run finished three hours after it was cut off: counted on its own, and kept out of the start-to-finish times.
  const later = (await q<{ id: string }>("select public.app_survey_job_start($1, $2, $3, 'generate', $4::jsonb) as id", [org, USERS.alice, project, stages(500, 1_500)]))[0]!.id;
  await q("select public.app_survey_job_update($1, $2, $3::jsonb, 'done', '{\"finishedLater\": true}'::jsonb)", [org, later, stages(500, 1_500)]);
  await db.query("update public.survey_jobs set started_at = now() - interval '3 hours' where id = $1", [later]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("the owner's AutoSurvey timings query", () => {
  it("reads runs, how they ended, and the median time of each stage, from the script as written", async () => {
    const script = readFileSync("scripts/vps/autosurvey-timings.ps1", "utf8").replace(/\r\n/g, "\n");
    const sql = /<<'SQL'\n([\s\S]*?)\nSQL\n/.exec(script)![1]!.replace(/^begin read only;\n/, "").replace(/\nrollback;$/, "");
    const rows = (await db.query<Record<string, string>>(sql.replace(/;\s*$/, ""))).rows.map((r) => Object.values(r) as [string, string]);
    const read = Object.fromEntries(rows);
    expect(read["runs in the last 30 days"]).toBe("6");
    expect(read["finished"]).toBe("3");
    expect(read["finished after a cut-off"]).toBe("1");
    expect(read["cut off"]).toBe("2");
    expect(read["median import (s), 4 measured"]).toBe("0.55");
    expect(read["median draw (s), 4 measured"]).toBe("1.65");
    expect(read["median start to finish, finished runs (s)"]).toMatch(/^\d+(\.\d)?$/);
    // The run finished three hours later would make the slowest 10,800 s; it's left out.
    expect(Number(read["slowest start to finish, finished runs (s)"])).toBeLessThan(60);
  });
});
