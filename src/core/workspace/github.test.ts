import { describe, expect, it } from "vitest";
import { archiveFromRedirect, archiveUrl, commitFromArchive, parseGitHubSource, sourceLabel } from "./github";

const SHA = "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d";

describe("reading a GitHub source", () => {
  it("reads the ways people paste a repository", () => {
    const plain = { owner: "octocat", repo: "Hello-World", ref: null };
    for (const input of ["octocat/Hello-World", "github.com/octocat/Hello-World", "https://github.com/octocat/Hello-World", "https://www.github.com/octocat/Hello-World/", "https://github.com/octocat/Hello-World.git", "git@github.com:octocat/Hello-World.git", "  octocat/Hello-World  "]) {
      expect(parseGitHubSource(input), input).toEqual(plain);
    }
  });

  it("reads a branch or tag from a /tree/ address", () => {
    expect(parseGitHubSource("https://github.com/vercel/next.js/tree/canary")).toEqual({ owner: "vercel", repo: "next.js", ref: "canary" });
    expect(parseGitHubSource("github.com/a/b/tree/feature/login-page")).toEqual({ owner: "a", repo: "b", ref: "feature/login-page" });
  });

  it("refuses other hosts, other pages and anything that could steer the request", () => {
    for (const input of [
      "",
      "octocat",
      "https://gitlab.com/octocat/Hello-World",
      "https://github.com.evil.example/octocat/x",
      "https://github.com/octocat/Hello-World/blob/main/README",
      "https://github.com/octocat/Hello-World/tree/",
      "https://github.com/octocat/Hello-World/tree/../../x",
      "https://github.com/octocat/Hello-World/tree/-x",
      "https://github.com/octocat/Hello-World?tab=readme",
      "https://user@github.com/octocat/Hello-World",
      "octocat/..",
      "-octocat/repo",
      "octo cat/repo",
      "octocat/re po",
      `octocat/${"x".repeat(101)}`,
    ]) {
      expect(parseGitHubSource(input), input).toBeNull();
    }
  });

  it("builds the archive request from checked parts", () => {
    expect(archiveUrl({ owner: "octocat", repo: "Hello-World", ref: null })).toBe("https://github.com/octocat/Hello-World/archive/HEAD.zip");
    expect(archiveUrl({ owner: "a", repo: "b", ref: "feature/login" })).toBe("https://github.com/a/b/archive/feature/login.zip");
    expect(sourceLabel({ owner: "a", repo: "b", ref: "v1.2" })).toBe("github.com/a/b/tree/v1.2");
  });
});

describe("following GitHub's redirect", () => {
  const source = { owner: "octocat", repo: "Hello-World", ref: null };
  const branch = { owner: "octocat", repo: "Hello-World", ref: "feature/login" };

  it("follows the default branch to one exact commit", () => {
    expect(archiveFromRedirect(`https://codeload.github.com/octocat/Hello-World/zip/${SHA}`, source)).toEqual({ url: `https://codeload.github.com/octocat/Hello-World/zip/${SHA}`, commit: SHA });
    // The redirect's own spelling of the names is never used: the address is rebuilt.
    expect(archiveFromRedirect(`https://codeload.github.com/OctoCat/hello-world/zip/${SHA}`, source)?.url).toBe(`https://codeload.github.com/octocat/Hello-World/zip/${SHA}`);
  });

  it("follows a branch or tag only to that same branch or tag", () => {
    expect(archiveFromRedirect("https://codeload.github.com/octocat/Hello-World/zip/refs/heads/feature/login", branch)).toEqual({
      url: "https://codeload.github.com/octocat/Hello-World/zip/refs/heads/feature/login",
      commit: null,
    });
    expect(archiveFromRedirect("https://codeload.github.com/octocat/Hello-World/zip/refs/tags/v1", { ...branch, ref: "v1" })?.url).toBe("https://codeload.github.com/octocat/Hello-World/zip/refs/tags/v1");
    expect(archiveFromRedirect("https://codeload.github.com/octocat/Hello-World/zip/refs/heads/main", branch)).toBeNull();
    expect(archiveFromRedirect("https://codeload.github.com/octocat/Hello-World/zip/refs/heads/main", source)).toBeNull();
  });

  it("refuses every other host, repository and shape", () => {
    for (const location of [
      null,
      "not a url",
      `http://codeload.github.com/octocat/Hello-World/zip/${SHA}`,
      `https://codeload.github.com:8443/octocat/Hello-World/zip/${SHA}`,
      `https://evil.example/octocat/Hello-World/zip/${SHA}`,
      `https://codeload.github.com/someone/else/zip/${SHA}`,
      `https://codeload.github.com/octocat/Hello-World/zip/${SHA}?x=1`,
      `https://codeload.github.com/octocat/Hello-World/tar.gz/${SHA}`,
      `https://a:b@codeload.github.com/octocat/Hello-World/zip/${SHA}`,
      "https://codeload.github.com/octocat/Hello-World/zip/%E0%A4%A",
    ]) {
      expect(archiveFromRedirect(location, source), String(location)).toBeNull();
    }
  });
});

describe("the commit inside an archive", () => {
  // An empty zip: just the end record, with the comment GitHub writes.
  const endRecord = (comment: string) => {
    const text = new TextEncoder().encode(comment);
    const out = new Uint8Array(22 + text.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(20, text.length, true);
    out.set(text, 22);
    return out;
  };

  it("reads the commit hash GitHub writes as the comment", () => {
    expect(commitFromArchive(endRecord(SHA))).toBe(SHA);
    const padded = new Uint8Array(100 + 22 + 40);
    padded.set(endRecord(SHA), 100);
    expect(commitFromArchive(padded)).toBe(SHA);
  });

  it("finds nothing in an archive without one", () => {
    expect(commitFromArchive(endRecord(""))).toBeNull();
    expect(commitFromArchive(endRecord("made by hand"))).toBeNull();
    expect(commitFromArchive(new Uint8Array(10))).toBeNull();
  });
});
