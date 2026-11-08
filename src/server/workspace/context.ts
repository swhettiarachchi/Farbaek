import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { DEMO_USER } from "@/content/demo-workspace";
import { hasServerWriteKey } from "@/server/supabase/admin";
import { readSupabaseConfig } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { createDemoReader } from "./demo-reader";
import type { WorkspaceSummary } from "./organizations";
import { createSupabaseReader } from "./supabase-reader";
import { refreshPlatformState } from "@/server/platform/state";
import { CONTRIBUTOR_ROLES, type OrgRole, type WorkspaceReader } from "./types";
import type { WithheldPermissions } from "@/core/workspace/permissions";

/** Remembers the selected workspace. A preference only: access is still checked on every read. */
export const WORKSPACE_COOKIE = "fb_ws";

export type WriteAccess = { enabled: true } | { enabled: false; reason: string };

export interface AppContext {
  mode: "live" | "demo";
  user: { id: string; email: string };
  reader: WorkspaceReader;
  workspaces: WorkspaceSummary[];
  current: WorkspaceSummary | null;
  role: OrgRole | null;
  /** What an owner or admin turned off for the signed-in person (ADR 0087). */
  permissions: WithheldPermissions;
  writes: WriteAccess;
}

/**
 * The demo workspace is only available when Supabase is NOT configured, so
 * sample data can never appear next to a real tenant's data.
 */
export function isDemoMode(): boolean {
  return process.env.FARBAEK_DEMO_APP === "1" && readSupabaseConfig() === null;
}

/** Caches reader calls for the rest of the request, so the layout and the page share queries. */
function memoizeReader(reader: WorkspaceReader): WorkspaceReader {
  const memo = new Map<string, Promise<unknown>>();
  const wrap =
    <A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> => {
      const key = name + JSON.stringify(args);
      if (!memo.has(key)) memo.set(key, fn(...args));
      return memo.get(key) as Promise<R>;
    };
  return {
    mode: reader.mode,
    listWorkspaces: wrap("ws", reader.listWorkspaces),
    listMembers: wrap("members", reader.listMembers),
    listProjects: wrap("projects", reader.listProjects),
    listArchivedProjects: wrap("archivedProjects", reader.listArchivedProjects),
    getProject: wrap("project", reader.getProject),
    listTasks: wrap("tasks", reader.listTasks),
    getTask: wrap("task", reader.getTask),
    countEvaluations: wrap("evals", (orgId: string, from: Date, to: Date) => reader.countEvaluations(orgId, from, to)),
    listUsageGrants: wrap("grants", reader.listUsageGrants),
    getContract: wrap("contract", reader.getContract),
    listFiles: wrap("files", reader.listFiles),
    getFile: wrap("file", reader.getFile),
    searchFiles: wrap("search", reader.searchFiles),
    listFileRevisions: wrap("revisions", reader.listFileRevisions),
    getFileRevision: wrap("revision", reader.getFileRevision),
    listSkillPins: wrap("skillPins", reader.listSkillPins),
    getAutonomy: wrap("autonomy", reader.getAutonomy),
    getRuleVersions: wrap("ruleVersions", reader.getRuleVersions),
    listIncidents: wrap("incidents", reader.listIncidents),
    getIncident: wrap("incident", reader.getIncident),
    getIncidentChanges: wrap("incidentChanges", reader.getIncidentChanges),
    listProjectPaths: wrap("projectPaths", reader.listProjectPaths),
    getEmailPreferences: wrap("email preferences", reader.getEmailPreferences),
    getLatestProposal: wrap("proposal", reader.getLatestProposal),
    getLensSuggestion: wrap("lensSuggestion", reader.getLensSuggestion),
    getSecondCheck: wrap("secondCheck", reader.getSecondCheck),
    listTaskUsage: wrap("taskUsage", reader.listTaskUsage),
    listFileChanges: wrap("fileChanges", reader.listFileChanges),
    listTaskSandboxes: wrap("taskSandboxes", reader.listTaskSandboxes),
    listProofPacks: wrap("proofpacks", reader.listProofPacks),
    getProofPack: wrap("proofpack", reader.getProofPack),
    listRecentProofPacks: wrap("recentProofpacks", reader.listRecentProofPacks),
    getFirstStepRecords: wrap("firstSteps", reader.getFirstStepRecords),
    getFixFor: wrap("fixFor", reader.getFixFor),
    listRehearsal: wrap("rehearsal", reader.listRehearsal),
    listFileChangesSince: wrap("changesSince", reader.listFileChangesSince),
    // Not cached: file contents are too large to keep for the request.
    getProjectContents: reader.getProjectContents,
    getProjectImages: reader.getProjectImages,
    // Not cached: its argument carries file contents, too large for a cache key.
    getRecoverySource: reader.getRecoverySource,
    listRecoveries: wrap("recoveries", reader.listRecoveries),
    getRecovery: wrap("recovery", reader.getRecovery),
    listCheckReceipts: wrap("checkReceipts", reader.listCheckReceipts),
    getLatestVerification: wrap("verification", reader.getLatestVerification),
    listInvitations: wrap("invitations", reader.listInvitations),
    listActivity: wrap("activity", reader.listActivity),
    listAgents: wrap("agents", reader.listAgents),
    getProjectGraph: wrap("projectGraph", reader.getProjectGraph),
    listWorkflows: wrap("workflows", reader.listWorkflows),
    getWorkflow: wrap("workflow", reader.getWorkflow),
  };
}

