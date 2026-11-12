import { describe, expect, it } from "vitest";
import { createLaunchGitHub, gitBlobId, pushLaunchCommit } from "./launch-commit";

const sha = (c: string) => c.repeat(40);
type Seen = { method: string; url: string; body: unknown };

/** A fake GitHub that answers each path, and records what it was asked. */
function github(opts: { head?: string | null; treeBlobs?: (files: { path: string; sha: string }[]) => { path: string; sha: string }[] } = {}) {
  const seen: Seen[] = [];
  const blobs: { path: string; sha: string }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    seen.push({ method: String(init.method), url, body });
    const ok = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status });
    if (url.includes("/git/ref/heads/")) return opts.head ? ok({ object: { sha: opts.head } }) : new Response("{}", { status: 404 });
    if (url.endsWith("/git/blobs")) return ok({ sha: sha("b") }, 201);
    if (url.endsWith("/git/trees")) {
      for (const e of body.tree) blobs.push({ path: e.path, sha: e.sha ?? gitBlobId(Buffer.from(e.content, "utf8")) });
      return ok({ sha: sha("7") }, 201);
    }
    if (url.includes("/git/trees/")) {
      const listed = opts.treeBlobs ? opts.treeBlobs(blobs) : blobs;
      return ok({ tree: listed.map((b) => ({ ...b, type: "blob" })), truncated: false });
    }
    if (url.endsWith("/git/commits")) return ok({ sha: sha("c") }, 201);
    if (url.includes("/git/refs")) return ok({ object: { sha: sha("c") } }, init.method === "POST" ? 201 : 200);
    return new Response("{}", { status: 500 });
  }) as unknown as typeof fetch;
  return { gh: createLaunchGitHub("github_pat_test_token", fetcher), seen };
}

const FILES = [
  { path: "package.json", content: '{"scripts":{"start":"node src/server.js"}}' },
  { path: "src/server.js", content: "console.log(1)\n" },
];

describe("the launch commit (ADR 0191)", () => {
  it("matches git's own blob id", () => {
    expect(gitBlobId(Buffer.from(""))).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
    expect(gitBlobId(Buffer.from("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });

  it("makes the branch on a first launch from a fresh tree, never touching another branch", async () => {
    const { gh, seen } = github();
    const r = await pushLaunchCommit(gh, { owner: "ama", repo: "fieldnote", files: FILES, message: "Launch", previous: [] });
    expect(r).toEqual({ ok: true, commit: sha("c") });
    const tree = seen.find((s) => s.url.endsWith("/git/trees"))!;
    expect(tree.body).not.toHaveProperty("base_tree");
    const commit = seen.find((s) => s.url.endsWith("/git/commits"))!;
    expect((commit.body as { parents: string[] }).parents).toEqual([]);
    const ref = seen.at(-1)!;
    expect(ref).toMatchObject({ method: "POST", body: { ref: "refs/heads/farbaek/launch", sha: sha("c") } });
    expect(seen.every((s) => !s.url.includes("heads/main"))).toBe(true);
  });

  it("moves the branch only as a fast-forward from where Farbaek left it", async () => {
    const { gh, seen } = github({ head: sha("a") });
    const r = await pushLaunchCommit(gh, { owner: "ama", repo: "fieldnote", files: FILES, message: "Launch", previous: [sha("a")] });
    expect(r.ok).toBe(true);
    expect((seen.find((s) => s.url.endsWith("/git/commits"))!.body as { parents: string[] }).parents).toEqual([sha("a")]);
    expect(seen.at(-1)).toMatchObject({ method: "PATCH", body: { sha: sha("c"), force: false } });
  });

  it("records the new commit before moving the branch, and accepts a recorded commit whose move was lost", async () => {
    const recorded: string[] = [];
    const { gh, seen } = github({ head: sha("b") });
    const r = await pushLaunchCommit(gh, { owner: "ama", repo: "fieldnote", files: FILES, message: "Launch", previous: [sha("a"), sha("b")], onCommit: async (c) => (recorded.push(c), true) });
    expect(r.ok).toBe(true);
    expect(recorded).toEqual([sha("c")]);
    const recordAt = seen.findIndex((s) => s.url.endsWith("/git/commits"));
    expect(seen.findIndex((s) => s.method === "PATCH")).toBeGreaterThan(recordAt);
    const refused = await pushLaunchCommit(github({ head: sha("b") }).gh, { owner: "ama", repo: "fieldnote", files: FILES, message: "Launch", previous: [sha("b")], onCommit: async () => false });
    expect(refused.ok).toBe(false);
  });

  it("refuses to move a branch someone else changed, before writing anything", async () => {
    const { gh, seen } = github({ head: sha("e") });
    const r = await pushLaunchCommit(gh, { owner: "ama", repo: "fieldnote", files: FILES, message: "Launch", previous: [sha("a")] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/isn't where Farbaek's last launch left it/);
    expect(seen.filter((s) => s.method !== "GET")).toEqual([]);
  });

  it("sends images as blobs, and checks the tree holds exactly the files before committing", async () => {
    const png = Buffer.from("iVBORw0KGgo=", "base64").toString("base64");
    const { gh, seen } = github({ treeBlobs: (b) => [...b, { path: "planted.js", sha: sha("9") }] });
    const r = await pushLaunchCommit(gh, { owner: "ama", repo: "fieldnote", files: [...FILES, { path: "logo.png", content: png, encoding: "base64" }], message: "Launch", previous: [] });
    expect(seen.some((s) => s.url.endsWith("/git/blobs"))).toBe(true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/doesn't hold exactly the project's files/);
    expect(seen.some((s) => s.url.endsWith("/git/commits"))).toBe(false);
  });
});
