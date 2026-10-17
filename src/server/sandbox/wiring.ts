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
import { readSupabaseConfig } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { WORKSPACE_COOKIE } from "@/server/workspace/context";
import { ORGANIZATION_SELECT, billingSnapshotFromRow } from "@/server/workspace/organizations";
import { createSupabaseReader } from "@/server/workspace/supabase-reader";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { ORG_ROLES, type OrgRole } from "@/server/workspace/types";
import { resolveSandboxRuntime } from "./registry";
import { createSandboxService, type SandboxActor, type SandboxService, type TaskBridge } from "./service";
import { createSupabaseSandboxStore } from "./supabase-store";
import type { SandboxStore } from "./types";

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
      return contract && contract.status === "approved" ? contract.body.requiredChecks : null;
    },
    async latestProofPackDigest(orgId, taskId) {
      return (await reader.listProofPacks(orgId, taskId))[0]?.digest ?? null;
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

export async function sandboxRequest(request: Request): Promise<SandboxRequestResult> {
  const config = readSupabaseConfig();
  if (!config) return { ok: false, status: 503, code: "NOT_CONFIGURED", message: "Accounts aren't configured on this server." };

  const header = request.headers.get("authorization");
  const bearer = header?.match(/^Bearer\s+([A-Za-z0-9._-]{20,4096})$/)?.[1] ?? null;
  let user: SupabaseClient | null;
  let userId: string | null = null;

  if (bearer) {
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
  const wanted = request.headers.get("x-farbaek-workspace") ?? (bearer ? null : (await cookies()).get(WORKSPACE_COOKIE)?.value ?? null);
  const chosen = wanted ? rows.find((r) => r.org_id === wanted) : rows[0];
  if (!chosen) {
    return wanted
      ? { ok: false, status: 404, code: "NOT_FOUND", message: "That workspace doesn't exist or you're not a member." }
      : { ok: false, status: 403, code: "NO_WORKSPACE", message: "Create or join a workspace first." };
  }
  const built = sandboxServiceFor(user, userId, chosen.org_id, chosen.role);
  return { ok: true, value: { ...built, via: bearer ? "bearer" : "cookie" } };
}
