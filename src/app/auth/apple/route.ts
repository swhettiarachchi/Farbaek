import type { NextRequest } from "next/server";
import { startOAuth } from "@/server/auth/oauth-wiring";

export const dynamic = "force-dynamic";

/** Starts Sign in with Apple on the website (ADR 0114). */
export function GET(request: NextRequest) {
  return startOAuth(request, "apple");
}
