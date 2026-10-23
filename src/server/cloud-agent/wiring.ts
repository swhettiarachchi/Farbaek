/**
 * Builds a cloud run's dependencies from the signed-in context (ADR 0022).
 *
 * The run outlives the request that starts it, so it can't use the request's
 * cookies. Sandbox calls use the person's own access token, refreshed when
 * the run starts (it outlasts the run's 40-minute limit) and kept in memory
 * only, so the sandbox service's Row Level Security reads and its
 * role-aware guard work exactly as they do for the person. Runs, the wallet
 * and proposals go through the service-role functions, which re-check the
 * person in the database.
 */
import { createClient } from "@supabase/supabase-js";
import { resolveAiProvider } from "@/server/ai/config";
import { createAnthropicGatewayModel } from "@/server/ai/gateway-model";
import { createSupabaseAgentStore } from "@/server/agent/supabase-store";
import { sandboxExecutionMode } from "@/server/sandbox/registry";
import { sandboxServiceFor } from "@/server/sandbox/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { readSupabaseConfig } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { createServerUsageDeps } from "@/server/workspace/usage-store";
import { templateFor } from "@/core/agent/cloud-run";
import type { OrgRole } from "@/server/workspace/types";
import type { ExecutorDeps } from "./executor";
import { createSandboxRunner } from "./sandbox-runner";
import { createSupabaseRunStore } from "./store";
import { pinMap, readSkillPins } from "@/server/workspace/skill-pins";

const SESSION_MINUTES = 45;

export type CloudRunWiring = { ok: true; deps: ExecutorDeps } | { ok: false; reason: string };

/** The person's access token, refreshed now. Never logged or stored. */
async function freshAccessToken(): Promise<string | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data } = await client.auth.refreshSession().catch(() => ({ data: { session: null } }));
  return data.session?.access_token ?? null;
}

export async function cloudRunDeps(person: { orgId: string; userId: string; role: OrgRole }): Promise<CloudRunWiring> {
  const ai = resolveAiProvider();
  if (ai.provider !== "anthropic") return { ok: false, reason: ai.provider ? "Cloud runs need Claude on this server." : ai.reason };
  const admin = createSupabaseAdminClient();
  const config = readSupabaseConfig();
  if (!admin || !config) return { ok: false, reason: "Accounts aren't configured on this server." };

  const agentStore = createSupabaseAgentStore(admin);
  const sandboxed = sandboxExecutionMode().mode === "sandboxed";
  const token = sandboxed ? await freshAccessToken() : null;

  const deps: ExecutorDeps = {
    runs: createSupabaseRunStore(admin),
    checks: agentStore,
    gateway: { deps: { ...agentStore, ...createServerUsageDeps(admin) }, model: createAnthropicGatewayModel() },
    sandboxAvailable: () => sandboxed && token !== null,
    skillPins: async (orgId, projectId) => pinMap(await readSkillPins(admin, orgId, projectId)),
    async sandbox(input) {
      if (!token) return null;
      const user = createClient(config.url, config.publishableKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { service, actor } = sandboxServiceFor(user, person.userId, person.orgId, person.role);
      const overview = await service.overview(actor);
      const limits = overview.limits.limits;
      const created = await service.createSession(
        actor,
        {
          name: `Agent: ${input.taskTitle}`.slice(0, 80),
          template: templateFor(input.paths),
          size: limits.sizes.includes("standard") ? "standard" : "small",
          network: limits.networkProfiles.includes("package_registries") ? "package_registries" : "none",
          minutes: Math.max(5, Math.min(SESSION_MINUTES, limits.maxSessionMinutes)),
          projectId: input.projectId,
          taskId: input.taskId,
          include: [],
        },
        `run:${input.runId}`,
      );
      if (!created.ok) return { error: created.message };
      const sessionId = created.value.sessionId;
      return {
        sessionId,
        runner: createSandboxRunner({ service, actor, sessionId, pending: input.pending, onCommand: input.onCommand, newKey: () => crypto.randomUUID() }),
        stop: async () => {
          await service.stopSession(actor, sessionId);
        },
      };
    },
  };
  return { ok: true, deps };
}
