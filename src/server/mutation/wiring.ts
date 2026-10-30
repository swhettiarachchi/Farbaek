/**
 * Builds a mutation trial's dependencies from the signed-in context (ADR
 * 0136): the sandbox runs as the person, exactly as verification does, and
 * the run is recorded through the service-role functions, which re-check
 * the person.
 */
import { createSupabaseAgentStore } from "@/server/agent/supabase-store";
import { createSupabaseArenaStore } from "@/server/arena/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { sandboxForPerson } from "@/server/verification/wiring";
import type { OrgRole } from "@/server/workspace/types";
import type { MutationDeps } from "./runner";
import { createSupabaseMutationStore } from "./store";

export async function mutationDeps(person: { orgId: string; userId: string; role: OrgRole }): Promise<{ ok: true; deps: MutationDeps } | { ok: false; reason: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, reason: "Accounts aren't configured on this server." };
  return {
    ok: true,
    deps: {
      store: createSupabaseMutationStore(admin, createSupabaseArenaStore(admin)),
      checks: createSupabaseAgentStore(admin),
      sandbox: await sandboxForPerson(person),
      newKey: () => crypto.randomUUID(),
    },
  };
}
