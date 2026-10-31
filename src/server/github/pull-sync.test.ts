import { describe, expect, it } from "vitest";
import { checkResult, pullStateFrom, summarizeChecks } from "@/core/github/pull-request";
import type { GitHubClient, GitHubResult } from "./client";
import { syncDuePulls, syncPull, type DuePull, type PullSyncStore } from "./pull-sync";

const HEAD = "a".repeat(40);
const ok = <T>(value: T): GitHubResult<T> => ({ ok: true, value });

/** A labelled fake of GitHub: answers only the two reads the sync makes. */
function fakeGitHub(over: { pull?: GitHubResult<{ state: "open" | "closed" | "merged"; mergedAt: string | null; headSha: string | null }>; checks?: GitHubResult<{ name: string; status: string | null; conclusion: string | null }[]> } = {}) {
  const asked: string[] = [];
  const client = {
    pull: async (o: string, r: string, n: number) => (asked.push(`pull:${o}/${r}#${n}`), over.pull ?? ok({ state: "open" as const, mergedAt: null, headSha: HEAD })),
    checkRuns: async (_o: string, _r: string, sha: string) => (asked.push(`checks:${sha.slice(0, 4)}`), over.checks ?? ok([{ name: "test", status: "completed", conclusion: "success" }])),
  } as unknown as GitHubClient;
  return { client, asked };
}

function fakeStore(due: DuePull[] = []) {
  const recorded: Parameters<PullSyncStore["record"]>[0][] = [];
  const store: PullSyncStore = { due: async () => due, one: async () => null, record: async (i) => (recorded.push(i), { ok: true, value: null }) };
  return { store, recorded };
}

const PULL: DuePull = { id: "p1", orgId: "o1", repo: "alice/shop", number: 7 };

describe("what GitHub says about a pull request (ADR 0143)", () => {
  it("counts a check as passed only when it finished with success, and merged wins over closed", () => {
    expect(checkResult("in_progress", null)).toBe("pending");
    expect(checkResult("completed", "success")).toBe("passed");
    expect(checkResult("completed", "skipped")).toBe("skipped");
    expect(checkResult("completed", "timed_out")).toBe("failed");
    expect(summarizeChecks([{ name: "test", status: "completed", conclusion: "success" }, { name: "lint", status: "completed", conclusion: "failure" }, { name: "e2e", status: "queued", conclusion: null }])).toEqual({
      total: 3,
      passed: 1,
      failed: 1,
      pending: 1,
      runs: [
        { name: "test", result: "passed" },
        { name: "lint", result: "failed" },
        { name: "e2e", result: "pending" },
      ],
    });
    expect(pullStateFrom({ state: "closed", merged: true, merged_at: "2026-10-31T09:00:00Z" })).toEqual({ state: "merged", mergedAt: "2026-10-31T09:00:00Z" });
    expect(pullStateFrom({ state: "closed", merged: false })).toEqual({ state: "closed", mergedAt: null });
    expect(pullStateFrom({ state: "weird" })).toBeNull();
  });

  it("records the state and the checks on the pull request's head", async () => {
    const gh = fakeGitHub({ pull: ok({ state: "merged", mergedAt: "2026-10-31T09:00:00Z", headSha: HEAD }) });
    const s = fakeStore();
    expect(await syncPull(gh.client, s.store, PULL)).toMatchObject({ state: "merged", checks: { total: 1, passed: 1 } });
    expect(gh.asked).toEqual(["pull:alice/shop#7", "checks:aaaa"]);
    expect(s.recorded).toEqual([{ id: "p1", state: "merged", mergedAt: "2026-10-31T09:00:00Z", headSha: HEAD, checks: { total: 1, passed: 1, failed: 0, pending: 0, runs: [{ name: "test", result: "passed" }] } }]);
  });

  it("still records the state when the token can't read checks, and the reason when it can't read the pull request", async () => {
    const noChecks = fakeStore();
    await syncPull(fakeGitHub({ checks: { ok: false, code: "FORBIDDEN", detail: "Resource not accessible" } }).client, noChecks.store, PULL);
    expect(noChecks.recorded[0]).toMatchObject({ state: "open", checks: null });
    const gone = fakeStore();
    expect(await syncPull(fakeGitHub({ pull: { ok: false, code: "TOKEN_REJECTED", detail: null } }).client, gone.store, PULL)).toEqual({ problem: expect.stringMatching(/refused the workspace's token/) });
    expect(gone.recorded).toEqual([{ id: "p1", problem: expect.stringMatching(/Connect GitHub again/) }]);
  });

  it("reads each due pull request with its own workspace's token, opened once per workspace, and says why when there's none", async () => {
    const s = fakeStore([PULL, { ...PULL, id: "p2", number: 8 }, { id: "p3", orgId: "o2", repo: "bob/site", number: 1 }]);
    const opened: string[] = [];
    const gh = fakeGitHub();
    const r = await syncDuePulls({ store: s.store, token: async (org) => (opened.push(org), org === "o1" ? { state: "ok", token: "t", login: "alice" } : { state: "none" }), client: () => gh.client });
    expect(opened).toEqual(["o1", "o2"]);
    expect(r).toEqual({ read: 2, merged: 0, closed: 0, problems: 1 });
    expect(s.recorded.find((x) => x.id === "p3")).toEqual({ id: "p3", problem: expect.stringMatching(/isn't connected/) });
  });
});
