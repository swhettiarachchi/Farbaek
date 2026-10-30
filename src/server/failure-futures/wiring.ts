/**
 * Builds a failure trial's dependencies from the signed-in context (ADR
 * 0135): the sandbox runs as the person, exactly as verification does; the
 * test is written by Claude on the workspace's own key when it has one, and
 * metered either way; the trial is recorded through the service-role
 * functions, which re-check the person.
 */
import { createSupabaseAgentStore } from "@/server/agent/supabase-store";
import { createAnthropicFailureTestWriter } from "@/server/ai/failure-test-writer";
import { aiForWorkspace } from "@/server/ai/workspace-ai";
import { createSupabaseArenaStore } from "@/server/arena/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { sandboxForPerson } from "@/server/verification/wiring";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import type { OrgRole } from "@/server/workspace/types";
import type { FailureDeps } from "./runner";
import { createSupabaseFailureStore } from "./store";

export async function failureDeps(person: { orgId: string; userId: string; role: OrgRole }): Promise<{ ok: true; deps: FailureDeps } | { ok: false; reason: string }> {
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { ok: false, reason: "Accounts aren't configured on this server." };
  const ai = await aiForWorkspace(person.orgId, createSupabaseWriteDeps(user, admin, person.userId), { timeout: 240_000, claudeOnly: "Failure trials" });
  if ("error" in ai) return { ok: false, reason: ai.error };
  return {
    ok: true,
    deps: {
      store: createSupabaseFailureStore(admin, createSupabaseArenaStore(admin)),
      checks: createSupabaseAgentStore(admin),
      sandbox: await sandboxForPerson(person),
      usage: ai.deps,
      writer: { family: "anthropic", create: (s) => createAnthropicFailureTestWriter({ model: s.model, client: ai.client }) },
      newKey: () => crypto.randomUUID(),
    },
  };
}
