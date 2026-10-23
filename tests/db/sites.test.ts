/**
 * Migration 19: published sites. A contributor publishes exactly the
 * project's current files, gated in the database by a finished security
 * check of those files with nothing critical; each publish is a numbered
 * deployment; the site can roll back or unpublish; members read their own
 * workspace's sites only, and only the server writes.
 *
 * Migration 33: the evidence gate. The latest applied change needs a
 * verified ProofPack with nothing changed since, or an owner or admin
 * publishes with a reason, kept on the version and in the audit log.
 */
import { randomBytes } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const DIGEST = "d".repeat(64);

async function importFiles(files: { path: string; content: string }[], p = project) {
  await q("select public.app_import_files($1, $2, $3, 524288, 4194304, 26214400, 3000)", [p, USERS.alice, JSON.stringify(files)]);
}

/** The project's current files as the server would send them. */
async function currentFiles(p = project) {
  return admin<{ path: string; revision: number; sha256: string; size: number }>(
    "select path, revision, sha256, size_bytes as size from public.project_files where project_id = $1 order by path",
    [p],
  );
}

async function check(critical = 0, p = project) {
  const id = (await q<{ id: string }>("select public.app_start_security_report($1, $2, $3) as id", [org, USERS.alice, p]))[0]!.id;
  const statement = { predicateType: "https://farbaek.dev/security-report/v1", predicate: {} };
  await q("select public.app_finish_security_report($1, 'done', 90, 'A', $2, $3, $4, null)", [id, JSON.stringify({ critical, high: 0, medium: 0, low: 0, info: 0 }), JSON.stringify(statement), "c".repeat(64)]);
  return id;
}

