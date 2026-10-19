import { NextResponse } from "next/server";
import { z } from "zod";
import { agentPresence } from "@/core/agent/inbox";
import { liveRunStatuses } from "@/server/cloud-agent/store";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /app/agent-status?org=<id>: the workspace's live agents at a glance,
 * for the presence orb. Kept light because every open page asks: one session
 * check and one query, read as the person, so Row Level Security returns
 * nothing for a workspace they don't belong to.
 */
export async function GET(request: Request) {
  const org = z.uuid().safeParse(new URL(request.url).searchParams.get("org"));
  if (!org.success) return NextResponse.json({ error: { code: "INVALID", message: "Name a workspace." } }, { status: 400 });
  const user = await createSupabaseServerClient();
  if (!user) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Accounts aren't configured on this server." } }, { status: 503 });
  const { data } = await user.auth.getClaims();
  if (!data?.claims) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in again." } }, { status: 401 });
  try {
    const presence = agentPresence(await liveRunStatuses(user, org.data));
    return NextResponse.json({ data: presence }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Agent status couldn't be read." } }, { status: 503 });
  }
}
