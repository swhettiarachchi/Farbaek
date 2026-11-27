import { NextResponse } from "next/server";
import type { WorkStatusReply } from "@/core/command/status";
import { workStatus } from "@/core/command/work-status";
import { loadWork, pauseReasons, type WorkContext } from "@/server/command/load-work";
import { loadAppContext } from "@/server/workspace/context";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/**
 * GET /app/work/status: the signed-in person's work in the workspace they are in, said short (stage 290, ADR 0298). It is
 * what the assistant answers "what needs me?" with, from any page. The same reads as the All work page, made as the
 * person, so Row Level Security decides what they see; it takes no parameter, so it can't be asked about another
 * workspace. It changes nothing.
 */
export async function GET() {
  const ctx = await loadAppContext();
  // Signed out, the context redirects to sign-in by itself: that call stays outside the try below, so it is never
  // answered as "couldn't be read". Null means this server has no accounts set up at all.
  if (!ctx) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Accounts aren't configured on this server." } }, { status: 503, headers: NO_STORE });
  if (!ctx.current) return NextResponse.json({ error: { code: "NO_WORKSPACE", message: "Create or join a workspace first." } }, { status: 404, headers: NO_STORE });
  try {
    const work = await loadWork(ctx as WorkContext, new Date());
    const reply: WorkStatusReply = {
      ...workStatus(work.board, { incomplete: work.unread.any, sample: work.tour, canAct: work.canAct }),
      pause: { paused: ctx.current.agentsPaused, ...pauseReasons(work) },
    };
    return NextResponse.json({ data: reply }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Your work couldn't be read just now." } }, { status: 503, headers: NO_STORE });
  }
}
