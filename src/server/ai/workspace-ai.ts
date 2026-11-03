/**
 * A workspace's own model key (ADR 0125). An owner or admin can give the
 * workspace its own Anthropic API key, and optionally a company gateway (an
 * Anthropic-compatible https address). Server-only:
 *
 * - The key is checked with a free call to list models, then sealed with the
 *   provider-token vault (AES-256-GCM, bound to the workspace) before it's
 *   stored. It never goes back to a browser.
 * - A gateway must be https on a public address: no IP literals, no private,
 *   loopback or link-local ranges, checked when it's saved and again each
 *   time it's used, so Farbaek's server can't be pointed at its own network.
 * - Calls on the workspace's key don't count against Farbaek's allowance;
 *   `ownKeyMetering` logs their real token counts instead. The client and the
 *   metering come from the same `WorkspaceAi`, so a call can never use one
 *   key while being metered as the other.
 * - When a stored key can't be opened (the vault key changed), it fails
 *   closed: the workspace is told to set it again, and Farbaek never quietly
 *   sends its code through Farbaek's own key instead.
 */
import Anthropic from "@anthropic-ai/sdk";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderUsage } from "@/server/ai/contract-drafter";
import { openToken, sealToken, vaultKey } from "@/server/launch/token-vault";
import { resolveAiProvider, type AiProviderId } from "@/server/ai/config";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { AiUsageDeps } from "@/server/workspace/ai-usage";

const BIND = (orgId: string) => ({ orgId, provider: "model:anthropic" });
const ANTHROPIC_API = "https://api.anthropic.com";

export type WorkspaceAi =
  | { own: false }
  | { own: true; broken: false; apiKey: string; baseURL: string | null; hint: string }
  /** A key is set but can't be opened: AI calls refuse until it's set again. */
  | { own: true; broken: true; hint: string };

export const BROKEN_KEY = "This workspace's own AI key can't be read on this server anymore. An owner or admin can set it again in Settings, or remove it to use Farbaek's AI.";

/** The last characters of a key, so people can tell keys apart. */
export function keyHint(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, "").slice(-4).padStart(4, "x");
}

const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^(22[4-9]|2[3-5]\d)\./];
const PRIVATE_V6 = [/^::1$/, /^::$/, /^f[cd]/i, /^fe[89ab]/i, /^::ffff:/i];

export function isPublicAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) return !PRIVATE_V4.some((r) => r.test(address));
  if (v === 6) return !PRIVATE_V6.some((r) => r.test(address));
  return false;
}

/** A gateway address that's https on a public name, normalized; or why not. */
export function checkGatewayUrl(raw: string): { ok: true; url: string; host: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That isn't a web address." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "The gateway must use https." };
  if (url.username || url.password) return { ok: false, reason: "Leave the user name and password out of the address." };
  if (url.port && url.port !== "443") return { ok: false, reason: "The gateway must use the standard https port." };
  if (url.search || url.hash) return { ok: false, reason: "Leave query strings and fragments out of the address." };
  const host = url.hostname.toLowerCase();
  if (isIP(host.replace(/^\[|\]$/g, ""))) return { ok: false, reason: "Use the gateway's name, not an IP address." };
  if (host === "localhost" || /\.(local|localhost|internal|lan|home|corp)$/.test(host) || !host.includes(".")) return { ok: false, reason: "The gateway must have a public name." };
  const path = url.pathname.replace(/\/+$/, "");
  if (!/^(\/[A-Za-z0-9._~-]+)*$/.test(path)) return { ok: false, reason: "The address's path has characters Farbaek doesn't accept." };
  return { ok: true, url: `https://${host}${path}`, host };
}

/** Every address the gateway's name resolves to must be public, or it isn't used. */
export async function gatewayResolvesPublic(host: string, resolve: (host: string) => Promise<{ address: string }[]> = (h) => lookup(h, { all: true })): Promise<boolean> {
  try {
    const addresses = await resolve(host);
    return addresses.length > 0 && addresses.every((a) => isPublicAddress(a.address));
  } catch {
    return false;
  }
}

