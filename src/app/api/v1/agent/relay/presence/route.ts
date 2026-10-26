import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { json, problem, readJson } from "@/server/agent/http";
import { relayError, waitFrom, withRelayAgent } from "@/server/mesh/relay-http";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/agent/relay/presence: turns "Reachable through Farbaek" on,
 * with this device's mesh fingerprint, or off (ADR 0094). Recorded so the
 * workspace can see which of its agents are reachable.
 */
export function POST(request: Request) {
  return withRelayAgent(request, async ({ relay, hub }) => {
    const body = await readJson(request, 1024);
    if (!body.ok) return body.response;
    const on = body.value.on === true;
    const fingerprint = typeof body.value.fingerprint === "string" ? body.value.fingerprint : null;
    if (on && !fingerprint) return problem(400, "INVALID_REQUEST", "Send this device's mesh fingerprint to turn reachability on.");
    const r = hub.setReachable(relay, on ? fingerprint : null);
    if (!r.ok) return relayError(r);
    const admin = createSupabaseAdminClient();
    const { error } = admin ? await admin.rpc("app_agent_set_mesh_relay", { p_agent: relay.agentId, p_fingerprint: on ? fingerprint : null, p_on: on }) : { error: { message: "not configured" } };
    if (error) {
      hub.setReachable(relay, null);
      return problem(503, "UNAVAILABLE", "Reachability couldn't be saved. Try again.");
    }
    return json({ data: { reachable: on } });
  });
}

/** GET /api/v1/agent/relay/presence?wait=25: waits for calls to this agent. Polling is what keeps it reachable. */
export function GET(request: Request) {
  return withRelayAgent(request, async ({ relay, hub }) => {
    const r = await hub.waitForCalls(relay, waitFrom(new URL(request.url)));
    return r.ok ? json({ data: { calls: r.value } }) : relayError(r);
  });
}
