/**
 * Migration v34 (ADR 0062): Farbaek's signature for each ProofPack, recorded
 * by the server beside it. Members read it with the ProofPack; only the
 * service role writes it; a signature never changes once written.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let digest: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const asUser = async <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) => as(db, "authenticated", uid, async () => (await db.query<T>(sql, params)).rows);
const SIG = `${"A".repeat(86)}==`;
const KEY = "farbaek-0123456789abcdef";

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  const project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
  const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, 'Sign me') as id", [org, USERS.alice, project]))[0]!.id;
  digest = "d".repeat(64);
  await q("insert into public.proofpacks (digest, org_id, project_id, task_id, status, statement) values ($1, $2, $3, $4, 'verified', $5)", [
    digest,
    org,
    project,
    task,
    JSON.stringify({ _type: "https://in-toto.io/Statement/v1", subject: [], predicateType: "https://farbaek.dev/proofpack/v1", predicate: {} }),
  ]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("ProofPack signatures", () => {
  it("records the server's signature once, and keeps the first one", async () => {
    expect((await q<{ r: boolean }>("select public.app_record_proofpack_signature($1, $2, $3) as r", [digest, KEY, SIG]))[0]!.r).toBe(true);
    expect((await q<{ r: boolean }>("select public.app_record_proofpack_signature($1, $2, $3) as r", [digest, "farbaek-ffffffffffffffff", `${"B".repeat(86)}==`]))[0]!.r).toBe(false);
    expect(await q("select keyid, sig, org_id from public.proofpack_signatures where digest = $1", [digest])).toEqual([{ keyid: KEY, sig: SIG, org_id: org }]);
  });

  it("is read by the workspace's members only", async () => {
    expect(await asUser(USERS.alice, "select keyid from public.proofpack_signatures")).toEqual([{ keyid: KEY }]);
    expect(await asUser(USERS.bob, "select keyid from public.proofpack_signatures")).toEqual([]);
  });

  it("is written only by the server, never changed, and only for a ProofPack that exists", async () => {
    await expect(asUser(USERS.alice, "select public.app_record_proofpack_signature($1, $2, $3)", [digest, KEY, SIG])).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, "insert into public.proofpack_signatures (digest, org_id, keyid, sig) values ($1, $2, $3, $4)", ["e".repeat(64), org, KEY, SIG])).rejects.toThrow(/permission denied/);
    await expect(q("update public.proofpack_signatures set sig = $2 where digest = $1", [digest, `${"C".repeat(86)}==`])).rejects.toThrow(/PROOFPACK_SIGNATURE_IMMUTABLE/);
    await expect(q("select public.app_record_proofpack_signature($1, $2, $3)", ["f".repeat(64), KEY, SIG])).rejects.toThrow(/NOT_FOUND/);
  });

  it("refuses a key id or signature that isn't the right shape", async () => {
    await expect(q("insert into public.proofpack_signatures (digest, org_id, keyid, sig) values ($1, $2, 'someone-else', $3)", [digest, org, SIG])).rejects.toThrow();
    await expect(q("insert into public.proofpack_signatures (digest, org_id, keyid, sig) values ($1, $2, $3, 'short')", [digest, org, KEY])).rejects.toThrow();
  });
});
