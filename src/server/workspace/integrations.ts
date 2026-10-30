import { LAUNCH_PROVIDERS, type LaunchProvider } from "@/core/launch/providers";
import { readEmailConfig } from "@/server/email/config";
import { readModelKey, type ModelKeyView } from "@/server/ai/workspace-ai";
import { readConnections, type ConnectionView } from "@/server/launch/provider-store";
import { createSupabaseServerClient } from "@/server/supabase/server";
import type { AppContext } from "./context";

export interface IntegrationsView {
  /** Null when they couldn't be read (the demo, or an error), not "none". */
  connections: Partial<Record<LaunchProvider, ConnectionView>> | null;
  liveSites: number | null;
  agents: { paired: number; reachable: number };
  emailSending: boolean;
  /** The workspace's own AI key (ADR 0125), when one is set. */
  modelKey: ModelKeyView | null;
}

/**
 * What the workspace is connected to, from its own records (ADR 0120), read
 * as the person. Anything that can't be read comes back null, so the page
 * says so instead of showing "not connected".
 */
export async function loadIntegrations(ctx: AppContext, orgId: string): Promise<IntegrationsView> {
  const user = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const [connections, liveSites, agents, modelKey] = await Promise.all([
    user ? readConnections(user, orgId).catch(() => null) : Promise.resolve(null),
    user
      ? Promise.resolve(
          user
            .from("sites")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .not("live_deployment_id", "is", null)
            .is("blocked_at", null),
        ).then(({ count, error }) => (error ? null : (count ?? 0)), () => null)
      : Promise.resolve(null),
    ctx.reader.listAgents(orgId).catch(() => []),
    user ? readModelKey(user, orgId).catch(() => null) : Promise.resolve(null),
  ]);
  const active = agents.filter((a) => !a.revokedAt);
  return {
    connections: connections ? Object.fromEntries(LAUNCH_PROVIDERS.flatMap((p) => (connections[p] ? [[p, connections[p]!]] : []))) : null,
    liveSites,
    agents: { paired: active.length, reachable: active.filter((a) => a.meshReachableAt && a.meshFingerprint).length },
    emailSending: readEmailConfig() !== null,
    modelKey,
  };
}
