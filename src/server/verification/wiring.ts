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
import type { SandboxActor, SandboxService } from "@/server/sandbox/service";
import { sandboxServiceFor } from "@/server/sandbox/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { readSupabaseConfig } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import type { OrgRole } from "@/server/workspace/types";
import { serverNotifier } from "@/server/email/wiring";
import type { VerificationDeps } from "./runner";
import { createSupabaseVerificationStore } from "./store";

export type VerificationWiring = { ok: true; deps: VerificationDeps } | { ok: false; reason: string };
export type PersonSandbox = { service: SandboxService; actor: SandboxActor } | { unavailable: string };

async function freshAccessToken(): Promise<string | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data } = await client.auth.refreshSession().catch(() => ({ data: { session: null } }));
  return data.session?.access_token ?? null;
}

/** The sandbox service acting as the signed-in person, or why there's none. Shared with the Future-State Arena (ADR 0076). */
/** `accessToken`: a phone's own token (ADR 0110), used as it is; otherwise the browser session is refreshed for it. */
export async function sandboxForPerson(person: { orgId: string; userId: string; role: OrgRole }, accessToken?: string): Promise<PersonSandbox> {
  const config = readSupabaseConfig();
  if (!config) return { unavailable: "Accounts aren't configured on this server." };
  const execution = sandboxExecutionMode();
  if (execution.mode !== "sandboxed") return { unavailable: execution.reason ?? "No verified sandbox is connected, so checks can't run." };
  const token = accessToken ?? (await freshAccessToken());
  if (!token) return { unavailable: "Your session couldn't be confirmed for the sandbox. Sign in again." };
  const user = createClient(config.url, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return sandboxServiceFor(user, person.userId, person.orgId, person.role);
}

export async function verificationDeps(person: { orgId: string; userId: string; role: OrgRole }, options: { accessToken?: string } = {}): Promise<VerificationWiring> {
  const admin = createSupabaseAdminClient();
  const config = readSupabaseConfig();
  if (!admin || !config) return { ok: false, reason: "Accounts aren't configured on this server." };
  return {
    ok: true,
    deps: {
      store: createSupabaseVerificationStore(admin),
      checks: createSupabaseAgentStore(admin),
      sandbox: await sandboxForPerson(person, options.accessToken),
      newKey: () => crypto.randomUUID(),
      // Tells the person how the checks ended (ADR 0060); null while email is off.
      notify: serverNotifier(),
      afterChecks: async (taskId) => {
        await (await import("@/server/workflows/wiring")).settleWorkflowStep(taskId);
        // A fix whose checks failed too gets its AI usage back (ADR 0101).
        await (await import("@/server/workspace/fix-retry")).settleFixRetry(taskId);
      },
    },
  };
}
