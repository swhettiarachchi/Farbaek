/**
 * The Mesh relay on this server (ADR 0094): one hub for the whole app
 * process, the database's allowance and audit behind it, and the HTTP glue
 * the /api/v1/agent/relay routes share. Agents authenticate with their own
 * token as for every agent route, in a rate-limit bucket of their own.
 */
import { z } from "zod";
import { problem, withAgent } from "@/server/agent/http";
import type { AgentIdentity, AgentStore } from "@/server/agent/service";
import { log } from "@/server/observability/log";
import { sameOrigin } from "@/server/sandbox/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";
import { RELAY_LIMITS, RelayHub, type RelayAgent, type RelayErrorCode } from "./relay-hub";

const STATUS: Record<RelayErrorCode, number> = { NOT_FOUND: 404, FORBIDDEN: 403, NOT_REACHABLE: 409, BUSY: 429, GAP: 409, TOO_LARGE: 413, CLOSED: 410 };

/** The one hub of this app process, shared by every route bundle. */
export function relayHub(): RelayHub {
  const g = globalThis as { __farbaekRelayHub?: RelayHub };
  g.__farbaekRelayHub ??= new RelayHub({
    async charge(orgId, bytes) {
      const admin = createSupabaseAdminClient();
      // Without the database the day can't be counted, so the relay doesn't carry on uncounted.
      if (!admin) return false;
      const { data, error } = await admin.rpc("app_mesh_relay_use", { p_org: orgId, p_bytes: bytes, p_cap: RELAY_LIMITS.dailyBytes });
      if (error) {
        log("warn", "relay.charge_failed", { org: orgId, error: error.message });
        return false;
      }
      return data === true;
    },
    async ended(info) {
      const admin = createSupabaseAdminClient();
      if (!admin) return;
      // Two agents: v60's record. A browser on either side: v61's, as the person whose browser it was.
      const browser = [info.caller, info.callee].find((id) => id.startsWith("browser:"));
      const { error } = browser
        ? await admin.rpc("app_mesh_relay_party_session_ended", { p_org: info.orgId, p_actor: browser.split(":")[1], p_caller: info.caller, p_callee: info.callee, p_bytes: info.bytes, p_reason: info.reason })
        : await admin.rpc("app_mesh_relay_session_ended", { p_org: info.orgId, p_caller: info.caller, p_callee: info.callee, p_bytes: info.bytes, p_reason: info.reason });
      if (error) log("warn", "relay.audit_failed", { org: info.orgId, error: error.message });
    },
  });
  return g.__farbaekRelayHub;
}

export const relayError = (r: { code: RelayErrorCode; message: string }) => problem(STATUS[r.code], r.code, r.message);

/** An agent route of the relay: the agent's token, its own rate-limit bucket, and only agents whose person is still in the workspace. */
export function withRelayAgent(request: Request, handler: (ctx: { store: AgentStore; agent: AgentIdentity; relay: RelayAgent; hub: RelayHub }) => Promise<Response>): Promise<Response> {
  return withAgent(
    request,
    async ({ store, agent }) => {
      if (!agent.role) return problem(403, "FORBIDDEN", "The person who paired this app isn't in the workspace any more.");
      return handler({ store, agent, relay: { agentId: agent.agentId, orgId: agent.orgId }, hub: relayHub() });
    },
    { bucket: "relay", perMinute: 600 },
  );
}

export const SessionId = z.uuid();

/** A wait in milliseconds from `?wait=` seconds, capped at the hub's longest. */
export function waitFrom(url: URL): number {
  const seconds = Number(url.searchParams.get("wait") ?? "25");
  return Number.isFinite(seconds) ? Math.max(0, Math.min(RELAY_LIMITS.waitMs, Math.round(seconds * 1000))) : RELAY_LIMITS.waitMs;
}

/** A non-negative whole-number query value, or null. */
export function offsetFrom(url: URL, name: string): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null || !/^\d{1,15}$/.test(raw)) return null;
  return Number(raw);
}

const DeviceId = z.uuid();

/**
 * A browser's route of the relay (ADR 0096): the person's own session in
 * the live app, a request from Farbaek's own pages (same origin) for
 * anything but reading, the browser's device id, and a rate limit of the
 * person's own. In the hub, the browser is `browser:<user>:<device>` in the
 * person's current workspace, so it reaches only that workspace's computers.
 */
export async function withRelayBrowser(request: Request, handler: (ctx: { relay: RelayAgent; hub: RelayHub; userId: string }) => Promise<Response>): Promise<Response> {
  const ctx = await loadAppContext();
  if (!ctx) return problem(401, "UNAUTHENTICATED", "Sign in to reach your computers.");
  if (ctx.mode !== "live") return problem(403, "FORBIDDEN", "The demo workspace can't reach your computers. Sign in to your own workspace.");
  if (!ctx.current || !ctx.role) return problem(403, "FORBIDDEN", "Choose a workspace first.");
  if (request.method !== "GET" && !sameOrigin(request)) return problem(403, "FORBIDDEN", "That request didn't come from Farbaek.");
  const device = DeviceId.safeParse(request.headers.get("x-farbaek-device"));
  if (!device.success) return problem(400, "INVALID_REQUEST", "This browser didn't say which device it is.");
  const admin = createSupabaseAdminClient();
  if (!admin) return problem(503, "UNAVAILABLE", "The relay isn't configured on this server.");
  const limit = await admin.rpc("app_rate_limit", { p_key: `relay-browser:${ctx.user.id}`, p_window_seconds: 60, p_limit: 600 });
  if (limit.error) return problem(503, "UNAVAILABLE", "The relay isn't available right now. Try again in a minute.");
  if (limit.data !== true) return problem(429, "RATE_LIMITED", "Too many requests from your browsers in the last minute.", undefined, { "retry-after": "60" });
  return handler({ relay: { agentId: `browser:${ctx.user.id}:${device.data}`, orgId: ctx.current.id }, hub: relayHub(), userId: ctx.user.id });
}
