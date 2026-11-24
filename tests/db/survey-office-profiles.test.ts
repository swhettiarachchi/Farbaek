/**
 * Migration v105: office profiles (stage 248, ADR 0256). Members read their workspace's profiles and every saved version; only the
 * server writes, through the three functions (saving and archiving audited); a save from an old version is refused; a surveyor's
 * choice is theirs to read, and choosing none forgets it. SYNTHETIC values.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const BODY = JSON.stringify({ crsId: "EPSG:5235", equipment: [], codes: null, sheet: null, statement: "" });
const save = (name: string, profile: string | null = null, base: number | null = null, actor: string = USERS.alice, orgId = org, body = BODY) =>
  q<{ id: string; version: number }>("select * from public.app_survey_profile_save($1, $2, $3, $4, $5, $6::jsonb)", [orgId, actor, profile, base, name, body]).then((r) => r[0]!);
const readAs = (user: string, sql: string, params: unknown[] = []) => as(db, "authenticated", user, async () => (await db.query(sql, params)).rows);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Surveys");
  otherOrg = await createOrg(db, USERS.bob, "Bob Surveys");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("office profiles", () => {
  it("creates a profile at version 1, which the workspace's members read and others don't", async () => {
    const p = await save("Sokkia office");
    expect(p.version).toBe(1);
    expect(await readAs(USERS.alice, "select name, version from public.survey_office_profiles where id = $1", [p.id])).toEqual([{ name: "Sokkia office", version: 1 }]);
    expect(await readAs(USERS.bob, "select id from public.survey_office_profiles where id = $1", [p.id])).toEqual([]);
  });

  it("saves a new version from the current one, keeps every version, and refuses a save from an old one", async () => {
    const p = await save("Leica office");
    const v2 = await save("Leica office (GSI)", p.id, 1);
    expect(v2).toEqual({ id: p.id, version: 2 });
    await expect(save("Leica office again", p.id, 1)).rejects.toThrow(/VERSION_CONFLICT/);
    expect(await readAs(USERS.alice, "select version, name from public.survey_office_profile_versions where profile_id = $1 order by version", [p.id])).toEqual([
      { version: 1, name: "Leica office" },
      { version: 2, name: "Leica office (GSI)" },
    ]);
    const audits = await su<{ n: number }>("select count(*)::int as n from public.audit_events where target = $1 and action = 'survey.office_profile_saved'", [p.id]);
    expect(audits[0]!.n).toBe(2);
  });

  it("refuses a stranger, another workspace's profile, a blank name and a body that isn't an object", async () => {
    await expect(save("Bob's", null, null, USERS.bob)).rejects.toThrow();
    const p = await save("Alice's");
    await expect(save("Taken over", p.id, 1, USERS.bob, otherOrg)).rejects.toThrow(/NOT_FOUND/);
    await expect(save("   ")).rejects.toThrow(/INVALID_REQUEST/);
    await expect(save("List", null, null, USERS.alice, org, "[]")).rejects.toThrow(/INVALID_REQUEST/);
  });

  it("remembers each surveyor's choice for them alone, and archiving a profile drops it from choices but keeps its versions", async () => {
    const p = await save("Chosen");
    await q("select public.app_survey_profile_choose($1, $2, $3)", [org, USERS.alice, p.id]);
    expect(await readAs(USERS.alice, "select profile_id from public.survey_office_profile_choices where org_id = $1", [org])).toEqual([{ profile_id: p.id }]);
    expect(await readAs(USERS.bob, "select profile_id from public.survey_office_profile_choices where org_id = $1", [org])).toEqual([]);
    await q("select public.app_survey_profile_archive($1, $2, $3)", [org, USERS.alice, p.id]);
    expect(await su("select profile_id from public.survey_office_profile_choices where profile_id = $1", [p.id])).toEqual([]);
    expect((await su("select version from public.survey_office_profile_versions where profile_id = $1", [p.id])).length).toBe(1);
    await expect(q("select public.app_survey_profile_choose($1, $2, $3)", [org, USERS.alice, p.id])).rejects.toThrow(/NOT_FOUND/);
    // Choosing none forgets the choice.
    const other = await save("Other");
    await q("select public.app_survey_profile_choose($1, $2, $3)", [org, USERS.alice, other.id]);
    await q("select public.app_survey_profile_choose($1, $2, null)", [org, USERS.alice]);
    expect(await su("select profile_id from public.survey_office_profile_choices where org_id = $1 and user_id = $2", [org, USERS.alice])).toEqual([]);
    await expect(save("Revived", p.id, 1)).rejects.toThrow(/NOT_FOUND/);
  });

  it("lets nobody but the server call the functions or write the tables", async () => {
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("select * from public.app_survey_profile_save($1, $2, null, null, 'x', '{}'::jsonb)", [org, USERS.alice]))).rejects.toThrow();
    await expect(as(db, "authenticated", USERS.alice, async () => db.query("insert into public.survey_office_profiles (org_id, name, body, created_by, updated_by) values ($1, 'x', '{}', $2, $2)", [org, USERS.alice]))).rejects.toThrow();
  });
});
