/**
 * Migration v103: the sketch photos a plan's readings came from (stage 230, ADR 0240). Members read them; only the server keeps them,
 * each photo's SHA-256 checked against its bytes, within 2 MB a photo, 6 a read and 50 MB a project. SYNTHETIC bytes.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;
let project: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const photo = (bytes: Buffer, name = "sketch.jpg", mime = "image/jpeg", sha = createHash("sha256").update(bytes).digest("hex")) => ({ name, mime, sha256: sha, content: bytes.toString("base64") });
const keep = (photos: unknown[], actor: string = USERS.alice, orgId = org, readAt = "2026-11-23T10:00:00.000Z") =>
  q<{ n: number }>("select public.app_survey_keep_sketches($1, $2, $3, $4, $5::jsonb) as n", [orgId, actor, project, readAt, JSON.stringify(photos)]).then((r) => r[0]!.n);

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

describe("sketch photos kept with a plan", () => {
  it("keeps one read's photos in order, which the workspace's members read and others don't", async () => {
    expect(await keep([photo(Buffer.from("first photo")), photo(Buffer.from("second photo"), "b.png", "image/png")])).toBe(2);
    const mine = await as(db, "authenticated", USERS.alice, async () => (await db.query<{ position: number; file_name: string; size_bytes: number }>("select position, file_name, size_bytes from public.survey_sketch_photos where project_id = $1 order by position", [project])).rows);
    expect(mine).toEqual([
      { position: 0, file_name: "sketch.jpg", size_bytes: 11 },
      { position: 1, file_name: "b.png", size_bytes: 12 },
    ]);
    const theirs = await as(db, "authenticated", USERS.bob, async () => (await db.query("select id from public.survey_sketch_photos where project_id = $1", [project])).rows);
    expect(theirs).toEqual([]);
  });

  it("refuses a photo whose bytes don't match its SHA-256, a type that isn't a picture, too many, and a stranger", async () => {
    await expect(keep([photo(Buffer.from("x"), "a.jpg", "image/jpeg", "0".repeat(64))], USERS.alice, org, "r2")).rejects.toThrow(/INVALID_REQUEST/);
    await expect(keep([photo(Buffer.from("x"), "a.svg", "image/svg+xml")], USERS.alice, org, "r3")).rejects.toThrow(/INVALID_REQUEST/);
    await expect(keep(Array.from({ length: 7 }, (_, i) => photo(Buffer.from(`p${i}`))), USERS.alice, org, "r4")).rejects.toThrow(/INVALID_REQUEST/);
    await expect(keep([photo(Buffer.from("x"))], USERS.bob, otherOrg, "r5")).rejects.toThrow();
  });

  it("replaces an earlier read's photos with a new read's, so repeated reads never fill the project", async () => {
    const big = Buffer.alloc(1_900_000, 7);
    for (let i = 0; i < 6; i++) await keep([photo(big), photo(big), photo(big), photo(big), photo(big), photo(big)], USERS.alice, org, `read${i}`);
    const rows = await q<{ read_at: string }>("select distinct read_at from public.survey_sketch_photos where project_id = $1", [project]);
    expect(rows).toEqual([{ read_at: "read5" }]);
  }, 60_000);

  it("can't be written by a signed-in person or the public, only the server", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(as(db, role, USERS.alice, () => db.query("select public.app_survey_keep_sketches($1, $2, $3, 'x', '[]'::jsonb)", [org, USERS.alice, project]))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, USERS.alice, () => db.query("delete from public.survey_sketch_photos where project_id = $1", [project]))).rejects.toThrow(/permission denied/);
    }
  });
});
