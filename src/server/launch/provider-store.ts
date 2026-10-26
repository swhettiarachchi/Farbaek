/**
 * Provider connections and launch orders in the database (migrations v48 and v59,
 * ADR 0078, ADR 0093). Writes go through the service-role functions, which re-check
 * the person; pages read through the person's own client, whose column
 * grants leave the sealed token out.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { LAUNCH_PROVIDERS, type LaunchProvider } from "@/core/launch/providers";
import type { OrderStatus } from "@/core/launch/vercel";
import type { EvidenceStatus } from "@/core/publish/evidence";
import type { RpcResult } from "@/server/workspace/use-cases";

export type Provider = LaunchProvider;

export interface ConnectionView {
  provider: Provider;
  accountName: string;
  teamId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface LaunchOrderView {
  id: string;
  provider: Provider;
  status: OrderStatus;
  targetName: string;
  accountName: string;
  filesDigest: string;
  fileCount: number;
  totalBytes: number;
  evidence: EvidenceStatus;
  evidenceProofPack: string | null;
  overrideReason: string | null;
  authorizedBy: string | null;
  authorizedAt: string;
  deploymentId: string | null;
  url: string | null;
  inspectorUrl: string | null;
  failure: string | null;
  healthStatus: number | null;
  healthCheckedAt: string | null;
  updatedAt: string;
  finishedAt: string | null;
}

const CONNECTION_COLUMNS = "provider, account_name, team_id, created_at, last_used_at";
const ConnectionRow = z.object({ provider: z.enum(LAUNCH_PROVIDERS), account_name: z.string(), team_id: z.string().nullable(), created_at: z.string(), last_used_at: z.string().nullable() });

const toConnection = (r: z.infer<typeof ConnectionRow>): ConnectionView => ({ provider: r.provider, accountName: r.account_name, teamId: r.team_id, createdAt: r.created_at, lastUsedAt: r.last_used_at });

const ORDER_COLUMNS =
  "id, provider, status, target_name, account_name, files_digest, file_count, total_bytes, evidence, evidence_proofpack, override_reason, authorized_by, authorized_at, provider_deployment_id, url, inspector_url, failure, health_status, health_checked_at, updated_at, finished_at";
const OrderRow = z.object({
  id: z.string(),
  provider: z.enum(LAUNCH_PROVIDERS),
  status: z.enum(["authorized", "uploading", "building", "ready", "failed"]),
  target_name: z.string(),
  account_name: z.string(),
  files_digest: z.string(),
  file_count: z.number().int(),
  total_bytes: z.coerce.number(),
  evidence: z.enum(["verified", "unverified", "partially_verified", "failed", "changed", "none"]),
  evidence_proofpack: z.string().nullable(),
  override_reason: z.string().nullable(),
  authorized_by: z.string().nullable(),
  authorized_at: z.string(),
  provider_deployment_id: z.string().nullable(),
  url: z.string().nullable(),
  inspector_url: z.string().nullable(),
  failure: z.string().nullable(),
  health_status: z.number().int().nullable(),
  health_checked_at: z.string().nullable(),
  updated_at: z.string(),
  finished_at: z.string().nullable(),
});

const toOrder = (r: z.infer<typeof OrderRow>): LaunchOrderView => ({
  id: r.id,
  provider: r.provider,
  status: r.status,
  targetName: r.target_name,
  accountName: r.account_name,
  filesDigest: r.files_digest,
  fileCount: r.file_count,
  totalBytes: r.total_bytes,
  evidence: r.evidence,
  evidenceProofPack: r.evidence_proofpack,
  overrideReason: r.override_reason,
  authorizedBy: r.authorized_by,
  authorizedAt: r.authorized_at,
  deploymentId: r.provider_deployment_id,
  url: r.url,
  inspectorUrl: r.inspector_url,
  failure: r.failure,
  healthStatus: r.health_status,
  healthCheckedAt: r.health_checked_at,
  updatedAt: r.updated_at,
  finishedAt: r.finished_at,
});

/** The workspace's connection with a provider, read as the person: who it belongs to, never the token. */
export async function readConnection(client: SupabaseClient, orgId: string, provider: Provider): Promise<ConnectionView | null> {
  const { data, error } = await client.from("provider_connections").select(CONNECTION_COLUMNS).eq("org_id", orgId).eq("provider", provider).maybeSingle();
  if (error) throw new Error(`Couldn't read the connection: ${error.message}`);
  if (!data) return null;
  return toConnection(ConnectionRow.parse(data));
}

