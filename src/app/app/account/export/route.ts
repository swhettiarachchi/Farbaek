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
  log("info", "account.exported", { user: ctx.user.id });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
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
