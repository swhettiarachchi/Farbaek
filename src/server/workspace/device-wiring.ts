/**
 * The signed-in person for the device routes (ADR 0192), from the browser's
 * session cookie. A fetch from the device page must learn it was signed out
 * as an answer it can read, not as a redirect to the sign-in page.
 */
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { WORKSPACE_COOKIE, isDemoMode, liveContext, loadAppContext, type AppContext } from "./context";
import { saveProjectFile } from "./files";
import { createSupabaseReader } from "./supabase-reader";
import { createSupabaseWriteDeps } from "./supabase-writer";
import { CONTRIBUTOR_ROLES, type Project } from "./types";
import { currentFile, type DeviceSaveDeps } from "./device-saves";

export type Refusal = { status: 401 | 403 | 404 | 503; code: string; message: string };

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });

/** Whether anyone is signed in: cheap, so a route can refuse before reading a large body. */
export async function deviceSignedIn(): Promise<Refusal | null> {
  if (isDemoMode()) return null;
  const client = await createSupabaseServerClient();
  if (!client) return { status: 503, code: "NOT_CONFIGURED", message: "Farbaek's server isn't set up for this yet." };
  const { data } = await client.auth.getClaims();
  return data?.claims?.sub ? null : { status: 401, code: "SIGNED_OUT", message: "Sign in to Farbaek again, then send your changes." };
}

/**
 * The person and the workspace. A save names the workspace its copy came
 * from, so it goes there whichever workspace the browser has open, and only
 * if the person is still a member.
 */
export async function deviceContext(orgId?: string): Promise<{ ctx: AppContext; orgId: string } | Refusal> {
  let ctx: AppContext | null;
  if (isDemoMode()) {
    ctx = await loadAppContext();
  } else {
    const client = await createSupabaseServerClient();
    if (!client) return { status: 503, code: "NOT_CONFIGURED", message: "Farbaek's server isn't set up for this yet." };
    const { data } = await client.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) return { status: 401, code: "SIGNED_OUT", message: "Sign in to Farbaek again, then send your changes." };
    const preferred = orgId ?? (await cookies()).get(WORKSPACE_COOKIE)?.value;
    ctx = await liveContext(createSupabaseReader(client), { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "your account" }, preferred);
  }
  if (!ctx) return { status: 503, code: "NOT_CONFIGURED", message: "Farbaek's server isn't set up for this yet." };
  if (!ctx.current) return { status: 404, code: "NO_WORKSPACE", message: "Make a workspace first." };
  if (orgId && ctx.current.id !== orgId) return { status: 404, code: "NOT_FOUND", message: "The workspace this copy came from isn't one you're in any more." };
  return { ctx, orgId: ctx.current.id };
}

/** Why this person can't change the project, in the web's own words; null when they can. */
export function saveReason(ctx: AppContext, project: Pick<Project, "archivedAt">): string | null {
  if (!ctx.writes.enabled) return ctx.writes.reason;
  if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return "You have view-only access to this workspace.";
  if (project.archivedAt) return "This project is archived, so nothing in it can change.";
  return null;
}

/** Saves as the person, through the editor's own use case. */
export async function deviceSaveDeps(ctx: AppContext, orgId: string, projectId: string): Promise<DeviceSaveDeps | Refusal> {
  if (!ctx.writes.enabled) return { status: 403, code: "READ_ONLY", message: ctx.writes.reason };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { status: 503, code: "NOT_CONFIGURED", message: "Farbaek's server isn't set up to save changes yet. Write to support@farbaek.com." };
  const deps = createSupabaseWriteDeps(user, admin, ctx.user.id);
  return {
    save: (input) => saveProjectFile(deps, { orgId, userId: ctx.user.id, projectId, path: input.path.trim(), content: input.content, expectedRevision: input.expectedRevision }),
    current: (path) => currentFile(ctx.reader, orgId, projectId, path),
  };
}
