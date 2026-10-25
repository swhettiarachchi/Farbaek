import { describe, expect, it } from "vitest";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { zipFiles } from "@/core/workspace/zip";
import type { FileDeps } from "./files";
import { GITHUB_MESSAGES, downloadArchive, importBlock, importFromGitHub, type Fetcher } from "./github-import";
import type { WriteDeps } from "./use-cases";

const SHA = "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d";
const SOURCE = { owner: "octocat", repo: "Hello-World", ref: null };

/** A GitHub-style archive: one top folder, and the commit as the zip comment. */
function githubZip(files: { path: string; content: string }[], commit = SHA): Uint8Array<ArrayBuffer> {
  const zip = zipFiles(files.map((f) => ({ path: `Hello-World-${commit.slice(0, 7)}/${f.path}`, content: f.content })));
  const comment = new TextEncoder().encode(commit);
  const out = new Uint8Array(zip.length + comment.length);
  out.set(zip);
  new DataView(out.buffer).setUint16(zip.length - 2, comment.length, true);
  out.set(comment, zip.length);
  return out;
}

function fakeGitHub(responses: Record<string, () => Response>) {
  const calls: { url: string; redirect: RequestRedirect | undefined }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, redirect: init.redirect });
    const make = responses[url];
    return make ? make() : new Response("not found", { status: 404 });
  };
  return { fetcher, calls };
}

const redirect = (location: string) => () => new Response(null, { status: 302, headers: { location } });
const archive = (data: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) => () => new Response(data, { status: 200, headers: { "content-type": "application/zip", ...headers } });

