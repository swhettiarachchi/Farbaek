/**
 * Migration v24 (ADR 0033): live-site health checks. Only the server
 * records them, for a member, against one of the site's own deployments, at
 * most six a minute per site; members read their own workspace's checks.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let site: string;
let deployment: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const asUser = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => as(db, "authenticated", user, async () => (await db.query<T>(sql, params)).rows);
const record = (actor: string, verdict = "live", dep = deployment) =>
  q<{ id: number }>("select public.app_record_site_health($1, $2, $3, $4, 200, 140, 'Answered 200 in 140 ms with exactly these files.') as id", [actor, site, dep, verdict]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  const project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Bakery', null, null) as id", [org, USERS.alice]))[0]!.id;
  await q("select public.app_import_files($1, $2, $3, 524288, 4194304, 26214400, 3000)", [project, USERS.alice, JSON.stringify([{ path: "index.html", content: "<h1>Bakery</h1>" }])]);
  const report = (await q<{ id: string }>("select public.app_start_security_report($1, $2, $3) as id", [org, USERS.alice, project]))[0]!.id;
  await q("select public.app_finish_security_report($1, 'done', 90, 'A', $2, $3, $4, null)", [report, JSON.stringify({ critical: 0, high: 0, medium: 0, low: 0, info: 0 }), JSON.stringify({ predicateType: "https://farbaek.dev/security-report/v1", predicate: {} }), "c".repeat(64)]);
  const files = (await db.query("select path, revision, sha256, size_bytes as size from public.project_files where project_id = $1", [project])).rows;
  deployment = (await q<{ id: string }>("select public.app_publish_site($1, $2, $3, 'sunrise-bakery', $4, $5, $6) as id", [org, USERS.alice, project, JSON.stringify(files), "d".repeat(64), report]))[0]!.id;
  site = (await db.query<{ id: string }>("select id from public.sites where project_id = $1", [project])).rows[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("live-site health checks", () => {
  it("records a check for a member and lets the workspace read it", async () => {
    await record(USERS.alice);
    expect(await asUser(USERS.alice, "select verdict, status_code, ms, detail from public.site_health_checks")).toEqual([
      { verdict: "live", status_code: 200, ms: 140, detail: "Answered 200 in 140 ms with exactly these files." },
    ]);
    expect(await asUser(USERS.bob, "select id from public.site_health_checks")).toEqual([]);
  });

  it("refuses a non-member, another site's deployment and an unknown verdict", async () => {
    await expect(record(USERS.bob)).rejects.toThrow(/NOT_FOUND/);
    await expect(record(USERS.alice, "live", crypto.randomUUID())).rejects.toThrow(/NOT_FOUND/);
    await expect(record(USERS.alice, "great")).rejects.toThrow(/INVALID_CHECK/);
  });

  it("checks a site at most six times a minute, and only through the server", async () => {
    for (let i = 0; i < 5; i += 1) await record(USERS.alice, "previous");
    await expect(record(USERS.alice)).rejects.toThrow(/CHECK_LIMIT/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_record_site_health($1, $2, $3, 'live', 200, 1, 'x')", [USERS.alice, site, deployment]))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, "insert into public.site_health_checks (org_id, site_id, deployment_id, verdict, ms, detail) values ($1, $2, $3, 'live', 1, 'x')", [org, site, deployment])).rejects.toThrow(/permission denied/);
  });
});
