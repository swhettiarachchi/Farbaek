/**
 * Builds a trial's dependencies from the signed-in context (ADR 0076): the
 * sandbox runs as the person, exactly as verification does, and the trial is
 * recorded through the service-role functions, which re-check the person.
 */
import { createSupabaseAgentStore } from "@/server/agent/supabase-store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { sandboxForPerson } from "@/server/verification/wiring";
import type { OrgRole } from "@/server/workspace/types";
import type { ArenaDeps } from "./runner";
import { createSupabaseArenaStore } from "./store";

export async function arenaDeps(person: { orgId: string; userId: string; role: OrgRole }): Promise<{ ok: true; deps: ArenaDeps } | { ok: false; reason: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, reason: "Accounts aren't configured on this server." };
  return {
    ok: true,
    deps: {
      store: createSupabaseArenaStore(admin),
      checks: createSupabaseAgentStore(admin),
      sandbox: await sandboxForPerson(person),
      newKey: () => crypto.randomUUID(),
    },
  };
}
