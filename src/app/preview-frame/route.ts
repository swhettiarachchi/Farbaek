import { PREVIEW_FRAME_HTML, previewFrameHeaders } from "@/core/workspace/preview-frame";

/**
 * The document previews of people's sites render in (ADR 0169). It's the same
 * for everyone and carries no content of its own: the app hands it the site
 * after it loads.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(PREVIEW_FRAME_HTML, { headers: previewFrameHeaders() });
}
