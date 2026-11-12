import { importCapsuleForm, MAX_UPLOAD_BYTES, type CapsuleImportState } from "@/server/mesh/import-form";
import { sameOrigin } from "@/server/sandbox/wiring";

export const dynamic = "force-dynamic";

/**
 * POST /app/mesh/import (stage 179): opens an uploaded Capsule into the
 * workspace. A route of its own, so a Capsule with images can be larger than
 * server actions accept. It's a cookie-signed change, so it must come from
 * Farbaek's own pages; the body's size is checked before it's read.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { status: "error", message: "That request didn't come from Farbaek." });
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length <= 0 || length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return json(413, { status: "error", message: "That Capsule is too large to open here. Larger ones arrive with nearby transfer." });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { status: "error", message: "The upload couldn't be read. Try again." });
  }
  const state = await importCapsuleForm(form);
  return json(state.status === "error" ? 422 : 200, state);
}

function json(status: number, body: CapsuleImportState): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
