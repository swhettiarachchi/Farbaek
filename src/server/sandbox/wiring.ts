/**
 * Builds the sandbox service for one request, from either the signed-in
 * session cookie (app pages, server actions) or a bearer access token (the
 * v1 API and SDK). Identity always comes from a verified Supabase JWT; the
 * workspace must be one the person belongs to; reads go through their own
 * client so Row Level Security applies.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { looksLikeApiKey } from "@/core/workspace/api-keys";
import { accessTokenForKey, identifyKey } from "@/server/api-keys/keys";
import { bearerClient, createSupabaseSessionAuth } from "@/server/phone/wiring";
import { readSupabaseConfig } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { WORKSPACE_COOKIE } from "@/server/workspace/context";
import { checkFeature } from "@/core/billing/entitlements";
import { resolveEffectivePlan } from "@/core/billing/trial";
import { ORGANIZATION_SELECT, billingSnapshotFromRow } from "@/server/workspace/organizations";
import { createSupabaseReader } from "@/server/workspace/supabase-reader";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { ORG_ROLES, type OrgRole } from "@/server/workspace/types";
import type { ProofPackStatement } from "@/core/proof/proofpack";
import { checksToRun } from "@/core/realityloop/app-check";
import { resolveSandboxRuntime } from "./registry";
import { createSandboxService, type SandboxActor, type SandboxService, type TaskBridge } from "./service";
import { createSupabaseSandboxStore } from "./supabase-store";
import type { SandboxStore } from "./types";
import { signRecordedProofPack } from "@/server/proof/record";
import { latestEvidence } from "@/server/publish/store";
import { refreshPullStatusAfterProof } from "@/server/github/pull-requests";

export interface SandboxRequest {
  actor: SandboxActor;
  role: OrgRole;
  service: SandboxService;
  store: SandboxStore;
  via: "cookie" | "bearer";
}

export type SandboxRequestResult = { ok: true; value: SandboxRequest } | { ok: false; status: number; code: string; message: string };

function taskBridge(user: SupabaseClient, admin: SupabaseClient | null, userId: string): TaskBridge {
  const reader = createSupabaseReader(user);
  const writes = admin ? createSupabaseWriteDeps(user, admin, userId) : null;
  return {
    loadTask: async (orgId, taskId) => (writes ? writes.loadTask(orgId, taskId) : null),
    async requiredChecks(orgId, taskId) {
      const contract = await reader.getContract(orgId, taskId);
      if (!contract || contract.status !== "approved") return null;
      // A plan with no checks gets Farbaek's site check for a static site, or the app's own build and tests (ADR 0054, ADR 0058).
      if (contract.body.requiredChecks.length > 0) return contract.body.requiredChecks;
      const task = await reader.getTask(orgId, taskId);
      if (!task) return [];
      const paths = (await reader.listFiles(orgId, task.task.projectId)).map((f) => f.path);
      const manifest = paths.includes("package.json") ? await reader.getFile(orgId, task.task.projectId, "package.json") : null;
      return checksToRun([], paths, (p) => (p === "package.json" ? (manifest?.content ?? null) : null));
    },
    async appliedProofPack(orgId, taskId) {
      // Newest first; the change's own ProofPack is the newest one that isn't a verification record.
      for (const p of await reader.listProofPacks(orgId, taskId)) {
        const statement = p.statement as ProofPackStatement | null;
        if (!statement?.predicate || statement.predicate.verification || !Array.isArray(statement.predicate.changes)) continue;
        return { digest: p.digest, statement };
      }
      return null;
    },
    latestProjectProofPackDigest: async (orgId, projectId) => (writes ? writes.latestProofPackDigest(orgId, projectId) : null),
    filesChangedAfterChange: async (orgId, projectId) => (await latestEvidence(user, orgId, projectId)).status === "changed",
    async recordVerificationProofPack(i) {
      if (!admin) return { ok: false, error: "WRITES_UNAVAILABLE" };
      const { data, error } = await admin.rpc("app_record_verification_proofpack", {
        p_task: i.taskId,
        p_actor: i.actor,
        p_receipt: i.receiptDigest,
        p_statement: i.statement,
        p_digest: i.digest,
        p_status: i.status,
      });
      if (error) return { ok: false, error: error.message };
      if (typeof data !== "string") return { ok: false, error: "UNEXPECTED_RESPONSE" };
      // Farbaek signs the verification ProofPack it just recorded (ADR 0062).
      await signRecordedProofPack(admin, i.digest, i.statement);
      // The change's pull request on GitHub says what the checks found (ADR 0126); never in the way.
      void refreshPullStatusAfterProof(admin, i.digest);
      return { ok: true, value: data };
    },
    applyTransition: async (i) => (writes ? writes.applyTransition(i) : { ok: false, error: "WRITES_UNAVAILABLE" }),
    newEventId: () => crypto.randomUUID(),
  };
}

/** The service for an already-authenticated user and workspace. */
export function sandboxServiceFor(user: SupabaseClient, userId: string, orgId: string, role: OrgRole): SandboxRequest & { via: "cookie" } {
  const admin = createSupabaseAdminClient();
  const store = createSupabaseSandboxStore(user, admin);
  const service = createSandboxService({
    store,
    resolution: resolveSandboxRuntime(),
    role: async (o) => (o === orgId ? role : null),
    async billing(o) {
      const { data, error } = await user.from("organizations").select(ORGANIZATION_SELECT).eq("id", o).maybeSingle();
      if (error || !data) return null;
      try {
        return billingSnapshotFromRow(data);
      } catch {
        return null;
      }
    },
    tasks: taskBridge(user, admin, userId),
    now: () => new Date(),
    randomKey: () => crypto.randomUUID(),
  });
  return { actor: { userId, orgId }, role, service, store, via: "cookie" };
}

