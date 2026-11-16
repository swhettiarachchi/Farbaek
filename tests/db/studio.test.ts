/**
 * The image and video studios (v100, stage 201, ADR 0216): private media, uploads to work from, a video that renders in a
 * working row, per-person room, and what goes when someone leaves the workspace.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USAGE_OPERATIONS } from "@/config/usage";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const asUser = async <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) => as(db, "authenticated", uid, async () => (await db.query<T>(sql, params)).rows);

const BATCH = "00000000-0000-4000-8000-0000000000b1";
const SHA = "a".repeat(64);

const save = (kind = "image", actor: string = USERS.alice, size = 3, parent: string | null = null, mime = "image/webp") =>
  q<{ id: string }>(
    "select public.app_studio_save($1, $2, $3, $4, 'A loaf on a linen cloth', '{\"shape\":\"1:1\"}'::jsonb, 'gpt-image-2.5-sunburst', $5, $6, $7, $8, 'AAAA', 1024, 1024) as id",
    [org, actor, BATCH, kind, parent, mime, size, SHA],
  ).then((r) => r[0]!.id);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Bakery");
  await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("the studios (v100)", () => {
  it("meters video as its own operation", async () => {
    expect(USAGE_OPERATIONS).toContain("video_generation");
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const grant = JSON.stringify({ kind: "plan", units: 1_000, starts_at: from, expires_at: to, source_key: "plan:video" });
    await expect(q("select public.app_reserve_usage($1, $2, 'k-video', 'video_generation', null, 5, $3)", [org, USERS.alice, grant])).resolves.toHaveLength(1);
  });

  it("keeps what someone makes private to them", async () => {
    const id = await save();
    expect(await asUser(USERS.alice, "select id, prompt, status from public.studio_media where id = $1", [id])).toEqual([{ id, prompt: "A loaf on a linen cloth", status: "ready" }]);
    expect(await asUser(USERS.bob, "select id from public.studio_media where id = $1", [id])).toEqual([]);
    await expect(asUser(USERS.alice, "insert into public.studio_media (org_id, owner_id, batch_id, kind) values ($1, $2, $3, 'image')", [org, USERS.alice, BATCH])).rejects.toThrow();
    await expect(asUser(USERS.alice, "select public.app_studio_delete($1, $2, $3)", [org, USERS.alice, id])).rejects.toThrow();
  });

  it("works from the person's own picture only", async () => {
    const upload = await save("upload");
    await expect(save("image", USERS.alice, 3, upload)).resolves.toBeTruthy();
    await expect(save("image", USERS.bob, 3, upload)).rejects.toThrow(/NOT_FOUND/);
  });

  it("refuses bytes that don't fit their kind", async () => {
    await expect(save("image", USERS.alice, 3, null, "video/mp4")).rejects.toThrow();
    await expect(save("image", USERS.alice, 9_000_000)).rejects.toThrow(/FILE_TOO_LARGE/);
  });

  it("renders a video in a working row, then keeps it or says why it failed", async () => {
    const begin = () =>
      q<{ id: string }>("select public.app_studio_begin($1, $2, $3, 'Waves at dawn', '{\"seconds\":8}'::jsonb, 'gemini-omni-1.2-flash', null) as id", [org, USERS.alice, BATCH]).then((r) => r[0]!.id);
    const video = await begin();
    expect(await asUser(USERS.alice, "select status, content from public.studio_media where id = $1", [video])).toEqual([{ status: "working", content: null }]);
    await q("select public.app_studio_finish($1, $2, $3, 'video/mp4', 4, $4, 'AAAA', 1280, 720, 8000)", [org, USERS.alice, video, SHA]);
    expect(await asUser(USERS.alice, "select status, duration_ms from public.studio_media where id = $1", [video])).toEqual([{ status: "ready", duration_ms: 8000 }]);
    await expect(q("select public.app_studio_finish($1, $2, $3, 'video/mp4', 4, $4, 'AAAA', 1280, 720, 8000)", [org, USERS.alice, video, SHA])).rejects.toThrow(/NOT_FOUND/);

    const failed = await begin();
    await q("select public.app_studio_fail($1, $2, $3, 'The video service is busy.')", [org, USERS.alice, failed]);
    expect(await asUser(USERS.alice, "select status, error from public.studio_media where id = $1", [failed])).toEqual([{ status: "failed", error: "The video service is busy." }]);
  });

  it("allows three renders at once, and marks one left for 15 minutes as failed", async () => {
    const begin = () => q("select public.app_studio_begin($1, $2, $3, 'Rain', '{}'::jsonb, 'gemini-omni-1.2-flash', null)", [org, USERS.bob, BATCH]);
    await begin();
    await begin();
    await begin();
    await expect(begin()).rejects.toThrow(/TOO_MANY_RENDERS/);
    await su("update public.studio_media set created_at = now() - interval '20 minutes' where owner_id = $1 and status = 'working'", [USERS.bob]);
    await expect(begin()).resolves.toHaveLength(1);
    expect((await su<{ n: number }>("select count(*)::int as n from public.studio_media where owner_id = $1 and status = 'failed'", [USERS.bob]))[0]!.n).toBe(3);
  });

  it("keeps each person within their room", async () => {
    await su("insert into public.studio_media (org_id, owner_id, batch_id, kind, status, mime, size_bytes, sha256, content) values ($1, $2, $3, 'video', 'ready', 'video/mp4', 20971520, $4, 'AAAA')", [org, USERS.bob, BATCH, SHA]);
    for (let i = 0; i < 24; i++) {
      await su("insert into public.studio_media (org_id, owner_id, batch_id, kind, status, mime, size_bytes, sha256, content) values ($1, $2, $3, 'video', 'ready', 'video/mp4', 20971520, $4, 'AAAA')", [org, USERS.bob, BATCH, SHA]);
    }
    await expect(save("image", USERS.bob)).rejects.toThrow(/STORAGE_FULL/);
  });

  it("deletes an item of the person's own, and everything when they leave", async () => {
    const id = await save();
    await expect(q("select public.app_studio_delete($1, $2, $3)", [org, USERS.bob, id])).rejects.toThrow(/NOT_FOUND/);
    await q("select public.app_studio_delete($1, $2, $3)", [org, USERS.alice, id]);
    expect(await su("select id from public.studio_media where id = $1", [id])).toEqual([]);
    await su("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
    expect((await su<{ n: number }>("select count(*)::int as n from public.studio_media where owner_id = $1", [USERS.bob]))[0]!.n).toBe(0);
  });
});
