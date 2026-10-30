import { ACTIVITY_CATEGORIES, activityCsv, type ActivityCategory } from "@/core/workspace/activity";
import { loadActivity } from "@/server/workspace/activity";
import { loadAppContext } from "@/server/workspace/context";

export const dynamic = "force-dynamic";

/** The most a download holds; the page pages back further. */
const MAX_ROWS = 5_000;

const text = (status: number, message: string) => new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/**
 * GET /app/activity/export (ADR 0119): the workspace's latest activity as
 * CSV, read through the person's own session. Cells that a spreadsheet would
 * run as formulas are quoted so they stay text.
 */
export async function GET(request: Request) {
  const ctx = await loadAppContext();
  if (!ctx) return text(401, "Sign in to download this.");
  if (!ctx.current) return text(404, "Open a workspace first.");
  const raw = new URL(request.url).searchParams.get("category");
  const category = ACTIVITY_CATEGORIES.some((c) => c.id === raw) ? (raw as ActivityCategory) : null;
  const rows = await loadActivity(ctx, ctx.current.id, { category, before: null, limit: MAX_ROWS });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(activityCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="farbaek-activity-${day}${category ? `-${category}` : ""}.csv"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
