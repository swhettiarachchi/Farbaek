import { assetLinks } from "@/config/android-app";

/** Which Android app may open www.farbaek.com full screen (Digital Asset Links, ADR 0099). */
export function GET() {
  return new Response(JSON.stringify(assetLinks()), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } });
}