/** The workspace's connections with every provider, read as the person. */
export async function readConnections(client: SupabaseClient, orgId: string): Promise<Partial<Record<Provider, ConnectionView>>> {
  const { data, error } = await client.from("provider_connections").select(CONNECTION_COLUMNS).eq("org_id", orgId);
  if (error) throw new Error(`Couldn't read the connections: ${error.message}`);
  const out: Partial<Record<Provider, ConnectionView>> = {};
  for (const row of z.array(ConnectionRow).parse(data)) out[row.provider] = toConnection(row);
  return out;
}

/** A project's launches, newest first, read as the person. */
export async function listLaunchOrders(client: SupabaseClient, orgId: string, projectId: string, limit = 10): Promise<LaunchOrderView[]> {
  const { data, error } = await client.from("launch_orders").select(ORDER_COLUMNS).eq("org_id", orgId).eq("project_id", projectId).order("authorized_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Couldn't read the launches: ${error.message}`);
  return z.array(OrderRow).parse(data).map(toOrder);
}

export interface LaunchStore {
  connect(input: { orgId: string; actor: string; provider: Provider; accountId: string; accountName: string; teamId: string | null; sealed: string; limit: number | null }): Promise<RpcResult<string>>;
  disconnect(input: { orgId: string; actor: string; provider: Provider }): Promise<RpcResult<null>>;
  /** The sealed token and team, read with the server's key; only the launch runner opens it. */
  sealedToken(orgId: string, provider: Provider): Promise<{ sealed: string; teamId: string | null } | null>;
  authorize(input: { orgId: string; actor: string; projectId: string; provider: Provider; key: string; target: string; digest: string; fileCount: number; bytes: number; overrideReason: string | null }): Promise<RpcResult<string>>;
  update(input: { id: string; status: Exclude<OrderStatus, "authorized">; deploymentId?: string | null; url?: string | null; inspectorUrl?: string | null; failure?: string | null }): Promise<RpcResult<null>>;
  recordHealth(input: { id: string; status: number }): Promise<RpcResult<null>>;
  order(orgId: string, id: string): Promise<LaunchOrderView | null>;
}

const nothing = z.null().or(z.literal("")).transform(() => null);

export function createSupabaseLaunchStore(admin: SupabaseClient): LaunchStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }
  return {
    connect: (i) =>
      rpc(
        "app_connect_provider",
        { p_org: i.orgId, p_actor: i.actor, p_provider: i.provider, p_account_id: i.accountId, p_account_name: i.accountName, p_team_id: i.teamId, p_sealed: i.sealed, p_limit: i.limit },
        z.string(),
      ),
    disconnect: (i) => rpc("app_disconnect_provider", { p_org: i.orgId, p_actor: i.actor, p_provider: i.provider }, nothing),
    async sealedToken(orgId, provider) {
      const { data, error } = await admin.from("provider_connections").select("token_sealed, team_id").eq("org_id", orgId).eq("provider", provider).maybeSingle();
      if (error) throw new Error(`Couldn't read the connection: ${error.message}`);
      if (!data) return null;
      const r = z.object({ token_sealed: z.string(), team_id: z.string().nullable() }).parse(data);
      return { sealed: r.token_sealed, teamId: r.team_id };
    },
    authorize: (i) =>
      rpc(
        "app_authorize_launch",
        {
          p_org: i.orgId,
          p_actor: i.actor,
          p_project: i.projectId,
          p_provider: i.provider,
          p_key: i.key,
          p_target: i.target,
          p_digest: i.digest,
          p_file_count: i.fileCount,
          p_bytes: i.bytes,
          p_override_reason: i.overrideReason,
        },
        z.string(),
      ),
    update: (i) =>
      rpc(
        "app_update_launch_order",
        { p_id: i.id, p_status: i.status, p_deployment: i.deploymentId ?? null, p_url: i.url ?? null, p_inspector: i.inspectorUrl ?? null, p_failure: i.failure ?? null },
        nothing,
      ),
    recordHealth: (i) => rpc("app_record_launch_health", { p_id: i.id, p_status: i.status }, nothing),
    async order(orgId, id) {
      const { data, error } = await admin.from("launch_orders").select(ORDER_COLUMNS).eq("org_id", orgId).eq("id", id).maybeSingle();
      if (error) throw new Error(`Couldn't read the launch: ${error.message}`);
      return data ? toOrder(OrderRow.parse(data)) : null;
    },
  };
}
