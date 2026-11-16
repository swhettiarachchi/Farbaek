import { studioImageRequest } from "@/core/studio/studio";
import { readTextCapped } from "@/server/http/body";
import { studioDeps, studioGate, studioLimit, studioRefuse, studioStream } from "@/server/studio/http";
import { prepareImages } from "@/server/studio/studio";

export const dynamic = "force-dynamic";
// Up to four pictures in parallel; a detailed one can take two minutes.
export const maxDuration = 300;

/**
 * Make pictures in the image studio (stage 201, ADR 0216): checked and reserved before the stream opens, then each picture
 * streams a first look and lands in the library. Leaving the page stops what hasn't finished; finished pictures are kept.
 */
export async function POST(request: Request) {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return studioRefuse("That request couldn't be read.", 400);
  const gate = await studioGate(request);
  if (!gate.ok) return gate.response;
  const text = await readTextCapped(request, 20_000);
  if (text === null) return studioRefuse("That description is too long.", 413);
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    // Read as invalid below.
  }
  const parsed = studioImageRequest.safeParse(raw);
  if (!parsed.success) return studioRefuse(parsed.error.issues[0]?.message ?? "That request couldn't be read.", 400);

  const minute = await studioLimit(gate.admin, `studio-image:${gate.userId}`, 60, 6);
  if (minute === null) return studioRefuse("The image studio isn't available right now. Try again in a minute.", 503);
  if (!minute) return studioRefuse("That's a lot of pictures in a minute. Wait a moment, then carry on.", 429);
  // The day counts pictures, not requests: four at once is four.
  for (let i = 0; i < parsed.data.count; i++) {
    const day = await studioLimit(gate.admin, `studio-image-day:${gate.userId}`, 86_400, 120);
    if (!day) return studioRefuse("That's the most pictures for one person in a day. It's back tomorrow.", 429);
  }

  const prepared = await prepareImages(await studioDeps(gate), { orgId: gate.orgId, userId: gate.userId, request: parsed.data, batchId: crypto.randomUUID() });
  if (!prepared.ok) return studioRefuse(prepared.message, prepared.status);
  return studioStream(prepared, request, "images");
}
