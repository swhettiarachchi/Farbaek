import { resolveAiProvider } from "@/server/ai/config";
import { createAnthropicGatewayModel } from "@/server/ai/gateway-model";
import { MODEL_CALL_MAX_BYTES, callModel } from "@/server/agent/gateway";
import { fromAgentResult, problem, readJson, withAgent } from "@/server/agent/http";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createServerUsageDeps } from "@/server/workspace/usage-store";

export const dynamic = "force-dynamic";
// A step can think and write for a few minutes.
export const maxDuration = 300;

/**
 * POST /api/v1/agent/model: one model step for the Farbaek Agent, on
 * Farbaek's key and metered from the workspace's usage (ADR 0021). The
 * server picks the model; the reply is the provider's message unchanged.
 */
export function POST(request: Request) {
  return withAgent(request, async ({ store, agent }) => {
    const ai = resolveAiProvider();
    // The gateway speaks Claude's message format; Gemini serves the web app's drafting only for now.
    if (ai.provider !== "anthropic") return problem(503, "AI_UNAVAILABLE", ai.provider ? "The agent's model gateway needs Claude on this server." : ai.reason);
    const admin = createSupabaseAdminClient();
    if (!admin) return problem(503, "NOT_CONFIGURED", "Accounts aren't configured on this server.");
    const body = await readJson(request, MODEL_CALL_MAX_BYTES);
    if (!body.ok) return body.response;
    const deps = { ...store, ...createServerUsageDeps(admin) };
    return fromAgentResult(await callModel(deps, createAnthropicGatewayModel(), agent, body.value, request.signal));
  }, { bucket: "agent", perMinute: 120 }, "model");
}