function pickCurrent(workspaces: WorkspaceSummary[], preferred: string | undefined): WorkspaceSummary | null {
  return workspaces.find((w) => w.id === preferred) ?? workspaces[0] ?? null;
}

/**
 * Loads everything a signed-in app page needs, once per request.
 * Returns null when neither Supabase nor the demo is configured.
 * Redirects to sign-in when there's no session.
 */
export const loadAppContext = cache(async (): Promise<AppContext | null> => {
  const preferred = (await cookies()).get(WORKSPACE_COOKIE)?.value;

  if (isDemoMode()) {
    const reader = createDemoReader();
    const workspaces = await reader.listWorkspaces();
    return {
      mode: "demo",
      user: { ...DEMO_USER },
      reader,
      workspaces,
      current: pickCurrent(workspaces, preferred),
      role: "owner",
      permissions: {},
      writes: { enabled: false, reason: "This is the demo workspace with sample data. Nothing you do here is saved." },
    };
  }

  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data } = await client.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/sign-in");

  return liveContext(createSupabaseReader(client), { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "your account" }, preferred);
});

/**
 * The signed-in context from a reader that acts as the person, wherever the
 * session came from: the browser's cookies, or a phone's access token (ADR 0110).
 */
export async function liveContext(source: WorkspaceReader, user: { id: string; email: string }, preferred: string | undefined): Promise<AppContext> {
  const reader = memoizeReader(source);
  // Office Space's pause switches, so AI, sandbox and publish messages explain a pause (ADR 0032).
  const [workspaces] = await Promise.all([reader.listWorkspaces(), refreshPlatformState()]);
  const current = pickCurrent(workspaces, preferred);
  const me = current ? (await reader.listMembers(current.id)).find((m) => m.userId === user.id) : undefined;
  const role = me?.role ?? null;

  let writes: WriteAccess = { enabled: true };
  if (!hasServerWriteKey()) {
    writes = {
      enabled: false,
      reason: "Farbaek's server isn't set up to save changes yet, so nothing here can be changed. Write to support@farbaek.com.",
    };
  } else if (current?.suspension) {
    // Paused by Farbaek staff (ADR 0032); the database refuses writes too.
    writes = { enabled: false, reason: `Farbaek has paused this workspace: ${current.suspension.notice}` };
  } else if (role && !CONTRIBUTOR_ROLES.includes(role)) {
    writes = { enabled: false, reason: "You have view-only access to this workspace." };
  }

  return {
    mode: "live",
    user,
    reader,
    workspaces,
    current,
    role,
    permissions: me?.permissions ?? {},
    writes,
  };
}
