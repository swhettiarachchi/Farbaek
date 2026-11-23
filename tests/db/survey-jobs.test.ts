/**
 * Migration v102: AutoSurvey's jobs (stage 229, ADR 0239). Members read their workspace's jobs; only the server writes them, through
 * the two functions; a finished job never changes; a job a restart cut off is marked interrupted by the sweep. SYNTHETIC values.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;
let otherOrg: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const STAGES = JSON.stringify([{ id: "draw", label: "Drawing the plan", state: "running" }]);
const start = (actor: string = USERS.alice, orgId = org, kind = "generate", stages = STAGES) =>
  q<{ id: string }>("select public.app_survey_job_start($1, $2, $3, $4, $5::jsonb) as id", [orgId, actor, project, kind, stages]).then((r) => r[0]!.id);
const update = (job: string, state: string, result = "{}", orgId = org) => q("select public.app_survey_job_update($1, $2, $3::jsonb, $4, $5::jsonb)", [orgId, job, STAGES, state, result]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Surveys");
  otherOrg = await createOrg(db, USERS.bob, "Bob Surveys");
  const doc = JSON.stringify({ schema: 1, boundary: [], features: [], labelOffsets: {}, layers: {}, sheet: {}, settings: {}, surveyorUserId: null });
  project = (await q<{ id: string }>("select public.app_survey_create_project($1, $2, 'Sample site', 'cadastral', 'EPSG:5235', true, $3::jsonb) as id", [org, USERS.alice, doc]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("survey jobs", () => {
  it("starts a running job for a contributor's project, which the workspace's members read and others don't", async () => {
    const id = await start();
    const mine = await as(db, "authenticated", USERS.alice, async () => (await db.query<{ state: string; stages: unknown }>("select state, stages from public.survey_jobs where id = $1", [id])).rows);
    expect(mine).toEqual([{ state: "running", stages: JSON.parse(STAGES) }]);
    const theirs = await as(db, "authenticated", USERS.bob, async () => (await db.query("select id from public.survey_jobs where id = $1", [id])).rows);
    expect(theirs).toEqual([]);
  });

  it("refuses a stranger, another workspace's project, and an unknown kind", async () => {
    await expect(start(USERS.bob)).rejects.toThrow();
    await expect(start(USERS.alice, org, "something")).rejects.toThrow(/INVALID_REQUEST/);
    // Bob's own workspace, with Alice's project: not his to run.
    await expect(start(USERS.bob, otherOrg)).rejects.toThrow();
  });

  it("records stages and the end, and never changes a finished job", async () => {
    const id = await start();
    await update(id, "done", JSON.stringify({ next: "/app/survey/x?step=plan" }));
    const [row] = await su<{ state: string; result: { next: string }; finished_at: string | null }>("select state, result, finished_at from public.survey_jobs where id = $1", [id]);
    expect(row).toMatchObject({ state: "done", result: { next: "/app/survey/x?step=plan" } });
    expect(row!.finished_at).not.toBeNull();
    await expect(update(id, "running")).rejects.toThrow(/NOT_FOUND/);
    // Another workspace can't write a running job.
    const live = await start();
    await expect(update(live, "done", "{}", otherOrg)).rejects.toThrow(/NOT_FOUND/);
  });

  it("can't be written or swept by a signed-in person or the public, only the server", async () => {
    const id = await start();
    for (const role of ["anon", "authenticated"] as const) {
      await expect(as(db, role, USERS.alice, () => db.query("select public.app_survey_job_update($1, $2, '[]'::jsonb, 'done', '{}'::jsonb)", [org, id]))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, USERS.alice, () => db.query("select public.app_survey_jobs_sweep()"))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, USERS.alice, () => db.query("update public.survey_jobs set state = 'done' where id = $1", [id]))).rejects.toThrow(/permission denied/);
    }
  });

  it("marks a job a restart cut off as interrupted after 15 minutes without word, and leaves a live one", async () => {
    const stale = await start();
    const live = await start();
    await su("update public.survey_jobs set updated_at = now() - interval '20 minutes' where id = $1", [stale]);
    const [swept] = await q<{ n: number }>("select public.app_survey_jobs_sweep() as n");
    expect(swept!.n).toBeGreaterThanOrEqual(1);
    const states = await su<{ id: string; state: string }>("select id, state from public.survey_jobs where id = any($1::uuid[])", [[stale, live]]);
    expect(Object.fromEntries(states.map((s) => [s.id, s.state]))).toEqual({ [stale]: "interrupted", [live]: "running" });
  });
});
