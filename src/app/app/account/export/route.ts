import { log } from "@/server/observability/log";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";

export const dynamic = "force-dynamic";

/** Downloads per person an hour: plenty for keeping a copy, too few to hammer the database. */
const PER_HOUR = 5;

/**
 * GET /app/account/export (ADR 0070): a JSON copy of everything Farbaek holds
 * about the signed-in person, from app_account_export. Only ever their own:
 * the user comes from their session, never from the request. Project files
 * have their own export on each project's page.
 */
export async function GET() {
  const ctx = await loadAppContext();
  if (!ctx) return text(401, "Sign in to download your data.");
  if (ctx.mode !== "live") return text(404, "The demo workspace has no account to download.");
  const admin = createSupabaseAdminClient();
  if (!admin) return text(503, "Downloading your data isn't available on this server yet.");

  const limit = await admin.rpc("app_rate_limit", { p_key: `account-export:${ctx.user.id}`, p_window_seconds: 3600, p_limit: PER_HOUR });
  if (limit.error) return text(503, "Downloading your data isn't available right now. Try again in a few minutes.");
  if (limit.data !== true) return text(429, `You can download your data ${PER_HOUR} times an hour. Try again later.`);

  const { data, error } = await admin.rpc("app_account_export", { p_user: ctx.user.id });
  if (error || !data) {
    log("error", "account.export_failed", { error: error?.message ?? "no data" });
    return text(500, "Your data couldn't be gathered. Nothing was changed. Try again in a moment.");
  }
  // Projects other workspaces shared with the person (ADR 0188).
  const shared = await admin.rpc("app_account_shared_projects", { p_user: ctx.user.id });
  if (shared.error) {
    log("error", "account.export_failed", { error: shared.error.message });
    return text(500, "Your data couldn't be gathered. Nothing was changed. Try again in a moment.");
  }
  // What the person asked Farbaek AI to remember (stage 207). An older database without it adds nothing rather than failing the export.
  const remembered = await admin.rpc("app_chat_memories_export", { p_user: ctx.user.id });
  if (remembered.error) log("warn", "account.export_without_memories", { error: remembered.error.message.slice(0, 120) });
  // What the person scheduled Farbaek to do by itself (stage 271). An older database without it adds nothing rather than failing the export.
  const scheduled = await admin.rpc("app_scheduled_tasks_export", { p_user: ctx.user.id });
  if (scheduled.error) log("warn", "account.export_without_scheduled", { error: scheduled.error.message.slice(0, 120) });
  // The person's agents and the notes each kept (stage 275). An older database without them adds nothing rather than failing the export.
  const agents = await admin.rpc("app_personal_agents_export", { p_user: ctx.user.id });
  if (agents.error) log("warn", "account.export_without_agents", { error: agents.error.message.slice(0, 120) });
  log("info", "account.exported", { user: ctx.user.id });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(`${JSON.stringify({ ...(data as Record<string, unknown>), shared_projects: shared.data ?? [], ...(remembered.error ? { chat_memories: null, chat_memories_note: "What you asked Farbaek AI to remember couldn't be read for this download. Download again later, or see it under Memory in Chat's settings." } : { chat_memories: remembered.data ?? [] }), ...(scheduled.error ? { scheduled_tasks: null, scheduled_tasks_note: "Your scheduled tasks couldn't be read for this download. Download again later, or see them on the Scheduled page." } : { scheduled_tasks: scheduled.data ?? [] }), ...(agents.error ? { agents: null, agents_note: "Your agents couldn't be read for this download. Download again later, or see them under Scheduled, on the Agents tab." } : { agents: agents.data ?? [] }) }, null, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="farbaek-my-data-${day}.json"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function text(status: number, message: string): Response {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
