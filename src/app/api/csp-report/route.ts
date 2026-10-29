import { parseCspReports } from "@/server/http/app-headers";
import { log } from "@/server/observability/log";

/**
 * Where browsers report what the app's Content-Security-Policy blocked, or
 * would block while it's report-only (ADR 0107). Each violation goes to the
 * server log as its directive, the blocked origin and the page's path: never
 * a full URL, so no token or personal data is kept. Bodies over 16 KB and
 * more than 120 violations a minute are dropped, so it can't flood the log.
 * Reports from previews of people's sites are skipped: they're expected.
 */
export const dynamic = "force-dynamic";

const MAX_BYTES = 16 * 1024;
const PER_MINUTE = 120;
let windowStart = 0;
let logged = 0;

export async function POST(request: Request): Promise<Response> {
  const text = await request.text().catch(() => "");
  if (text.length === 0 || text.length > MAX_BYTES) return new Response(null, { status: 204 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 204 });
  }
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    logged = 0;
  }
  for (const v of parseCspReports(body)) {
    // Previews of people's own sites inherit the policy, so their inline scripts are reported on every view. Known, and not the app's (ADR 0107).
    if (v.page === "(a preview frame)") continue;
    if (logged >= PER_MINUTE) break;
    logged += 1;
    log("warn", "csp.violation", { ...v });
  }
  return new Response(null, { status: 204 });
}
