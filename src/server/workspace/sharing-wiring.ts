/**
 * SharingDeps on Supabase (migration v91). Every call goes through the
 * service-role app_* functions, which check the person again; the server
 * key never reads a project for someone the database didn't let in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { GUEST_ACCESS, LINK_STATES } from "@/core/workspace/sharing";
import { ORGANIZATION_SELECT, billingSnapshotFromRow } from "./organizations";
import type { ShareLookup, SharingDeps } from "./sharing";
import type { RpcResult } from "./use-cases";

const access = z.enum(GUEST_ACCESS);
const nothing = z.null().or(z.literal("")).or(z.undefined()).transform(() => null);

const SharingSchema = z.object({
  can_share: z.boolean(),
  guests: z.array(z.object({ user_id: z.string(), email: z.string(), access, since: z.string() })),
  invitations: z.array(z.object({ id: z.string(), email: z.string(), access, expires_at: z.string() })),
  links: z.array(z.object({ id: z.string(), created_at: z.string(), expires_at: z.string().nullable(), allow_download: z.boolean(), last_opened_at: z.string().nullable() })),
});

const ShareViewSchema = z.union([
  z.object({
    state: z.literal("live"),
    project: z.object({ id: z.string(), name: z.string(), description: z.string().nullable() }),
    allow_download: z.boolean(),
    expires_at: z.string().nullable(),
    files: z.array(z.object({ path: z.string(), size_bytes: z.number().int(), encoding: z.enum(["utf8", "base64"]).catch("utf8"), updated_at: z.string() })),
    site: z.object({ name: z.string() }).nullable(),
    verified: z.boolean(),
  }),
  z.object({ state: z.enum(LINK_STATES).exclude(["live"]) }),
]);

export function createSupabaseSharingDeps(admin: SupabaseClient): SharingDeps {
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }

  return {
    now: () => new Date(),

    async orgBillingAsSystem(orgId) {
      const { data, error } = await admin.from("organizations").select(ORGANIZATION_SELECT).eq("id", orgId).maybeSingle();
      if (error || !data) return null;
      try {
        return billingSnapshotFromRow(data);
      } catch {
        return null;
      }
    },

    async projectOrg(projectId) {
      if (!z.uuid().safeParse(projectId).success) return null;
      const { data } = await admin.from("projects").select("org_id").eq("id", projectId).maybeSingle();
      const parsed = z.object({ org_id: z.string() }).safeParse(data);
      return parsed.success ? parsed.data.org_id : null;
    },

    createInvitation: (i) =>
      rpc(
        "app_create_project_invitation",
        { p_project: i.projectId, p_actor: i.actor, p_email: i.email, p_access: i.access, p_token_sha256: i.tokenSha256, p_expires_at: i.expiresAt, p_seat_limit: i.seatLimit },
        z.string(),
      ),

    revokeInvitation: (i) => rpc("app_revoke_project_invitation", { p_invitation: i.invitationId, p_actor: i.actor }, nothing),

    async invitationPreview(tokenSha256) {
      const { data, error } = await admin.rpc("app_project_invitation_preview", { p_token_sha256: tokenSha256 });
      if (error) throw new Error(`Couldn't read the invitation: ${error.message}`);
      const rows = z
        .array(
          z.object({
            org_id: z.string(),
            org_name: z.string(),
            project_id: z.string(),
            project_name: z.string(),
            access,
            email: z.string(),
            expires_at: z.string(),
            state: z.enum(["open", "accepted", "revoked", "expired"]),
          }),
        )
        .parse(data ?? []);
      const r = rows[0];
      return r
        ? { orgId: r.org_id, orgName: r.org_name, projectId: r.project_id, projectName: r.project_name, access: r.access, email: r.email, expiresAt: r.expires_at, state: r.state }
        : null;
    },

    acceptInvitation: (i) => rpc("app_accept_project_invitation", { p_token_sha256: i.tokenSha256, p_actor: i.actor, p_seat_limit: i.seatLimit }, z.string()),

    setGuestAccess: (i) =>
      rpc("app_set_project_guest_access", { p_project: i.projectId, p_actor: i.actor, p_user: i.userId, p_access: i.access, p_seat_limit: i.seatLimit }, nothing),

    removeGuest: (i) => rpc("app_remove_project_guest", { p_project: i.projectId, p_actor: i.actor, p_user: i.userId }, nothing),

    async sharing(i) {
      const r = await rpc("app_project_sharing", { p_project: i.projectId, p_actor: i.actor }, SharingSchema);
      if (!r.ok) return r;
      const s = r.value;
      return {
        ok: true,
        value: {
          canShare: s.can_share,
          guests: s.guests.map((g) => ({ userId: g.user_id, email: g.email, access: g.access, since: g.since })),
          invitations: s.invitations.map((v) => ({ id: v.id, email: v.email, access: v.access, expiresAt: v.expires_at })),
          links: s.links.map((l) => ({ id: l.id, createdAt: l.created_at, expiresAt: l.expires_at, allowDownload: l.allow_download, lastOpenedAt: l.last_opened_at })),
        },
      };
    },

    async sharedWithMe(userId) {
      const { data, error } = await admin.rpc("app_shared_with_me", { p_user: userId });
      if (error) throw new Error(`Couldn't read the projects shared with you: ${error.message}`);
      return z
        .array(
          z.object({
            project_id: z.string(),
            project_name: z.string(),
            project_description: z.string().nullable(),
            org_id: z.string(),
            org_name: z.string(),
            access,
            since: z.string(),
            archived: z.boolean(),
            suspended: z.boolean(),
          }),
        )
        .parse(data ?? [])
        .map((r) => ({
          projectId: r.project_id,
          projectName: r.project_name,
          projectDescription: r.project_description,
          orgId: r.org_id,
          orgName: r.org_name,
          access: r.access,
          since: r.since,
          archived: r.archived,
          suspended: r.suspended,
        }));
    },

    createLink: (i) =>
      rpc("app_create_share_link", { p_project: i.projectId, p_actor: i.actor, p_token_sha256: i.tokenSha256, p_expires_at: i.expiresAt, p_allow_download: i.allowDownload }, z.string()),

    revokeLink: (i) => rpc("app_revoke_share_link", { p_link: i.linkId, p_actor: i.actor }, nothing),

    async shareView(tokenSha256): Promise<ShareLookup> {
      const { data, error } = await admin.rpc("app_project_for_share", { p_token_sha256: tokenSha256 });
      // A link that can't be read fails closed, as if it didn't exist.
      if (error) return { state: "none" };
      const parsed = ShareViewSchema.safeParse(data);
      if (!parsed.success) return { state: "none" };
      const v = parsed.data;
      if (v.state !== "live") return { state: v.state };
      return {
        state: "live",
        project: v.project,
        allowDownload: v.allow_download,
        expiresAt: v.expires_at,
        files: v.files.map((f) => ({ path: f.path, sizeBytes: f.size_bytes, encoding: f.encoding, updatedAt: f.updated_at })),
        site: v.site,
        verified: v.verified,
      };
    },

    async shareFile(tokenSha256, path) {
      const { data, error } = await admin.rpc("app_share_file", { p_token_sha256: tokenSha256, p_path: path });
      if (error) return null;
      const rows = z.array(z.object({ path: z.string(), content: z.string().nullable(), encoding: z.enum(["utf8", "base64"]).catch("utf8"), size_bytes: z.number().int() })).safeParse(data ?? []);
      const r = rows.success ? rows.data[0] : undefined;
      return r && r.content !== null ? { path: r.path, content: r.content, encoding: r.encoding, sizeBytes: r.size_bytes } : null;
    },

    async shareFiles(tokenSha256) {
      const { data, error } = await admin.rpc("app_share_files", { p_token_sha256: tokenSha256 });
      if (error) return null;
      const rows = z.array(z.object({ path: z.string(), content: z.string().nullable(), encoding: z.enum(["utf8", "base64"]).catch("utf8"), size_bytes: z.number().int() })).safeParse(data ?? []);
      if (!rows.success) return null;
      return rows.data.filter((r) => r.content !== null).map((r) => ({ path: r.path, content: r.content as string, encoding: r.encoding, sizeBytes: r.size_bytes }));
    },
  };
}
