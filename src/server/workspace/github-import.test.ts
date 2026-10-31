import { describe, expect, it } from "vitest";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { zipFiles } from "@/core/workspace/zip";
import type { FileDeps } from "./files";
import { GITHUB_MESSAGES, downloadArchive, importBlock, importFromGitHub, type Fetcher, type TokenAccess } from "./github-import";
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
  const auth: (string | null)[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, redirect: init.redirect });
    auth.push(new Headers(init.headers).get("authorization"));
    const make = responses[url];
    return make ? make() : new Response("not found", { status: 404 });
  };
  return { fetcher, calls, auth };
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
    saveImage: async () => ({ ok: true, value: 1 }),
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
    expect(r).toEqual({ ok: true, value: { projectId: "p1", commit: SHA, imported: { files: 2 }, skipped: 1, ignored: 1, via: { kind: "public" } } });
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

describe("a private repository, with the workspace's token (ADR 0144)", () => {
  const TOKEN = "github_pat_EXAMPLE";
  const DOWNLOAD = "AAB7XQ2EXAMPLEDOWNLOADTOKEN";
  const PUBLIC = "https://github.com/octocat/Hello-World/archive/HEAD.zip";
  const API = "https://api.github.com/repos/octocat/Hello-World/zipball/main";
  const CODELOAD = `https://codeload.github.com/octocat/Hello-World/legacy.zip/refs/heads/main?token=${DOWNLOAD}`;
  const INFO = { id: 42, owner: "octocat", repo: "Hello-World", defaultBranch: "main", archived: false, canPush: true };

  function access(answer: Awaited<ReturnType<TokenAccess["client"]["repo"]>> = { ok: true, value: INFO }) {
    const asked: string[] = [];
    const withToken: TokenAccess = {
      token: TOKEN,
      client: { repo: async (owner, repo) => (asked.push(`${owner}/${repo}`), answer) },
    };
    return { withToken, asked };
  }

  it("reads it with the token only after the public download finds nothing, and sends the token to api.github.com alone", async () => {
    const { fetcher, calls, auth } = fakeGitHub({
      [API]: redirect(CODELOAD),
      [CODELOAD]: archive(githubZip(FILES)),
    });
    const { withToken, asked } = access();
    const { deps, log } = fakeDeps();
    const r = await importFromGitHub(deps, { orgId: "o1", userId: "u1", source: SOURCE, fetcher, withToken });
    expect(r).toEqual({ ok: true, value: { projectId: "p1", commit: SHA, imported: { files: 2 }, skipped: 1, ignored: 1, via: { kind: "token", repository: INFO } } });
    expect(asked).toEqual(["octocat/Hello-World"]);
    expect(calls.map((c) => c.url)).toEqual([PUBLIC, API, CODELOAD]);
    expect(auth).toEqual([null, `Bearer ${TOKEN}`, null]);
    expect(log[1]).toBe("import:index.html,src/app.js");
  });

  it("doesn't use the token when the public download works", async () => {
    const { fetcher, auth } = fakeGitHub({
      [PUBLIC]: redirect(`https://codeload.github.com/octocat/Hello-World/zip/${SHA}`),
      [`https://codeload.github.com/octocat/Hello-World/zip/${SHA}`]: archive(githubZip(FILES)),
    });
    const { withToken, asked } = access();
    const r = await importFromGitHub(fakeDeps().deps, { orgId: "o1", userId: "u1", source: SOURCE, fetcher, withToken });
    expect(r).toMatchObject({ ok: true, value: { via: { kind: "public" } } });
    expect(asked).toEqual([]);
    expect(auth.every((a) => a === null)).toBe(true);
  });

  it("asks for the branch that was named, not the default one", async () => {
    const api = "https://api.github.com/repos/octocat/Hello-World/zipball/feature/login";
    const codeload = `https://codeload.github.com/octocat/Hello-World/legacy.zip/refs/heads/feature/login?token=${DOWNLOAD}`;
    const { fetcher, calls } = fakeGitHub({ [api]: redirect(codeload), [codeload]: archive(githubZip(FILES)) });
    const r = await importFromGitHub(fakeDeps().deps, { orgId: "o1", userId: "u1", source: { ...SOURCE, ref: "feature/login" }, fetcher, withToken: access().withToken });
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.url).slice(1)).toEqual([api, codeload]);
  });

  it("never follows GitHub's answer anywhere but codeload for this repository", async () => {
    const { fetcher, calls } = fakeGitHub({ [API]: redirect(`https://evil.example/octocat/Hello-World/legacy.zip/refs/heads/main?token=${DOWNLOAD}`) });
    const { deps, log } = fakeDeps();
    expect(await importFromGitHub(deps, { orgId: "o1", userId: "u1", source: SOURCE, fetcher, withToken: access().withToken })).toEqual({ ok: false, code: "NOTHING_TO_IMPORT", message: GITHUB_MESSAGES.unexpected });
    expect(calls).toHaveLength(2);
    expect(log).toEqual([]);
  });

  it("says why the token can't read it, and never repeats the token", async () => {
    const run = async (answer: Parameters<typeof access>[0], api?: () => Response) => {
      const { fetcher } = fakeGitHub(api ? { [API]: api } : {});
      const r = await importFromGitHub(fakeDeps().deps, { orgId: "o1", userId: "u1", source: SOURCE, fetcher, withToken: access(answer).withToken });
      expect(JSON.stringify(r)).not.toContain(TOKEN);
      return r.ok ? null : r.message;
    };
    expect(await run({ ok: false, code: "NOT_FOUND", detail: null })).toBe(GITHUB_MESSAGES.tokenNotFound);
    expect(await run({ ok: false, code: "TOKEN_REJECTED", detail: null })).toMatch(/didn't accept the workspace's token/);
    expect(await run(undefined, () => new Response("{}", { status: 401 }))).toBe(GITHUB_MESSAGES.tokenRejected);
    expect(await run(undefined, () => new Response("{}", { status: 403 }))).toBe(GITHUB_MESSAGES.tokenForbidden);
    expect(await run(undefined, () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } }))).toBe(GITHUB_MESSAGES.rateLimited);
    expect(await run(undefined)).toBe(GITHUB_MESSAGES.tokenNotFound);
    expect(await run({ ok: true, value: { ...INFO, defaultBranch: "-weird" } })).toBe(GITHUB_MESSAGES.badBranch);
  });

  it("without the token, says how a private repository could be imported", async () => {
    const { fetcher } = fakeGitHub({});
    const r = await importFromGitHub(fakeDeps().deps, { orgId: "o1", userId: "u1", source: SOURCE, fetcher, privateHint: "If it's private, connect GitHub in Settings." });
    expect(r).toEqual({ ok: false, code: "NOTHING_TO_IMPORT", message: `${GITHUB_MESSAGES.notFound} If it's private, connect GitHub in Settings.` });
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
