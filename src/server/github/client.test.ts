import { describe, expect, it } from "vitest";
import { GITHUB_MESSAGES, createGitHubClient, pullUrl, tokenExpiry } from "./client";

const TOKEN = `github_pat_${"T0k3n".repeat(10)}`;

/** A labelled fake of GitHub's API: it never reaches the network. */
function fakeGitHub(reply: (url: string, init: RequestInit) => { status: number; json?: unknown; headers?: Record<string, string> } | "throw") {
  const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const r = reply(url, init);
    if (r === "throw") throw new TypeError("network");
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status, headers: r.headers });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("the GitHub client", () => {
  it("calls only api.github.com, with the token, the API version and encoded paths", async () => {
    const f = fakeGitHub(() => ({ status: 200, json: { type: "file", sha: "b".repeat(40) } }));
    const gh = createGitHubClient(TOKEN, f.fetcher);
    expect(await gh.blobSha("alice", "shop", "src/a b/c#d.ts", "main")).toEqual({ ok: true, value: "b".repeat(40) });
    expect(f.calls[0]!.url).toBe("https://api.github.com/repos/alice/shop/contents/src/a%20b/c%23d.ts?ref=main");
    expect(f.calls[0]!.headers).toMatchObject({ authorization: `Bearer ${TOKEN}`, "x-github-api-version": "2022-11-28" });
  });

  it("reads who the token belongs to and when it expires", async () => {
    const f = fakeGitHub(() => ({ status: 200, json: { login: "alice" }, headers: { "github-authentication-token-expiration": "2027-01-28 10:00:00 UTC" } }));
    expect(await createGitHubClient(TOKEN, f.fetcher).user()).toEqual({ ok: true, value: { login: "alice", expiresAt: "2027-01-28T10:00:00.000Z" } });
    expect(tokenExpiry(null)).toBeNull();
    expect(tokenExpiry("soon")).toBeNull();
  });

  it("reads a repository and whether the person can push", async () => {
    const f = fakeGitHub(() => ({ status: 200, json: { id: 42, name: "Shop", owner: { login: "Alice" }, default_branch: "main", archived: false, permissions: { push: true } } }));
    expect(await createGitHubClient(TOKEN, f.fetcher).repo("alice", "shop")).toEqual({ ok: true, value: { id: 42, owner: "Alice", repo: "Shop", defaultBranch: "main", archived: false, canPush: true } });
  });

  it("treats a missing file as absent and a folder as not a file", async () => {
    const missing = fakeGitHub(() => ({ status: 404, json: { message: "Not Found" } }));
    expect(await createGitHubClient(TOKEN, missing.fetcher).blobSha("a", "b", "x.ts", "main")).toEqual({ ok: true, value: null });
    const folder = fakeGitHub(() => ({ status: 200, json: [{ type: "file" }] }));
    expect(await createGitHubClient(TOKEN, folder.fetcher).blobSha("a", "b", "src", "main")).toEqual({ ok: true, value: "not-a-file" });
  });

  it("sends file content as base64 and a branch as a full ref", async () => {
    const f = fakeGitHub(() => ({ status: 201, json: { sha: "c".repeat(40) } }));
    const gh = createGitHubClient(TOKEN, f.fetcher);
    await gh.createBlob("a", "b", "héllo\n");
    expect(f.calls[0]!.body).toEqual({ content: Buffer.from("héllo\n", "utf8").toString("base64"), encoding: "base64" });
    await gh.createBranch("a", "b", "farbaek/x-1", "d".repeat(40));
    expect(f.calls[1]!.body).toEqual({ ref: "refs/heads/farbaek/x-1", sha: "d".repeat(40) });
  });

  it("explains each refusal in plain words, never repeating the token", async () => {
    const cases: [number | "throw", Record<string, string> | undefined, string, keyof typeof GITHUB_MESSAGES][] = [
      [401, undefined, "Bad credentials", "TOKEN_REJECTED"],
      [403, undefined, "Resource not accessible by personal access token", "FORBIDDEN"],
      [403, { "x-ratelimit-remaining": "0" }, "rate limit", "RATE_LIMITED"],
      [404, undefined, "Not Found", "NOT_FOUND"],
      [409, undefined, "Git Repository is empty.", "EMPTY_REPO"],
      [422, undefined, "Reference already exists", "BRANCH_EXISTS"],
      [422, undefined, "Validation Failed", "INVALID"],
      [500, undefined, "boom", "UNEXPECTED"],
      ["throw", undefined, "", "UNREACHABLE"],
    ];
    for (const [status, headers, message, code] of cases) {
      const f = fakeGitHub(() => (status === "throw" ? "throw" : { status, json: { message }, headers }));
      const r = await createGitHubClient(TOKEN, f.fetcher).createBranch("a", "b", "farbaek/x-1", "d".repeat(40));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.code, String(status)).toBe(code);
      expect(JSON.stringify(r) + GITHUB_MESSAGES[r.code]).not.toContain(TOKEN);
    }
  });

  it("keeps a pull request's address only on github.com, for that repository and number", () => {
    expect(pullUrl("https://github.com/alice/shop/pull/7", "alice", "shop", 7)).toBe("https://github.com/alice/shop/pull/7");
    expect(pullUrl("https://evil.example/alice/shop/pull/7", "alice", "shop", 7)).toBeNull();
    expect(pullUrl("https://github.com/alice/shop/pull/8", "alice", "shop", 7)).toBeNull();
  });
});
