import { webConfig } from "@/server/web/config";
import { createPictureGate, createPictureLimiter, pictureKey, servePicture } from "@/server/web/picture";
import { createReaderClient } from "@/server/web/reader-client";
import { loadAppContext } from "@/server/workspace/context";

export const dynamic = "force-dynamic";

// One count for this server process: 240 pictures a minute for one person is dozens of answers opened at once.
const allow = createPictureLimiter(240, 60_000);
// And at any one moment: four on their way for one person, sixteen in all. The rest wait their turn.
const gate = createPictureGate(4, 16);

/**
 * The picture beside a story in an answer (stage 278, ADR 0285), for someone signed in. The browser asks here, never the site
 * the picture is on: Farbaek's page reader fetches it, and only for an address Farbaek signed while researching an answer.
 */
export async function GET(request: Request) {
  const ctx = await loadAppContext();
  if (!ctx || ctx.mode !== "live") return new Response(null, { status: 404 });
  const config = webConfig();
  if (!config) return new Response(null, { status: 404 });
  const reader = createReaderClient(config.readerUrl);
  const person = ctx.user.id;
  return servePicture(request, {
    key: pictureKey(),
    fetch: (url, signal) => reader.picture(url, { timeoutMs: 5_000, signal }),
    allow: () => allow(person),
    enter: (signal) => gate.enter(person, signal),
  });
}
