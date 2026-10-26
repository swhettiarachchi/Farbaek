/**
 * HTTP glue for /api/v1/agent: the agent token from the Authorization
 * header, per-agent rate limits, and the shared JSON error shape. Agent
 * tokens are accepted only here; the rest of the API never takes them.
 */
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { log } from "@/server/observability/log";
import { json, problem } from "@/server/sandbox/http";
import { type AgentIdentity, type AgentResult, type AgentStore } from "./service";
import { createSupabaseAgentStore } from "./supabase-store";
import { AGENT_TOKEN_PATTERN, sha256 } from "./tokens";

export { json, problem, readJson } from "@/server/sandbox/http";

export function agentStore(): AgentStore | null {
  const admin = createSupabaseAdminClient();
  return admin ? createSupabaseAgentStore(admin) : null;
}

export function fromAgentResult<T>(result: AgentResult<T>, okStatus = 200): Response {
  if (result.ok) return json({ data: result.value }, okStatus);
  return problem(result.status, result.code, result.message, undefined, result.code === "RATE_LIMITED" ? { "retry-after": "60" } : {});
}

/** A rate-limit key for unauthenticated pairing requests: a hash of the client address the platform reports, never the address itself. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return sha256(`client:${forwarded}`).slice(0, 32);
}

async function guarded(request: Request, run: (store: AgentStore) => Promise<Response>): Promise<Response> {
  const correlation = crypto.randomUUID();
  try {
    const store = agentStore();
    if (!store) return problem(503, "NOT_CONFIGURED", "Accounts aren't configured on this server.");
    const response = await run(store);
    response.headers.set("x-request-id", correlation);
    return response;
  } catch (e) {
    log("error", "agent.api_error", { request: correlation, path: new URL(request.url).pathname, error: e instanceof Error ? e.message : String(e) });
    return problem(500, "INTERNAL", `Something went wrong. Reference ${correlation}.`, undefined, { "x-request-id": correlation });
  }
}

/** For POST /pair only: no token yet, the pairing code is the credential. */
export function withAgentStore(request: Request, handler: (store: AgentStore) => Promise<Response>): Promise<Response> {
  return guarded(request, handler);
}

/**
 * Authenticates the agent token on every request and rate-limits it. A route
 * with many small requests by design (the Mesh relay) uses its own bucket, so
 * it doesn't use up the limit for tasks.
 */
export function withAgent(
  request: Request,
  handler: (ctx: { store: AgentStore; agent: AgentIdentity }) => Promise<Response>,
  limit: { bucket: string; perMinute: number } = { bucket: "agent", perMinute: 120 },
): Promise<Response> {
  return guarded(request, async (store) => {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/)?.[1] ?? "";
    if (!AGENT_TOKEN_PATTERN.test(token)) return problem(401, "UNAUTHENTICATED", "Send the agent token as Authorization: Bearer fa_...");
    const agent = await store.session(sha256(token));
    if (!agent) return problem(401, "UNAUTHENTICATED", "This agent token isn't valid or was revoked. Pair the app again.");
    if (!(await store.rateLimit(`${limit.bucket}:${agent.agentId}`, 60, limit.perMinute))) return problem(429, "RATE_LIMITED", "Too many requests from this agent in the last minute.", undefined, { "retry-after": "60" });
    return handler({ store, agent });
  });
}
