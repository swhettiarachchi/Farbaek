/**
 * What happened to Farbaek's pull requests on GitHub (ADR 0143). For each
 * one still open (or never read), the server asks GitHub, with that
 * workspace's own token, whether it's open, merged or closed, which commit is
 * at its head, and what checks GitHub ran on that commit; then records it.
 * Runs hourly and when someone asks on the task page. A workspace whose token
 * is gone or can't read something gets the reason recorded, never a guess.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { summarizeChecks, type PullChecks, type PullState } from "@/core/github/pull-request";
import { log } from "@/server/observability/log";
import type { RpcResult } from "@/server/workspace/use-cases";
import { createGitHubClient, type GitHubClient, type GitHubErrorCode } from "./client";
import { openGitHubToken, type OpenedToken } from "./store";

export interface DuePull {
  id: string;
  orgId: string;
  repo: string;
  number: number;
}

export interface PullSyncStore {
  due(limit: number): Promise<DuePull[]>;
  one(orgId: string, pullId: string): Promise<(DuePull & { syncedAt: string | null }) | null>;
  record(input: { id: string } & ({ state: PullState; mergedAt: string | null; headSha: string | null; checks: PullChecks | null } | { problem: string })): Promise<RpcResult<null>>;
}

export interface PullSyncDeps {
  store: PullSyncStore;
  token(orgId: string): Promise<OpenedToken>;
  client(token: string): GitHubClient;
}

const PROBLEMS: Partial<Record<GitHubErrorCode, string>> = {
  TOKEN_REJECTED: "GitHub refused the workspace's token. Connect GitHub again on the Connections page.",
  NOT_FOUND: "GitHub didn't find this pull request with the workspace's token. It may have been deleted, or the token can't see the repository.",
  RATE_LIMITED: "GitHub's rate limit was reached. It's read again on the next run.",
  UNREACHABLE: "GitHub didn't answer. It's read again on the next run.",
};

const problemFor = (code: GitHubErrorCode, what: string) => PROBLEMS[code] ?? `GitHub refused to show the ${what} (${code.toLowerCase().replace(/_/g, " ")}).`;

/** Reads one pull request and records what GitHub said. Checks are optional: a token without Checks access still records the state. */
export async function syncPull(client: GitHubClient, store: PullSyncStore, pull: DuePull): Promise<{ state: PullState; checks: PullChecks | null } | { problem: string }> {
  const [owner, repo] = pull.repo.split("/") as [string, string];
  const read = await client.pull(owner, repo, pull.number);
  if (!read.ok) {
    const problem = problemFor(read.code, "pull request");
    await store.record({ id: pull.id, problem });
    return { problem };
  }
  let checks: PullChecks | null = null;
  if (read.value.headSha) {
    const runs = await client.checkRuns(owner, repo, read.value.headSha);
    if (runs.ok) checks = summarizeChecks(runs.value);
  }
  const r = await store.record({ id: pull.id, state: read.value.state, mergedAt: read.value.mergedAt, headSha: read.value.headSha, checks });
  if (!r.ok) log("warn", "github.pull_sync_record_failed", { pull: pull.id, error: r.error });
  return { state: read.value.state, checks };
}

/** The hourly run: open (or never read) pull requests, oldest read first, one token per workspace. */
export async function syncDuePulls(deps: PullSyncDeps, limit = 60): Promise<{ read: number; merged: number; closed: number; problems: number }> {
  const due = await deps.store.due(limit);
  const tokens = new Map<string, OpenedToken>();
  const out = { read: 0, merged: 0, closed: 0, problems: 0 };
  for (const pull of due) {
    if (!tokens.has(pull.orgId)) tokens.set(pull.orgId, await deps.token(pull.orgId));
    const opened = tokens.get(pull.orgId)!;
    if (opened.state !== "ok") {
      await deps.store.record({ id: pull.id, problem: opened.state === "none" ? "GitHub isn't connected to this workspace any more, so the pull request can't be read." : "The workspace's GitHub token can't be opened. Connect GitHub again on the Connections page." });
      out.problems += 1;
      continue;
    }
    const r = await syncPull(deps.client(opened.token), deps.store, pull);
    if ("problem" in r) out.problems += 1;
    else {
      out.read += 1;
      if (r.state === "merged") out.merged += 1;
      if (r.state === "closed") out.closed += 1;
    }
  }
  return out;
}

const DueRow = z.object({ id: z.string(), org_id: z.string(), repo_full_name: z.string(), number: z.number().int(), synced_at: z.string().nullable() });

export function createSupabasePullSyncStore(admin: SupabaseClient): PullSyncStore {
  return {
    async due(limit) {
      // Open ones, or ones never read, opened in the last 30 days; the hourly run reads each at most every 30 minutes.
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const fresh = Date.now() - 30 * 60_000;
      const { data, error } = await admin
        .from("github_pull_requests")
        .select("id, org_id, repo_full_name, number, synced_at")
        .or("pr_state.is.null,pr_state.eq.open")
        .gt("opened_at", since)
        .order("synced_at", { ascending: true, nullsFirst: true })
        .limit(limit);
      if (error) throw new Error(`Couldn't list pull requests to read: ${error.message}`);
      return (data ?? []).flatMap((d) => {
        const r = DueRow.safeParse(d);
        if (!r.success || (r.data.synced_at && Date.parse(r.data.synced_at) > fresh)) return [];
        return [{ id: r.data.id, orgId: r.data.org_id, repo: r.data.repo_full_name, number: r.data.number }];
      });
    },
    async one(orgId, pullId) {
      if (!z.uuid().safeParse(pullId).success) return null;
      const { data } = await admin.from("github_pull_requests").select("id, org_id, repo_full_name, number, synced_at").eq("org_id", orgId).eq("id", pullId).maybeSingle();
      const r = DueRow.safeParse(data);
      return r.success ? { id: r.data.id, orgId: r.data.org_id, repo: r.data.repo_full_name, number: r.data.number, syncedAt: r.data.synced_at } : null;
    },
    async record(input) {
      const args =
        "problem" in input
          ? { p_pull: input.id, p_state: null, p_merged_at: null, p_head_sha: null, p_checks: null, p_problem: input.problem }
          : { p_pull: input.id, p_state: input.state, p_merged_at: input.mergedAt, p_head_sha: input.headSha, p_checks: input.checks, p_problem: null };
      const { error } = await admin.rpc("app_sync_github_pull", args);
      return error ? { ok: false, error: error.message } : { ok: true, value: null };
    },
  };
}

export function pullSyncDeps(admin: SupabaseClient): PullSyncDeps {
  return { store: createSupabasePullSyncStore(admin), token: (orgId) => openGitHubToken(admin, orgId), client: (token) => createGitHubClient(token) };
}
