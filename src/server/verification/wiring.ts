/**
 * Builds a verification's dependencies from the signed-in context (ADR 0047),
 * the same way security checks and cloud runs do: the sandbox session runs as
 * the person, with their refreshed access token kept in memory only, so the
 * sandbox service's Row Level Security and role-aware guard apply exactly as
 * when they run the checks by hand. Attempts are recorded through the
 * service-role functions, which re-check the person.
 */
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAgentStore } from "@/server/agent/supabase-store";
import { sandboxExecutionMode } from "@/server/sandbox/registry";
import { sandboxServiceFor } from "@/server/sandbox/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { readSupabaseConfig } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import type { OrgRole } from "@/server/workspace/types";
import type { VerificationDeps } from "./runner";
import { createSupabaseVerificationStore } from "./store";

export type VerificationWiring = { ok: true; deps: VerificationDeps } | { ok: false; reason: string };

async function freshAccessToken(): Promise<string | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data } = await client.auth.refreshSession().catch(() => ({ data: { session: null } }));
  return data.session?.access_token ?? null;
}

export async function verificationDeps(person: { orgId: string; userId: string; role: OrgRole }): Promise<VerificationWiring> {
  const admin = createSupabaseAdminClient();
  const config = readSupabaseConfig();
  if (!admin || !config) return { ok: false, reason: "Accounts aren't configured on this server." };
  const execution = sandboxExecutionMode();
  const token = execution.mode === "sandboxed" ? await freshAccessToken() : null;

  let sandbox: VerificationDeps["sandbox"];
  if (execution.mode !== "sandboxed") {
    sandbox = { unavailable: execution.reason ?? "No verified sandbox is connected, so checks can't run." };
  } else if (!token) {
    sandbox = { unavailable: "Your session couldn't be confirmed for the sandbox. Sign in again." };
  } else {
    const user = createClient(config.url, config.publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { service, actor } = sandboxServiceFor(user, person.userId, person.orgId, person.role);
    sandbox = { service, actor };
  }

  return {
    ok: true,
    deps: {
      store: createSupabaseVerificationStore(admin),
      checks: createSupabaseAgentStore(admin),
      sandbox,
      newKey: () => crypto.randomUUID(),
    },
  };
}
