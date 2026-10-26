import { securityTxt } from "@/server/security/security-txt";

/** How to report a security problem (RFC 9116). */
export function GET() {
  return new Response(securityTxt(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