/** Same-origin check for cookie-authenticated changes. Bearer requests carry no ambient credentials, so they don't need it. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set<string>([new URL(request.url).origin]);
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    try {
      allowed.add(new URL(site).origin);
    } catch {
      // ignore a malformed setting
    }
  }
  return allowed.has(origin);
}

/** A token is the developer API, which Lite and up sell (ADR 0175). The Test space page uses the cookie, on every plan. */
async function developerApiRefusal(user: SupabaseClient, orgId: string): Promise<(SandboxRequestResult & { ok: false }) | null> {
  const { data } = await user.from("organizations").select(ORGANIZATION_SELECT).eq("id", orgId).maybeSingle();
  let snapshot = null;
  try {
    snapshot = data ? billingSnapshotFromRow(data) : null;
  } catch {
    snapshot = null;
  }
  const decision = checkFeature(snapshot ? resolveEffectivePlan(snapshot, new Date()) : null, "developer_api");
  if (decision.allowed) return null;
  return {
    ok: false,
    status: 403,
    code: decision.code,
    message: decision.code === "FEATURE_NOT_IN_PLAN" ? "The developer API comes with the Lite plan and up. You can still use the Test space in the app on this plan." : decision.message,
  };
}

export async function sandboxRequest(request: Request): Promise<SandboxRequestResult> {
  const config = readSupabaseConfig();
  if (!config) return { ok: false, status: 503, code: "NOT_CONFIGURED", message: "Accounts aren't configured on this server." };

  const header = request.headers.get("authorization");
  const bearer = header?.match(/^Bearer\s+([A-Za-z0-9._-]{20,4096})$/)?.[1] ?? null;
  let user: SupabaseClient | null;
  let userId: string | null = null;
  // A developer API key works in its own workspace only (ADR 0187).
  let keyOrg: string | null = null;

  if (bearer && looksLikeApiKey(bearer)) {
    const admin = createSupabaseAdminClient();
    if (!admin) return { ok: false, status: 503, code: "NOT_CONFIGURED", message: "API keys can't be checked on this server right now." };
    let identity: Awaited<ReturnType<typeof identifyKey>>;
    try {
      identity = await identifyKey(admin, bearer);
    } catch {
      // The database didn't answer: say so, so nobody replaces a key that still works.
      return { ok: false, status: 503, code: "UNAVAILABLE", message: "API keys can't be checked right now. Try again in a moment; the key itself is fine." };
    }
    if (!identity) {
      return { ok: false, status: 401, code: "INVALID_KEY", message: "This API key doesn't work. It may have been revoked or have expired, or the person who made it is no longer an owner or admin of its workspace." };
    }
    if (identity.suspended) return { ok: false, status: 403, code: "SUSPENDED", message: "This workspace is suspended, so its API keys don't work. Contact Farbaek support." };
    const asked = request.headers.get("x-farbaek-workspace");
    if (asked && asked !== identity.orgId) return { ok: false, status: 403, code: "WRONG_WORKSPACE", message: "This key works only in the workspace it was made in." };
    // A session for the key's maker, kept on this server, so Row Level Security applies to every call as it does for them.
    const access = await accessTokenForKey(identity, createSupabaseSessionAuth(admin, config), undefined, (token) => admin.auth.admin.signOut(token, "local"));
    if (!access) return { ok: false, status: 503, code: "UNAVAILABLE", message: "The API couldn't start a session for this key. Try again in a moment." };
    user = bearerClient(config, access);
    userId = identity.userId;
    keyOrg = identity.orgId;
  } else if (bearer) {
    user = createClient(config.url, config.publishableKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    // A malformed token makes getClaims throw rather than return an error; either way it's unauthenticated.
    const { data } = await user.auth.getClaims(bearer).catch(() => ({ data: null }));
    userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  } else {
    user = await createSupabaseServerClient();
    if (user) {
      const { data } = await user.auth.getClaims();
      userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
    }
    if (userId && !["GET", "HEAD"].includes(request.method) && !sameOrigin(request)) {
      return { ok: false, status: 403, code: "CROSS_SITE", message: "Cross-site requests aren't accepted. Use a bearer token for API clients." };
    }
  }
  if (!user || !userId) return { ok: false, status: 401, code: "UNAUTHENTICATED", message: "Sign in, or send a valid bearer access token." };

  const { data: memberships } = await user.from("organization_members").select("org_id, role").eq("user_id", userId);
  const rows = z.array(z.object({ org_id: z.string(), role: z.enum(ORG_ROLES) })).catch([]).parse(memberships ?? []);
  const wanted = keyOrg ?? request.headers.get("x-farbaek-workspace") ?? (bearer ? null : (await cookies()).get(WORKSPACE_COOKIE)?.value ?? null);
  const chosen = wanted ? rows.find((r) => r.org_id === wanted) : rows[0];
  if (!chosen) {
    return wanted
      ? { ok: false, status: 404, code: "NOT_FOUND", message: "That workspace doesn't exist or you're not a member." }
      : { ok: false, status: 403, code: "NO_WORKSPACE", message: "Create or join a workspace first." };
  }
  if (bearer) {
    const refused = await developerApiRefusal(user, chosen.org_id);
    if (refused) return refused;
  }
  const built = sandboxServiceFor(user, userId, chosen.org_id, chosen.role);
  return { ok: true, value: { ...built, via: bearer ? "bearer" : "cookie" } };
}