/** Checks a key with a free call that lists models. */
export async function checkAnthropicKey(apiKey: string, baseURL: string | null, fetcher: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const r = await fetcher(`${baseURL ?? ANTHROPIC_API}/v1/models?limit=1`, {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (r.ok) return { ok: true };
    if (r.status === 401 || r.status === 403) return { ok: false, reason: baseURL ? "The gateway didn't accept that key." : "Anthropic didn't accept that key. Check you copied all of it." };
    return { ok: false, reason: `${baseURL ? "The gateway" : "Anthropic"} answered with an error (${r.status}). Try again in a minute.` };
  } catch {
    return { ok: false, reason: baseURL ? "Farbaek couldn't reach the gateway at that address." : "Farbaek couldn't reach Anthropic just now. Try again in a minute." };
  }
}

export function sealModelKey(orgId: string, apiKey: string): string | null {
  const key = vaultKey();
  return key ? sealToken(apiKey, key, BIND(orgId)) : null;
}

/** The workspace's AI, read with the server key; Farbaek's own when no key is set. */
export async function loadWorkspaceAi(admin: SupabaseClient, orgId: string): Promise<WorkspaceAi> {
  const { data, error } = await admin.from("workspace_model_keys").select("key_sealed, key_hint, base_url").eq("org_id", orgId).maybeSingle();
  if (error) throw new Error(`Couldn't read the workspace's AI key: ${error.message}`);
  if (!data) return { own: false };
  const row = data as { key_sealed: string; key_hint: string; base_url: string | null };
  const key = vaultKey();
  const apiKey = key ? openToken(row.key_sealed, key, BIND(orgId)) : null;
  if (!apiKey) return { own: true, broken: true, hint: row.key_hint };
  if (row.base_url) {
    const checked = checkGatewayUrl(row.base_url);
    if (!checked.ok || !(await gatewayResolvesPublic(checked.host))) return { own: true, broken: true, hint: row.key_hint };
  }
  return { own: true, broken: false, apiKey, baseURL: row.base_url, hint: row.key_hint };
}

/** The Claude client for the workspace: its own key and gateway, or undefined for Farbaek's. */
export function workspaceAnthropic(ai: WorkspaceAi, options: { timeout: number; maxRetries?: number }): Anthropic | undefined {
  if (!ai.own || ai.broken) return undefined;
  return new Anthropic({ apiKey: ai.apiKey, baseURL: ai.baseURL ?? undefined, maxRetries: options.maxRetries ?? 1, timeout: options.timeout });
}

export interface OwnKeyRecord {
  orgId: string;
  actor: string;
  taskId: string | null;
  operation: string;
  usage: ProviderUsage;
}

/**
 * Metering for calls on the workspace's own key: a reservation never touches
 * Farbaek's allowance, and when it settles, its real token counts are logged
 * as the workspace's own use. Everything above (reserve, settle, refund,
 * free retries) works unchanged.
 */
export function ownKeyMetering<D extends AiUsageDeps>(deps: D, record: (row: OwnKeyRecord) => Promise<void>): D {
  const open = new Map<string, { orgId: string; actor: string; taskId: string | null; operation: string }>();
  return {
    ...deps,
    async reserveUsage(input) {
      const id = `own:${input.key}`;
      open.set(id, { orgId: input.orgId, actor: input.actor, taskId: input.taskId, operation: input.operation });
      return { ok: true as const, value: id };
    },
    async settleUsage(input) {
      if (!input.entryId.startsWith("own:")) return deps.settleUsage(input);
      const r = open.get(input.entryId);
      open.delete(input.entryId);
      if (r && input.usage) await record({ ...r, usage: input.usage }).catch(() => undefined);
      return { ok: true as const, value: null };
    },
  };
}

/**
 * The AI for one call: the workspace's own Anthropic key and its metering when
 * it has one, otherwise Farbaek's provider. The client and the metering come
 * from the same answer, so a call can't use one key and be metered as the
 * other. A key that can't be read fails closed. `claudeOnly` names a feature
 * that needs Claude, for the message when this server uses another provider.
 */
export async function aiForWorkspace<D extends AiUsageDeps>(
  orgId: string,
  deps: D,
  options: { timeout: number; claudeOnly?: string },
): Promise<{ provider: AiProviderId; client: Anthropic | undefined; deps: D; own: boolean } | { error: string }> {
  const admin = createSupabaseAdminClient();
  const own = admin ? await loadWorkspaceAi(admin, orgId) : ({ own: false } as const);
  if (own.own) {
    if (own.broken || !admin) return { error: BROKEN_KEY };
    return { provider: "anthropic", client: workspaceAnthropic(own, { timeout: options.timeout }), deps: ownKeyMetering(deps, recordOwnKeyUsage(admin)), own: true };
  }
  const ai = resolveAiProvider();
  if (!ai.provider) return { error: ai.reason };
  if (options.claudeOnly && ai.provider !== "anthropic") return { error: `${options.claudeOnly} isn't available with this server's AI setup.` };
  return { provider: ai.provider, client: undefined, deps, own: false };
}

/** Writes one own-key call to the workspace's log, with the server key. */
export function recordOwnKeyUsage(admin: SupabaseClient) {
  return async (row: OwnKeyRecord) => {
    const { error } = await admin.rpc("app_record_model_key_usage", {
      p_org: row.orgId,
      p_actor: row.actor,
      p_task: row.taskId,
      p_operation: row.operation,
      p_model: row.usage.model.slice(0, 100),
      p_input: row.usage.inputTokens,
      p_output: row.usage.outputTokens,
      p_cache_read: row.usage.cacheReadTokens ?? 0,
      p_cache_write: row.usage.cacheWriteTokens ?? 0,
    });
    if (error) throw new Error(error.message);
  };
}

export interface ModelKeyView {
  provider: "anthropic";
  hint: string;
  gateway: string | null;
  setAt: string;
  lastUsedAt: string | null;
}

/** What members may see of the workspace's key, read as the person: never the sealed value. */
export async function readModelKey(client: SupabaseClient, orgId: string): Promise<ModelKeyView | null> {
  const { data, error } = await client.from("workspace_model_keys").select("provider, key_hint, base_url, set_at, last_used_at").eq("org_id", orgId).maybeSingle();
  if (error || !data) return null;
  const row = data as { provider: "anthropic"; key_hint: string; base_url: string | null; set_at: string; last_used_at: string | null };
  return { provider: row.provider, hint: row.key_hint, gateway: row.base_url ? new URL(row.base_url).host : null, setAt: row.set_at, lastUsedAt: row.last_used_at };
}
