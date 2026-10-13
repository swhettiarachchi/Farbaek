/**
 * Migration 5: project files as immutable revisions, written only through
 * the service-role functions, read through Row Level Security.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkPath } from "@/core/workspace/files";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);

const LIMITS = { file: 1024, import: 4096, project: 8192, files: 20 };
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

async function newProject(name: string): Promise<string> {
  return asService(async () => {
    const r = await db.query<{ id: string }>("select public.app_create_project($1, $2, $3, null, null) as id", [org, USERS.alice, name]);
    return r.rows[0]!.id;
  });
}

async function importFiles(files: { path: string; content: string }[], opts: { project?: string; actor?: string; limits?: Partial<typeof LIMITS> } = {}) {
  const l = { ...LIMITS, ...opts.limits };
  return asService(async () => {
    const r = await db.query<{ result: { created: number; updated: number; unchanged: number } }>(
      "select public.app_import_files($1, $2, $3, $4, $5, $6, $7) as result",
      [opts.project ?? project, opts.actor ?? USERS.alice, JSON.stringify(files), l.file, l.import, l.project, l.files],
    );
    return r.rows[0]!.result;
  });
}

async function save(path: string, content: string, expected: number, p = project) {
  return asService(async () => {
    const r = await db.query<{ rev: number }>("select public.app_save_file($1, $2, $3, $4, $5, $6, $7, $8) as rev", [
      p,
      USERS.alice,
      path,
      content,
      expected,
      LIMITS.file,
      LIMITS.project,
      LIMITS.files,
    ]);
    return r.rows[0]!.rev;
  });
}

async function del(path: string, expected: number, p = project) {
  return asService(() => db.query("select public.app_delete_file($1, $2, $3, $4)", [p, USERS.alice, path, expected]));
}

async function files(p = project, uid: string = USERS.alice) {
  return (await asUser(uid, () => db.query<{ path: string; revision: number }>("select path, revision from public.project_files where project_id = $1 order by path", [p]))).rows;
}

async function getFile(path: string, p = project, uid: string = USERS.alice) {
  return (
    await asUser(uid, () =>
      db.query<{ path: string; revision: number; sha256: string; size_bytes: number; content: string }>("select * from public.get_project_file($1, $2)", [p, path]),
    )
  ).rows[0];
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = await newProject("Storefront");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("path rules", () => {
  it("agree with checkPath in TypeScript", async () => {
    const cases = ["src/a.ts", ".github/ci.yml", "a b/c.txt", "", "/abs", "../x", "a/../b", "a/./b", "a//b", "a/", "a\\b", "a\tb", "x".repeat(301), "a/".repeat(24) + "b", "y".repeat(121)];
    for (const path of cases) {
      const r = await db.query<{ ok: boolean }>("select private.valid_project_path($1) as ok", [path]);
      expect(r.rows[0]!.ok, JSON.stringify(path)).toBe(checkPath(path).ok);
    }
  });
});

describe("importing files", () => {
  it("creates files with the database's own hash and size", async () => {
    const content = "export const hello = 'héllo';\n";
    expect(await importFiles([{ path: "src/hello.ts", content }, { path: "README.md", content: "# Storefront\n" }])).toEqual({ created: 2, updated: 0, unchanged: 0 });
    expect(await getFile("src/hello.ts")).toMatchObject({ revision: 1, sha256: sha(content), size_bytes: Buffer.byteLength(content), content });
  });

  it("skips unchanged files and adds a revision for changed ones, keeping history", async () => {
    expect(await importFiles([{ path: "README.md", content: "# Storefront\n" }, { path: "src/hello.ts", content: "export const hello = 'hi';\n" }])).toEqual({
      created: 0,
      updated: 1,
      unchanged: 1,
    });
    expect((await getFile("src/hello.ts"))!.revision).toBe(2);
    const history = await asUser(USERS.alice, () =>
      db.query<{ revision: number; change: string }>("select revision, change from public.project_file_revisions where project_id = $1 and path = 'src/hello.ts' order by revision", [project]),
    );
    expect(history.rows).toEqual([
      { revision: 1, change: "import" },
      { revision: 2, change: "import" },
    ]);
  });

  it("is all or nothing: one bad path rejects the whole import", async () => {
    const before = await files();
    await expect(importFiles([{ path: "ok.txt", content: "fine" }, { path: "../escape.txt", content: "no" }])).rejects.toThrow(/INVALID_PATH/);
    expect(await files()).toEqual(before);
  });

  it("enforces file, import and project limits", async () => {
    await expect(importFiles([{ path: "big.txt", content: "x".repeat(LIMITS.file + 1) }])).rejects.toThrow(/FILE_TOO_LARGE/);
    const chunks = Array.from({ length: 5 }, (_, i) => ({ path: `chunk-${i}.txt`, content: "y".repeat(1000) }));
    await expect(importFiles(chunks)).rejects.toThrow(/IMPORT_TOO_LARGE/);
    await expect(importFiles([{ path: "one-more.txt", content: "z" }], { limits: { files: 2 } })).rejects.toThrow(/PROJECT_TOO_LARGE/);
  });

  it("rejects duplicate paths and malformed input", async () => {
    await expect(importFiles([{ path: "d.txt", content: "1" }, { path: "d.txt", content: "2" }])).rejects.toThrow(/DUPLICATE_PATH/);
    await expect(importFiles([])).rejects.toThrow(/INVALID_IMPORT/);
    await expect(importFiles([{ path: "n.txt", content: 5 as unknown as string }])).rejects.toThrow(/INVALID_IMPORT/);
  });

  it("refuses non-members and archived projects", async () => {
    await expect(importFiles([{ path: "x.txt", content: "x" }], { actor: USERS.bob })).rejects.toThrow(/FORBIDDEN/);
    const archived = await newProject("Old");
    await asService(() => db.query("update public.projects set archived_at = now() where id = $1", [archived]));
    await expect(importFiles([{ path: "x.txt", content: "x" }], { project: archived })).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("saving and deleting files", () => {
  it("creates a file at revision 1, then edits it with optimistic concurrency", async () => {
    expect(await save("src/new.ts", "let a = 1;\n", 0)).toBe(1);
    expect(await save("src/new.ts", "let a = 2;\n", 1)).toBe(2);
    await expect(save("src/new.ts", "let a = 3;\n", 1)).rejects.toThrow(/FILE_CHANGED/);
    await expect(save("src/new.ts", "fresh", 0)).rejects.toThrow(/FILE_CHANGED/);
    expect(await save("src/new.ts", "let a = 2;\n", 2)).toBe(2);
  });

  it("deletes from the current tree, keeps history and continues numbering on re-import", async () => {
    await save("tmp.txt", "temporary", 0);
    await expect(del("tmp.txt", 9)).rejects.toThrow(/FILE_CHANGED/);
    await del("tmp.txt", 1);
    expect((await files()).map((f) => f.path)).not.toContain("tmp.txt");
    await expect(del("tmp.txt", 1)).rejects.toThrow(/NOT_FOUND/);
    await importFiles([{ path: "tmp.txt", content: "back" }]);
    expect((await getFile("tmp.txt"))!.revision).toBe(3);
    const audit = await asService(() => db.query<{ action: string }>("select action from public.audit_events where action = 'project.file_deleted'"));
    expect(audit.rows).toHaveLength(1);
  });
});

describe("search", () => {
  it("finds matching lines case-insensitively, with line numbers", async () => {
    await importFiles([{ path: "src/cart.ts", content: "import { x } from 'y';\nexport function addToCart() {}\n// CART helpers\n" }]);
    const r = await asUser(USERS.alice, () => db.query<{ path: string; line: number; text: string }>("select * from public.search_project_files($1, 'cart')", [project]));
    expect(r.rows).toEqual([
      { path: "src/cart.ts", line: 2, text: "export function addToCart() {}" },
      { path: "src/cart.ts", line: 3, text: "// CART helpers" },
    ]);
  });

  it("treats the query as plain text, not a pattern", async () => {
    await importFiles([{ path: "pct.txt", content: "100% done\nall done\n" }]);
    const r = await asUser(USERS.alice, () => db.query<{ line: number }>("select line from public.search_project_files($1, '0%')", [project]));
    expect(r.rows).toEqual([{ line: 1 }]);
  });
});

describe("access", () => {
  it("hides files from other organizations", async () => {
    expect(await files(project, USERS.bob)).toEqual([]);
    expect(await getFile("README.md", project, USERS.bob)).toBeUndefined();
    const r = await asUser(USERS.bob, () => db.query("select * from public.search_project_files($1, 'cart')", [project]));
    expect(r.rows).toEqual([]);
  });

  it("only the server can write files", async () => {
    await expect(asUser(USERS.alice, () => db.query("select public.app_save_file($1, $2, 'x.txt', 'x', 0, 10, 10, 10)", [project, USERS.alice]))).rejects.toThrow(/permission denied/);
    await expect(
      asUser(USERS.alice, () =>
        db.query("insert into public.project_file_revisions (project_id, org_id, path, revision, change, content, sha256, size_bytes) values ($1, $2, 'x', 1, 'edit', 'x', $3, 1)", [
          project,
          org,
          sha("x"),
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("update public.project_files set size_bytes = 0 where project_id = $1", [project]))).rejects.toThrow(/permission denied/);
  });

  it("can't be read anonymously", async () => {
    await expect(as(db, "anon", null, () => db.query("select * from public.get_project_file($1, 'README.md')", [project]))).rejects.toThrow(/permission denied/);
  });
});
