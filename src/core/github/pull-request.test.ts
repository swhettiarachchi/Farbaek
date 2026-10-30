import { describe, expect, it } from "vitest";
import { TOKEN_CREATION_URL, branchName, gitBlobSha, importedRepo, isFineGrainedToken, parseRepoName, planFiles, pullRequestBody, statusFor, tokenHint } from "./pull-request";

describe("tokens", () => {
  it("accepts only fine-grained tokens, so the person chose which repositories it reaches", () => {
    expect(isFineGrainedToken(`github_pat_${"A1_".repeat(25)}`)).toBe(true);
    for (const bad of ["ghp_" + "a".repeat(36), "gho_" + "a".repeat(36), "github_pat_short", `github_pat_${"a".repeat(40)} `, ""]) expect(isFineGrainedToken(bad), bad).toBe(false);
  });

  it("shows only the last four characters", () => {
    expect(tokenHint(`github_pat_${"a".repeat(40)}Wxyz`)).toBe("Wxyz");
    expect(tokenHint(`github_pat_${"a".repeat(40)}_z`)).toBe("aaxz");
  });

  it("links to GitHub's form with exactly the permissions Farbaek needs", () => {
    const url = new URL(TOKEN_CREATION_URL);
    expect(url.origin + url.pathname).toBe("https://github.com/settings/personal-access-tokens/new");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ name: "Farbaek", expires_in: "90", contents: "write", pull_requests: "write", statuses: "write" });
    expect(url.searchParams.has("administration")).toBe(false);
  });
});

describe("repository names", () => {
  it("reads owner/repo and github.com addresses, and nothing else", () => {
    expect(parseRepoName(" alice/shop ")).toEqual({ owner: "alice", repo: "shop" });
    expect(parseRepoName("https://github.com/alice/shop.git")).toEqual({ owner: "alice", repo: "shop" });
    for (const bad of ["alice", "alice/shop/tree/main", "-alice/shop", "alice/..", "https://gitlab.com/alice/shop", ""]) expect(parseRepoName(bad), bad).toBeNull();
  });

  it("finds the repository an import came from in the project's description", () => {
    expect(importedRepo("Imported from github.com/alice/shop at 1a2b3c4.")).toEqual({ owner: "alice", repo: "shop" });
    expect(importedRepo("Imported from github.com/alice/shop.js/tree/dev.")).toEqual({ owner: "alice", repo: "shop.js" });
    expect(importedRepo("Imported from github.com/alice/shop.")).toEqual({ owner: "alice", repo: "shop" });
    expect(importedRepo("A shop I made.")).toBeNull();
    expect(importedRepo(null)).toBeNull();
  });
});

describe("branches", () => {
  it("names a branch for the task and the change, with only safe characters", () => {
    expect(branchName("Fix the cart's total (again)!", "1234abcd-0000-4000-8000-000000000000")).toBe("farbaek/fix-the-cart-s-total-again-1234abcd");
    expect(branchName("Écrire un test", "ABCDEF12-0000")).toBe("farbaek/ecrire-un-test-abcdef12");
    expect(branchName("!!!", "1234abcd")).toBe("farbaek/1234abcd");
    const long = branchName("a".repeat(200), "1234abcd");
    expect(long).toMatch(/^farbaek\/[a-z0-9-]{1,60}$/);
  });
});

describe("blob ids", () => {
  it("matches git's own ids", async () => {
    expect(await gitBlobSha("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
    expect(await gitBlobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
});

describe("which files a pull request holds", () => {
  const files = [
    { path: "src/cart.ts", before: "old\n", after: "new\n" },
    { path: "src/new.ts", before: null, after: "made\n" },
  ];

  it("takes a file only when GitHub has the version the change started from", async () => {
    const remote = { "src/cart.ts": await gitBlobSha("old\n"), "src/new.ts": null };
    expect(await planFiles(files, remote)).toEqual({ ok: true, files });
  });

  it("names the files that changed on GitHub, and overwrites nothing", async () => {
    const remote = { "src/cart.ts": await gitBlobSha("someone else's\n"), "src/new.ts": await gitBlobSha("also there\n") };
    expect(await planFiles(files, remote)).toEqual({ ok: false, reason: "conflict", paths: ["src/cart.ts", "src/new.ts"] });
    expect(await planFiles(files, { "src/cart.ts": "not-a-file", "src/new.ts": null })).toEqual({ ok: false, reason: "conflict", paths: ["src/cart.ts"] });
  });

  it("says when the change is already there", async () => {
    const remote = { "src/cart.ts": await gitBlobSha("new\n"), "src/new.ts": await gitBlobSha("made\n") };
    expect(await planFiles(files, remote)).toEqual({ ok: false, reason: "already_there" });
  });
});

describe("the status on GitHub", () => {
  it("passes only for a verified ProofPack", () => {
    expect(statusFor("verified").state).toBe("success");
    expect(statusFor("failed").state).toBe("failure");
    expect(statusFor("partially_verified").state).toBe("failure");
    expect(statusFor("unverified").state).toBe("pending");
    expect(statusFor(null).state).toBe("pending");
    for (const s of ["verified", "failed", "partially_verified", "unverified", null] as const) {
      const d = statusFor(s).description;
      expect(d.length).toBeLessThanOrEqual(140);
      expect(d).not.toMatch(/—/);
    }
  });

  it("describes the pull request without mentioning anyone", () => {
    const body = pullRequestBody({
      summary: "Fix the total.",
      paths: ["src/cart.ts", "src/a`b.ts"],
      contract: { version: 2, sha256: "c".repeat(64) },
      proofPackDigest: "d".repeat(64),
      taskUrl: "https://farbaek.com/app/tasks/t1",
      workspace: "Alice\nStudio",
      login: "alice",
    });
    expect(body).toContain("- `src/cart.ts`");
    expect(body).toContain("- `src/ab.ts`");
    expect(body).toContain(`version 2, \`${"c".repeat(64)}\``);
    expect(body).toContain("Alice Studio with alice's token");
    expect(body).not.toMatch(/@alice/);
  });
});
