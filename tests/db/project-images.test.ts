/**
 * Migration v68 (ADR 0108): images in projects. An image is a file revision
 * holding base64, hashed and sized over its decoded bytes by the database;
 * only image paths take images, and the text write refuses image paths.
 * Mock data: a tiny real PNG.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

// A 1x1 transparent PNG.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG_BYTES = Buffer.from(PNG, "base64");
const LIMITS = { file: 1024, project: 8192, files: 20 };

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);

const saveImage = (path: string, base64: string, expected: number, limits = LIMITS) =>
  asService(async () => (await db.query<{ rev: number }>("select public.app_save_binary_file($1, $2, $3, $4, $5, $6, $7, $8) as rev", [project, USERS.alice, path, base64, expected, limits.file, limits.project, limits.files])).rows[0]!.rev);
const saveText = (path: string, content: string, expected: number) =>
  asService(async () => (await db.query<{ rev: number }>("select public.app_save_file($1, $2, $3, $4, $5, $6, $7, $8) as rev", [project, USERS.alice, path, content, expected, LIMITS.file, LIMITS.project, LIMITS.files])).rows[0]!.rev);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Mock Image Studio");
  project = await asService(async () => (await db.query<{ id: string }>("select public.app_create_project($1, $2, 'Mock site', null, null) as id", [org, USERS.alice])).rows[0]!.id);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("images in projects (v68)", () => {
  it("stores an image as base64, hashed and sized over its bytes", async () => {
    expect(await saveImage("assets/dot.png", PNG, 0)).toBe(1);
    const row = await asUser(USERS.alice, async () => (await db.query<{ sha256: string; size_bytes: number; content: string; encoding: string }>("select sha256, size_bytes, content, encoding from public.get_project_file($1, 'assets/dot.png')", [project])).rows[0]!);
    expect(row).toEqual({ sha256: createHash("sha256").update(PNG_BYTES).digest("hex"), size_bytes: PNG_BYTES.length, content: PNG, encoding: "base64" });
    const listed = await asUser(USERS.alice, async () => (await db.query<{ encoding: string }>("select encoding from public.project_files where project_id = $1 and path = 'assets/dot.png'", [project])).rows[0]!);
    expect(listed.encoding).toBe("base64");
    // The same bytes again change nothing; a stale revision is refused.
    expect(await saveImage("assets/dot.png", PNG, 1)).toBe(1);
    await expect(saveImage("assets/dot.png", PNG, 0)).rejects.toThrow(/FILE_CHANGED/);
  });

  it("keeps images and text apart: no text on an image path, no image on a text path", async () => {
    await expect(saveText("assets/dot.png", "not an image", 1)).rejects.toThrow(/IMAGE_PATH/);
    await expect(saveText("assets/new.JPG", "not an image", 0)).rejects.toThrow(/IMAGE_PATH/);
    await expect(saveImage("index.html", PNG, 0)).rejects.toThrow(/INVALID_PATH/);
    await expect(saveImage("assets/logo.svg", PNG, 0)).rejects.toThrow(/INVALID_PATH/);
    // Text files still save as before, and stay utf8.
    expect(await saveText("index.html", "<img src=\"assets/dot.png\">", 0)).toBe(1);
    const enc = await asUser(USERS.alice, async () => (await db.query<{ encoding: string }>("select encoding from public.get_project_file($1, 'index.html')", [project])).rows[0]!.encoding);
    expect(enc).toBe("utf8");
  });

  it("refuses what isn't base64, empty images and images over the limit", async () => {
    await expect(saveImage("assets/a.png", "not base64!", 0)).rejects.toThrow(/INVALID_CONTENT/);
    await expect(saveImage("assets/a.png", "abc", 0)).rejects.toThrow(/INVALID_CONTENT/);
    const big = Buffer.alloc(2048, 1).toString("base64");
    await expect(saveImage("assets/big.png", big, 0)).rejects.toThrow(/FILE_TOO_LARGE/);
    await expect(saveImage("assets/big.png", big, 0, { ...LIMITS, file: 4096, project: 1000 })).rejects.toThrow(/PROJECT_TOO_LARGE/);
  });

  it("searches text files only", async () => {
    const hits = await asUser(USERS.alice, async () => (await db.query<{ path: string }>("select path from public.search_project_files($1, 'iVBOR')", [project])).rows);
    expect(hits).toEqual([]);
    const text = await asUser(USERS.alice, async () => (await db.query<{ path: string }>("select path from public.search_project_files($1, 'dot.png')", [project])).rows);
    expect(text.map((h) => h.path)).toEqual(["index.html"]);
  });

  it("is written only by the server", async () => {
    await expect(asUser(USERS.alice, () => db.query("select public.app_save_binary_file($1, $2, 'assets/x.png', $3, 0, 10, 10, 10)", [project, USERS.alice, PNG]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select public.app_save_binary_file($1, $2, 'assets/x.png', $3, 0, 10, 10, 10)", [project, USERS.alice, PNG]))).rejects.toThrow(/permission denied/);
  });
});
