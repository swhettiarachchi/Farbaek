import { agentHandoffs, createSupabaseHandoffStore } from "@/server/agent/handoffs";
import { fromAgentResult, withAgent } from "@/server/agent/http";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

/** GET /api/v1/agent/handoffs: tasks handed to this computer from a phone or browser, still open (ADR 0139). */
export function GET(request: Request) {
  return withAgent(request, async ({ agent }) => fromAgentResult(await agentHandoffs(createSupabaseHandoffStore(createSupabaseAdminClient()!), agent)));
}
