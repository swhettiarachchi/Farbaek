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
import { createSupabaseAdminClient } from "@/server/supabase/admin";
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
      const { error } = await admin.rpc("app_mesh_relay_session_ended", { p_org: info.orgId, p_caller: info.caller, p_callee: info.callee, p_bytes: info.bytes, p_reason: info.reason });
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
