import { NextResponse } from "next/server";
import { RUN_STALE_AFTER_MS, isLive } from "@/core/agent/cloud-run";
import { isRunLiveHere } from "@/server/cloud-agent/executor";
import { createSupabaseRunStore, getRun, listRunEvents } from "@/server/cloud-agent/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ runId: string }> };

/**
 * GET /app/build/{runId}/events?after=N: the run and its steps after a
 * cursor, read through the person's own client (Row Level Security). The
 * Build page polls this while a run is live.
 */
export async function GET(request: Request, { params }: Params) {
  const ctx = await loadAppContext();
  if (!ctx?.current) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in again." } }, { status: 401 });
  const user = await createSupabaseServerClient();
  if (!user) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Accounts aren't configured on this server." } }, { status: 503 });
  const { runId } = await params;
  const after = Math.max(0, Number(new URL(request.url).searchParams.get("after") ?? "0") || 0);

  let run = await getRun(user, ctx.current.id, runId);
  if (!run) return NextResponse.json({ error: { code: "NOT_FOUND", message: "That run doesn't exist in this workspace." } }, { status: 404 });
  // A run that's live in the database but not on this server stopped reporting when its server went away.
  if (isLive(run.status) && !isRunLiveHere(run.id)) {
    const admin = createSupabaseAdminClient();
    if (admin && (await createSupabaseRunStore(admin).interruptStale(new Date(Date.now() - RUN_STALE_AFTER_MS))) > 0) run = (await getRun(user, ctx.current.id, runId)) ?? run;
  }
  const events = await listRunEvents(user, ctx.current.id, run.id, after);
  return NextResponse.json({ data: { run, events } }, { headers: { "cache-control": "no-store" } });
}
