import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PullRequestView } from "@/server/github/store";
import { PullOnGitHub } from "./pull-on-github";

const base: PullRequestView = {
  id: "p1",
  taskId: "t1",
  proposalId: "pr1",
  repo: "alice/shop",
  number: 7,
  url: "https://github.com/alice/shop/pull/7",
  branch: "farbaek/change-7",
  baseBranch: "main",
  commitSha: "a".repeat(40),
  status: "success",
  statusPostedAt: "2026-10-31T08:00:00.000Z",
  openedAt: "2026-10-31T08:00:00.000Z",
  prState: null,
  mergedAt: null,
  headSha: null,
  checks: null,
  syncedAt: null,
  syncProblem: null,
};
const render = (over: Partial<PullRequestView>) => renderToStaticMarkup(createElement(PullOnGitHub, { pull: { ...base, ...over } }));

describe("PullOnGitHub (ADR 0143)", () => {
  it("says when nothing has been read yet", () => {
    expect(render({})).toContain("Not read back from GitHub yet");
  });

  it("shows the state in words, when it was read, and each check's result", () => {
    const html = render({
      prState: "merged",
      mergedAt: "2026-10-31T09:00:00.000Z",
      headSha: "b".repeat(40),
      syncedAt: "2026-10-31T09:05:00.000Z",
      checks: { total: 2, passed: 1, failed: 1, pending: 0, runs: [{ name: "test", result: "passed" }, { name: "lint", result: "failed" }] },
    });
    expect(html).toContain("Merged");
    expect(html).toContain("with commits added on GitHub after Farbaek&#x27;s");
    expect(html).toContain("GitHub&#x27;s checks: 1 of 2 passed, 1 failed.");
    expect(html).toContain("Failed");
  });

  it("says why it couldn't be read, and when the token can't see checks", () => {
    expect(render({ prState: "open", syncedAt: "2026-10-31T09:05:00.000Z", syncProblem: "GitHub refused the workspace's token." })).toContain("GitHub refused the workspace&#x27;s token.");
    expect(render({ prState: "open", syncedAt: "2026-10-31T09:05:00.000Z" })).toContain("needs Checks read access");
    expect(render({ prState: "closed", syncedAt: "2026-10-31T09:05:00.000Z", checks: { total: 0, passed: 0, failed: 0, pending: 0, runs: [] } })).toContain("Closed without merging");
  });
});
