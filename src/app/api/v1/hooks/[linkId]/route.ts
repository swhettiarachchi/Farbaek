import { clientKey } from "@/server/agent/http";
import { LINK_CALLS_A_MINUTE, createCallLimiter, handleLinkCall } from "@/server/automation/link-call";
import { fireLink } from "@/server/automation/links";
import { log } from "@/server/observability/log";
import { problem } from "@/server/sandbox/http";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

// Kept in this server's memory: a call without the right secret costs the database a read and never a write.
const allowCaller = createCallLimiter(LINK_CALLS_A_MINUTE, 60_000);

/**
 * POST /api/v1/hooks/<link id>: another app starts a scheduled task or an agent through the link its owner made (stage 277,
 * ADR 0284). The link's secret goes in the Authorization header as `Bearer fbl_...`; the body, if any, is a little text for the
 * run. Answers 202 when a run is queued. Only POST: a link can't be followed by opening its address.
 */
export async function POST(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await context.params;
  const admin = createSupabaseAdminClient();
  if (!admin) return problem(503, "NOT_CONFIGURED", "This server isn't set up to take calls yet.");
  return handleLinkCall(request, linkId, {
    caller: clientKey,
    allow: async (caller) => allowCaller(caller),
    fire: (id, secret, body) => fireLink(admin, id, secret, body),
    log: (event, fields) => log("info", event, fields),
  });
}
