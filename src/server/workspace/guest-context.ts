/**
 * The signed-in person as a guest on one project (ADR 0188). The project's
 * workspace comes from their own guest row, never from the workspace cookie,
 * and every read goes through their session, so Row Level Security shows
 * them that project and nothing else of the workspace.
 */
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { GUEST_ACCESS, type GuestAccess } from "@/core/workspace/sharing";
import { createSupabaseAdminClient, hasServerWriteKey } from "@/server/supabase/admin";
import { readSupabaseConfig } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { createSupabaseSharingDeps } from "./sharing-wiring";
import type { SharedProject } from "./sharing";
import { createSupabaseReader } from "./supabase-reader";
import type { Project, WorkspaceReader } from "./types";

export type GuestWrites = { enabled: true } | { enabled: false; reason: string };

export interface GuestProject {
  user: { id: string; email: string };
  reader: WorkspaceReader;
  orgId: string;
  orgName: string;
  project: Project;
  access: GuestAccess;
  writes: GuestWrites;
  /** The project's published site while it's live, by name (ADR 0029). */
  liveSiteName: string | null;
}

/** The signed-in person, or a redirect to sign in and come back. Null where the app isn't configured. */
export const guestSession = cache(async (next: string) => {
  if (!readSupabaseConfig()) return null;
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data } = await client.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return { client, user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "your account" } };
});

/** The projects shared with the signed-in person. */
export const loadSharedWithMe = cache(async (): Promise<{ user: { id: string; email: string }; projects: SharedProject[] } | null> => {
  const session = await guestSession("/shared");
  const admin = createSupabaseAdminClient();
  if (!session || !admin) return null;
  return { user: session.user, projects: await createSupabaseSharingDeps(admin).sharedWithMe(session.user.id) };
});

/** One shared project, or null when the person isn't a guest on it. */
export const loadGuestProject = cache(async (projectId: string): Promise<GuestProject | null> => {
  if (!z.uuid().safeParse(projectId).success) return null;
  const session = await guestSession(`/shared/${projectId}`);
  if (!session) return null;
  const { data } = await session.client.from("project_guests").select("org_id, access").eq("project_id", projectId).eq("user_id", session.user.id).maybeSingle();
  const row = z.object({ org_id: z.string(), access: z.enum(GUEST_ACCESS) }).safeParse(data);
  if (!row.success) return null;

  const reader = createSupabaseReader(session.client);
  const project = await reader.getProject(row.data.org_id, projectId);
  if (!project) return null;
  const shared = (await loadSharedWithMe())?.projects.find((p) => p.projectId === projectId);
  const { data: site } = await session.client.from("sites").select("name").eq("project_id", projectId).not("live_deployment_id", "is", null).is("blocked_at", null).maybeSingle();
  const liveSiteName = z.object({ name: z.string() }).safeParse(site).data?.name ?? null;

  let writes: GuestWrites = { enabled: true };
  if (row.data.access !== "edit") writes = { enabled: false, reason: "You can view this project, but not change it." };
  else if (!hasServerWriteKey()) writes = { enabled: false, reason: "Farbaek's server isn't set up to save changes yet. Write to support@farbaek.com." };
  else if (project.archivedAt) writes = { enabled: false, reason: "This project is archived, so it can't change." };
  else if (shared?.suspended) writes = { enabled: false, reason: "Farbaek has paused the workspace this project belongs to, so it can't change right now." };

  return {
    user: session.user,
    reader,
    orgId: row.data.org_id,
    orgName: shared?.orgName ?? "another workspace",
    project,
    access: row.data.access,
    writes,
    liveSiteName,
  };
});
