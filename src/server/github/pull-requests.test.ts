import { describe, expect, it } from "vitest";
import { gitBlobSha } from "@/core/github/pull-request";
import type { GitHubClient, GitHubResult } from "./client";
import { openPullRequest, postPullStatus } from "./pull-requests";
import type { AppliedChange, RepoLinkView } from "./store";

const HEAD = "1".repeat(40);
const TREE = "2".repeat(40);
const LINK: RepoLinkView = { owner: "alice", repo: "shop", repoId: 42, defaultBranch: "main", linkedAt: "2026-10-30T00:00:00Z" };
const CHANGE: AppliedChange = {
  proposalId: "1234abcd-0000-4000-8000-000000000000",
  taskId: "t1",
  projectId: "p1",
  summary: "Fix the cart total.",
  contract: { version: 1, sha256: "c".repeat(64) },
  files: [
    { path: "src/cart.ts", before: "old\n", after: "new\n" },
    { path: "src/new.ts", before: null, after: "made\n" },
  ],
  proof: { digest: "d".repeat(64), status: "verified" },
};
const ENV = { NEXT_PUBLIC_SITE_URL: "https://www.farbaek.com" };

/** A labelled in-memory fake of the GitHub client: records what Farbaek would write. */
function fakeClient(opts: { remote?: Record<string, string | null>; repo?: Partial<{ id: number; archived: boolean; canPush: boolean }>; branchExists?: boolean; statusFails?: boolean } = {}) {
  const writes: string[] = [];
  const ok = <T>(value: T): GitHubResult<T> => ({ ok: true, value });
  const client: GitHubClient = {
    user: async () => ok({ login: "alice", expiresAt: null }),
    repo: async () => ok({ id: 42, owner: "alice", repo: "shop", defaultBranch: "main", archived: false, canPush: true, ...opts.repo }),
    branchHead: async () => ok({ commit: HEAD, tree: TREE }),
    blobSha: async (_o, _r, path) => ok(opts.remote?.[path] ?? null),
    createBlob: async (_o, _r, content) => (writes.push(`blob:${content.trim()}`), ok("b".repeat(40))),
    createTree: async (_o, _r, base, files) => (writes.push(`tree:${base}:${files.map((f) => f.path).join(",")}`), ok("3".repeat(40))),
    createCommit: async (_o, _r, i) => (writes.push(`commit:${i.parent}`), ok("4".repeat(40))),
    createBranch: async (_o, _r, branch) => (opts.branchExists ? { ok: false, code: "BRANCH_EXISTS", detail: null } : (writes.push(`branch:${branch}`), ok(null))),
    openPull: async (_o, _r, i) => (writes.push(`pull:${i.head}->${i.base}`), ok({ number: 7, url: "https://github.com/alice/shop/pull/7" })),
    postStatus: async (_o, _r, sha, i) => (opts.statusFails ? { ok: false, code: "FORBIDDEN", detail: null } : (writes.push(`status:${sha}:${i.state}:${i.context}:${i.targetUrl}`), ok(null))),
    pull: async () => ok({ state: "open" as const, mergedAt: null, headSha: "4".repeat(40) }),
    checkRuns: async () => ok([]),
  };
  return { client, writes };
}

const open = (github: GitHubClient, change = CHANGE) => openPullRequest({ github, link: LINK, change, taskTitle: "Fix the cart total", workspace: "Alice Studio", login: "alice", siteEnv: ENV });

describe("opening a pull request", () => {
  it("pushes the change on its own branch from the base, opens the pull request and posts the ProofPack status", async () => {
    const { client, writes } = fakeClient({ remote: { "src/cart.ts": await gitBlobSha("old\n"), "src/new.ts": null } });
    const r = await open(client);
    expect(r).toEqual({
      ok: true,
      value: { number: 7, url: "https://github.com/alice/shop/pull/7", repo: "alice/shop", branch: "farbaek/fix-the-cart-total-1234abcd", baseBranch: "main", commit: "4".repeat(40), status: { state: "success", posted: true } },
    });
    expect(writes).toEqual([
      "blob:new",
      "blob:made",
      `tree:${TREE}:src/cart.ts,src/new.ts`,
      `commit:${HEAD}`,
      "branch:farbaek/fix-the-cart-total-1234abcd",
      "pull:farbaek/fix-the-cart-total-1234abcd->main",
      `status:${"4".repeat(40)}:success:Farbaek ProofPack:https://www.farbaek.com/app/tasks/t1`,
    ]);
  });

  it("pushes nothing when a file on GitHub isn't the version the change started from", async () => {
    const { client, writes } = fakeClient({ remote: { "src/cart.ts": await gitBlobSha("someone else's\n"), "src/new.ts": null } });
    const r = await open(client);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/src\/cart\.ts isn't the version this change started from, so nothing was pushed/);
    expect(writes).toEqual([]);
  });

  it("says when the change is already on the base branch", async () => {
    const { client, writes } = fakeClient({ remote: { "src/cart.ts": await gitBlobSha("new\n"), "src/new.ts": await gitBlobSha("made\n") } });
    expect(await open(client)).toEqual({ ok: false, message: "This change is already on main, so there's nothing to open." });
    expect(writes).toEqual([]);
  });

  it("refuses a repository that was replaced, archived, or that the person can no longer push to", async () => {
    for (const [repo, words] of [
      [{ id: 99 }, /isn't the repository this project was linked to/],
      [{ archived: true }, /is archived on GitHub/],
      [{ canPush: false }, /can't push to alice\/shop/],
    ] as const) {
      const { client, writes } = fakeClient({ repo });
      const r = await open(client);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(words);
      expect(writes).toEqual([]);
    }
  });

  it("never reuses a branch that's already there", async () => {
    const { client, writes } = fakeClient({ remote: { "src/cart.ts": await gitBlobSha("old\n") }, branchExists: true });
    const r = await open(client);
    expect(r).toEqual({ ok: false, message: "A branch named farbaek/fix-the-cart-total-1234abcd already exists on GitHub. Delete it there, then try again." });
    expect(writes.some((w) => w.startsWith("pull:"))).toBe(false);
  });

  it("still opens the pull request when the status can't be posted, and says so", async () => {
    const { client } = fakeClient({ remote: { "src/cart.ts": await gitBlobSha("old\n") }, statusFails: true });
    const r = await open(client, { ...CHANGE, proof: null });
    expect(r.ok && r.value.status).toEqual({ state: "pending", posted: false });
  });
});

describe("updating the status", () => {
  it("posts what the latest ProofPack says on Farbaek's commit", async () => {
    const { client, writes } = fakeClient();
    expect(await postPullStatus({ github: client, repo: "alice/shop", commit: "4".repeat(40), taskId: "t1", proof: "failed", siteEnv: ENV })).toEqual({ ok: true, value: "failure" });
    expect(writes).toEqual([`status:${"4".repeat(40)}:failure:Farbaek ProofPack:https://www.farbaek.com/app/tasks/t1`]);
  });
});