function fakeDeps() {
  const log: string[] = [];
  const deps: WriteDeps & FileDeps = {
    role: async () => "owner",
    billing: async () => ({ state: "free" }),
    countActiveProjects: async () => 0,
    loadTask: async () => null,
    createProject: async (input) => (log.push(`project:${input.name}:${input.description}`), { ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    importFiles: async (input) => (log.push(`import:${input.files.map((f) => f.path).join(",")}`), { ok: true, value: { created: input.files.length, updated: 0, unchanged: 0 } }),
    saveFile: async () => ({ ok: true, value: 1 }),
    deleteFile: async () => ({ ok: true, value: null }),
    newEventId: () => "key-1",
    now: () => new Date("2026-10-25T10:00:00.000Z"),
  };
  return { deps, log };
}

const FILES = [
  { path: "index.html", content: "<h1>Hello</h1>" },
  { path: "src/app.js", content: "console.log('hi');" },
  { path: ".env", content: "API_KEY=secret" },
  { path: "node_modules/x/index.js", content: "module.exports = 1;" },
];

describe("importFromGitHub", () => {
  it("imports the default branch at one exact commit, from the two GitHub addresses only", async () => {
    const { fetcher, calls } = fakeGitHub({
      "https://github.com/octocat/Hello-World/archive/HEAD.zip": redirect(`https://codeload.github.com/octocat/Hello-World/zip/${SHA}`),
      [`https://codeload.github.com/octocat/Hello-World/zip/${SHA}`]: archive(githubZip(FILES)),
    });
    const { deps, log } = fakeDeps();
    const r = await importFromGitHub(deps, { orgId: "o1", userId: "u1", source: SOURCE, fetcher });
    expect(r).toEqual({ ok: true, value: { projectId: "p1", commit: SHA, imported: { files: 2 }, skipped: 1, ignored: 1 } });
    expect(log).toEqual(["project:Hello-World:Imported from github.com/octocat/Hello-World at 7fd1a60.", "import:index.html,src/app.js"]);
    expect(calls).toEqual([
      { url: "https://github.com/octocat/Hello-World/archive/HEAD.zip", redirect: "manual" },
      { url: `https://codeload.github.com/octocat/Hello-World/zip/${SHA}`, redirect: "error" },
    ]);
  });

  it("reads a branch's commit from the archive itself", async () => {
    const branch = { ...SOURCE, ref: "feature/login" };
    const { fetcher } = fakeGitHub({
      "https://github.com/octocat/Hello-World/archive/feature/login.zip": redirect("https://codeload.github.com/octocat/Hello-World/zip/refs/heads/feature/login"),
      "https://codeload.github.com/octocat/Hello-World/zip/refs/heads/feature/login": archive(githubZip(FILES)),
    });
    const { deps, log } = fakeDeps();
    const r = await importFromGitHub(deps, { orgId: "o1", userId: "u1", source: branch, fetcher });
    expect(r).toMatchObject({ ok: true, value: { commit: SHA } });
    expect(log[0]).toBe("project:Hello-World:Imported from github.com/octocat/Hello-World/tree/feature/login at 7fd1a60.");
  });

  it("makes no project when the repository can't be found", async () => {
    const { fetcher } = fakeGitHub({});
    const { deps, log } = fakeDeps();
    expect(await importFromGitHub(deps, { orgId: "o1", userId: "u1", source: SOURCE, fetcher })).toEqual({ ok: false, code: "NOTHING_TO_IMPORT", message: GITHUB_MESSAGES.notFound });
    expect(log).toEqual([]);
  });

  it("never follows a redirect to another host", async () => {
    const { fetcher, calls } = fakeGitHub({ "https://github.com/octocat/Hello-World/archive/HEAD.zip": redirect(`https://evil.example/octocat/Hello-World/zip/${SHA}`) });
    expect(await downloadArchive(SOURCE, fetcher)).toEqual({ ok: false, message: GITHUB_MESSAGES.unexpected });
    expect(calls).toHaveLength(1);
  });

  it("stops at the size cap, whether GitHub says the size or not", async () => {
    const big = githubZip([{ path: "a.txt", content: "x".repeat(5000) }]);
    const limits = { maxBytes: 1000, timeoutMs: 5000 };
    const routes = (headers: Record<string, string>) =>
      fakeGitHub({
        "https://github.com/octocat/Hello-World/archive/HEAD.zip": redirect(`https://codeload.github.com/octocat/Hello-World/zip/${SHA}`),
        [`https://codeload.github.com/octocat/Hello-World/zip/${SHA}`]: archive(big, headers),
      }).fetcher;
    expect(await downloadArchive(SOURCE, routes({ "content-length": "999999" }), limits)).toEqual({ ok: false, message: GITHUB_MESSAGES.tooBig });
    expect(await downloadArchive(SOURCE, routes({}), limits)).toEqual({ ok: false, message: GITHUB_MESSAGES.tooBig });
  });

  it("says when GitHub is slow or unreachable", async () => {
    const slow: Fetcher = async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    };
    expect(await downloadArchive(SOURCE, slow)).toEqual({ ok: false, message: GITHUB_MESSAGES.slow });
    const down: Fetcher = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await downloadArchive(SOURCE, down)).toEqual({ ok: false, message: GITHUB_MESSAGES.unavailable });
    const busy: Fetcher = async () => new Response("busy", { status: 503 });
    expect(await downloadArchive(SOURCE, busy)).toEqual({ ok: false, message: GITHUB_MESSAGES.unavailable });
  });
});

describe("importBlock", () => {
  it("names the limit a repository goes over", () => {
    expect(importBlock({ files: [], bytes: 0, skipped: [], ignored: 3 })).toMatch(/no text source files/);
    expect(importBlock({ files: [{ path: "a", content: "" }], bytes: WORKSPACE_LIMITS.maxImportBytes + 1, skipped: [], ignored: 0 })).toMatch(/imports up to 4.0 MB/);
    const many = Array.from({ length: WORKSPACE_LIMITS.maxProjectFiles + 1 }, (_, i) => ({ path: `f${i}`, content: "" }));
    expect(importBlock({ files: many, bytes: 10, skipped: [], ignored: 0 })).toMatch(/holds up to 3,000/);
    expect(importBlock({ files: [{ path: "a", content: "x" }], bytes: 1, skipped: [], ignored: 0 })).toBeNull();
  });
});
