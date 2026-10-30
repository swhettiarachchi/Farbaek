import type { NextRequest } from "next/server";
import { startOAuth } from "@/server/auth/oauth-wiring";

export const dynamic = "force-dynamic";

/** Starts signing in with Google on the website (ADR 0115). */
export function GET(request: NextRequest) {
  return startOAuth(request, "google");
}
