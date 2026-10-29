/**
 * Farbaek's API for its phone apps (ADR 0110). Every path goes through one
 * router, so sign-in, the device check, the sample's read-only rule and the
 * write checks apply the same way to each.
 */
import { log } from "@/server/observability/log";
import { handlePhoneApi } from "@/server/phone/api";
import { phoneApiDeps } from "@/server/phone/wiring";
import { problem } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const correlation = crypto.randomUUID();
  try {
    const { path } = await context.params;
    const response = await handlePhoneApi(request, path, phoneApiDeps());
    response.headers.set("x-request-id", correlation);
    return response;
  } catch (e) {
    log("error", "phone.api_error", { request: correlation, path: new URL(request.url).pathname, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
    return problem(500, "INTERNAL", `Something went wrong. Reference ${correlation}.`, undefined, { "x-request-id": correlation });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