// These projects have no ProofPacks, so an owner publishes them with a reason (v33).
const REASON = "No agent changes in this project yet.";
const publish = async (name: string, report: string, files?: unknown, actor: string = USERS.alice, p = project, reason: string | null = REASON, o = org) =>
  (await q<{ id: string }>("select public.app_publish_site($1, $2, $3, $4, $5, $6, $7, $8) as id", [o, actor, p, name, JSON.stringify(files ?? (await currentFiles(p))), DIGEST, report, reason]))[0]!.id;

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Bakery', null, null) as id", [org, USERS.alice]))[0]!.id;
  await importFiles([
    { path: "index.html", content: "<h1>Bakery</h1>" },
    { path: "styles.css", content: "h1 { color: green }" },
  ]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("published sites", () => {
  it("publishes the current files after a passing check, as deployment 1, and makes it live", async () => {
    const report = await check();
    const id = await publish("sunrise-bakery", report);
    expect(await admin("select name, live_deployment_id = $1 as live from public.sites where project_id = $2", [id, project])).toEqual([{ name: "sunrise-bakery", live: true }]);
    expect(await admin("select number, file_count, digest, security_score from public.site_deployments where id = $1", [id])).toEqual([{ number: 1, file_count: 2, digest: DIGEST, security_score: 90 }]);
    expect(await admin("select action from public.audit_events where target = $1", [id])).toEqual([{ action: "site.published" }]);
  });

  it("refuses without a check, after the files changed, with critical findings, or with a different file list", async () => {
    const running = (await q<{ id: string }>("select public.app_start_security_report($1, $2, $3) as id", [org, USERS.alice, project]))[0]!.id;
    await expect(publish("sunrise-bakery", running)).rejects.toThrow(/CHECK_REQUIRED/);
    await q("select public.app_finish_security_report($1, 'failed', null, null, null, null, null, 'x')", [running]);

    const stale = await check();
    await admin("update public.security_reports set started_at = now() - interval '1 hour' where id = $1", [stale]);
    await importFiles([{ path: "about.html", content: "<p>About</p>" }]);
    await expect(publish("sunrise-bakery", stale)).rejects.toThrow(/CHECK_STALE/);

    const critical = await check(1);
    await expect(publish("sunrise-bakery", critical)).rejects.toThrow(/CRITICAL_FINDINGS/);

    const fresh = await check();
    const files = await currentFiles();
    await expect(publish("sunrise-bakery", fresh, files.slice(1))).rejects.toThrow(/FILES_CHANGED/);
    await expect(publish("sunrise-bakery", fresh, files.map((f) => ({ ...f, revision: f.revision + 1 })))).rejects.toThrow(/FILES_CHANGED/);
    // The same report can't be used for another project's files.
    const other = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Other', null, null) as id", [org, USERS.alice]))[0]!.id;
    await importFiles([{ path: "index.html", content: "<p>Other</p>" }], other);
    await expect(publish("other-site", fresh, undefined, USERS.alice, other)).rejects.toThrow(/CHECK_REQUIRED/);
  });

  it("numbers deployments, rolls back to an earlier one and unpublishes", async () => {
    const second = await publish("sunrise-bakery", await check());
    expect(await admin<{ number: number }>("select number from public.site_deployments where id = $1", [second])).toEqual([{ number: 2 }]);
    const rows = await admin<{ id: string; first: string }>(
      "select s.id, d.id as first from public.sites s join public.site_deployments d on d.site_id = s.id and d.number = 1 where s.project_id = $1",
      [project],
    );
    const { id: site, first } = rows[0]!;
    await q("select public.app_set_live_deployment($1, $2, $3, $4)", [org, USERS.alice, site, first]);
    expect(await admin("select live_deployment_id = $1 as live from public.sites where id = $2", [first, site])).toEqual([{ live: true }]);
    await q("select public.app_set_live_deployment($1, $2, $3, null)", [org, USERS.alice, site]);
    expect(await admin("select live_deployment_id from public.sites where id = $1", [site])).toEqual([{ live_deployment_id: null }]);
    expect((await admin<{ action: string }>("select action from public.audit_events where target = $1 order by id", [site])).map((r) => r.action)).toEqual(["site.rolled_back", "site.unpublished"]);
  });

  it("keeps names unique and valid, and refuses Farbaek's own", async () => {
    const other = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Second', null, null) as id", [org, USERS.alice]))[0]!.id;
    await importFiles([{ path: "index.html", content: "<p>Second</p>" }], other);
    const report = await check(0, other);
    await expect(publish("sunrise-bakery", report, undefined, USERS.alice, other)).rejects.toThrow(/NAME_TAKEN/);
    for (const bad of ["www", "admin", "p-preview", "Bad_Name", "ab", "my--site", "-edge"]) {
      await expect(publish(bad, report, undefined, USERS.alice, other)).rejects.toThrow(/INVALID_NAME/);
    }
    await publish("second-site", report, undefined, USERS.alice, other);
  });

  it("needs a contributor, and is read by members only and written by the server only", async () => {
    await expect(publish("bobs-site", await check(), undefined, USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    expect((await as(db, "authenticated", USERS.alice, async () => (await db.query("select name from public.sites")).rows)).length).toBeGreaterThan(0);
    expect(await as(db, "authenticated", USERS.bob, async () => (await db.query("select name from public.sites")).rows)).toEqual([]);
    expect(await as(db, "authenticated", USERS.bob, async () => (await db.query("select id from public.site_deployments")).rows)).toEqual([]);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("update public.sites set name = 'hijack'"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_set_live_deployment($1, $2, $3, null)", [org, USERS.alice, org]))).rejects.toThrow(/permission denied/);
  });
});

describe("the evidence gate", () => {
  let evOrg: string;
  let ev: string;
  const hex = () => randomBytes(32).toString("hex");

  async function evCheck() {
    const id = (await q<{ id: string }>("select public.app_start_security_report($1, $2, $3) as id", [evOrg, USERS.alice, ev]))[0]!.id;
    await q("select public.app_finish_security_report($1, 'done', 90, 'A', $2, $3, $4, null)", [id, JSON.stringify({ critical: 0, high: 0, medium: 0, low: 0, info: 0 }), JSON.stringify({ predicateType: "https://farbaek.dev/security-report/v1", predicate: {} }), "c".repeat(64)]);
    return id;
  }
  const evPublish = async (reason: string | null, actor: string = USERS.alice) => publish("evidence-site", await evCheck(), undefined, actor, ev, reason, evOrg);

  /** A ProofPack as applying a change writes it, or as a check run of that change appends it. */
  async function pack(status: string, verifies?: string) {
    const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, 'A change') as id", [evOrg, USERS.alice, ev]))[0]!.id;
    const digest = hex();
    const predicate = { status, ...(verifies ? { verification: { receipt: hex(), appliedProofPack: verifies } } : {}) };
    await admin("insert into public.proofpacks (digest, org_id, project_id, task_id, status, statement) values ($1, $2, $3, $4, $5, $6)", [digest, evOrg, ev, task, status, JSON.stringify({ _type: "https://in-toto.io/Statement/v1", predicate })]);
    return digest;
  }
  const deployment = async (id: string) =>
    (await admin("select evidence, evidence_proofpack, override_reason from public.site_deployments where id = $1", [id]))[0];
  const audit = async (id: string) =>
    (await admin<{ metadata: Record<string, unknown> }>("select metadata from public.audit_events where target = $1 and action = 'site.published'", [id]))[0]!.metadata;

  beforeAll(async () => {
    evOrg = await createOrg(db, USERS.alice, "Evidence Co");
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [evOrg, USERS.bob]);
    ev = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Evidence', null, null) as id", [evOrg, USERS.alice]))[0]!.id;
    await importFiles([{ path: "index.html", content: "<h1>Evidence</h1>" }], ev);
  });

  it("refuses a project with no ProofPack unless an owner says why, and records the reason", async () => {
    await expect(evPublish(null)).rejects.toThrow(/EVIDENCE_REQUIRED/);
    await expect(evPublish("   ")).rejects.toThrow(/EVIDENCE_REQUIRED/);
    await expect(evPublish("too short")).rejects.toThrow(/REASON_REQUIRED/);
    await expect(evPublish("A member can't decide this.", USERS.bob)).rejects.toThrow(/OVERRIDE_FORBIDDEN/);
    // A call from before v33, with no reason, resolves and is refused.
    const files = JSON.stringify(await currentFiles(ev));
    await expect(q("select public.app_publish_site($1, $2, $3, 'evidence-site', $4, $5, $6)", [evOrg, USERS.alice, ev, files, DIGEST, await evCheck()])).rejects.toThrow(/EVIDENCE_REQUIRED/);

    const id = await evPublish("  Hand-made page, reviewed by me.  ");
    expect(await deployment(id)).toEqual({ evidence: "none", evidence_proofpack: null, override_reason: "Hand-made page, reviewed by me." });
    expect(await audit(id)).toMatchObject({ evidence: "none", proofpack: null, override: "Hand-made page, reviewed by me." });
  });

  it("publishes a verified change without a reason, and names its ProofPack", async () => {
    const change = await pack("unverified");
    await expect(evPublish(null)).rejects.toThrow(/EVIDENCE_REQUIRED/);
    const verified = await pack("verified", change);
    const id = await evPublish("Ignored, because it's verified.");
    expect(await deployment(id)).toEqual({ evidence: "verified", evidence_proofpack: verified, override_reason: null });
    expect(await audit(id)).toMatchObject({ evidence: "verified", proofpack: verified, override: null });
  });

  it("goes by the latest applied change, not the newest ProofPack", async () => {
    const first = await pack("unverified");
    const second = await pack("unverified");
    // The first change's check run lands after the second change was applied.
    await pack("verified", first);
    await expect(evPublish(null)).rejects.toThrow(/EVIDENCE_REQUIRED/);
    const id = await evPublish("Second change checked by hand.");
    expect(await deployment(id)).toMatchObject({ evidence: "unverified", evidence_proofpack: second });

    const partly = await pack("partially_verified", second);
    const again = await evPublish("Only the slow test failed.");
    expect(await deployment(again)).toMatchObject({ evidence: "partially_verified", evidence_proofpack: partly });
  });

  it("needs a reason again once a file changes after the verified change", async () => {
    const change = await pack("unverified");
    await pack("verified", change);
    await evPublish(null);
    await importFiles([{ path: "about.html", content: "<p>Edited by hand</p>" }], ev);
    await expect(evPublish(null)).rejects.toThrow(/EVIDENCE_REQUIRED/);
    const id = await evPublish("Small copy edit after the check.");
    expect(await deployment(id)).toEqual({ evidence: "changed", evidence_proofpack: change, override_reason: "Small copy edit after the check." });
  });

  it("keeps the record consistent: a reason exactly when the evidence isn't verified", async () => {
    const [any] = await admin<{ id: string }>("select id from public.site_deployments where evidence = 'none' limit 1");
    await expect(admin("update public.site_deployments set override_reason = null where id = $1", [any!.id])).rejects.toThrow(/site_deployments_override/);
  });
});
