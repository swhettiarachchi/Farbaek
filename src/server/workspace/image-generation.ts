/**
 * Generating an image into a project (ADR 0109). An AI call like any other:
 * room is reserved on the workspace's AI usage first, settled to what the
 * provider reports, and refunded when it fails or the image can't be saved.
 * The image is untrusted bytes until checked: it must be a real PNG, JPEG,
 * WebP or GIF, and it's saved through the same path as an upload (ADR 0108).
 */
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import { checkPath } from "@/core/workspace/files";
import { sniffImage, type ImageKind } from "@/core/workspace/images";
import { ASPECT_RATIOS, IMAGE_OUTPUT_TOKENS, type AspectRatio, type ImageGenerator } from "@/server/ai/gemini-image";
import { log } from "@/server/observability/log";
import { refundUsage, reserveUsage, settleUsage, type AiUsageDeps } from "./ai-usage";
import { saveProjectImage, type FileDeps } from "./files";
import { fail, requireContributor, type WriteDeps, type WriteResult } from "./use-cases";

export const MAX_IMAGE_PROMPT = 1_000;

const EXTENSION: Record<ImageKind, string> = { png: "png", jpeg: "jpg", gif: "gif", webp: "webp", avif: "avif", ico: "ico" };

const MANUAL = "You can still add an image of your own with Add an image.";

const FAILED = {
  REFUSED: "Google declined to make that image, so it wasn't counted. Reword the description and try again.",
  INCOMPLETE: "No image came back, so it wasn't counted. Try again, or reword the description.",
  PROVIDER_BUSY: "The image service is busy, so it wasn't counted. Try again in a minute.",
  PROVIDER_ERROR: "The image wasn't made, so it wasn't counted. Try again in a minute.",
} as const;

/** "Hero photo" or "assets/hero.png" become "assets/hero-photo" and "assets/hero": a folder and a name, without an extension. */
export function imageStem(name: string): string | null {
  const trimmed = name.trim().replace(/^\.?\/+/, "");
  const slash = trimmed.lastIndexOf("/");
  const folder = slash >= 0 ? trimmed.slice(0, slash) : "assets";
  const base = (slash >= 0 ? trimmed.slice(slash + 1) : trimmed).replace(/\.[a-z0-9]{2,5}$/i, "");
  const stem = base
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!stem) return null;
  const path = folder ? `${folder}/${stem}` : stem;
  return checkPath(`${path}.png`).ok ? path : null;
}

export interface ImageGenerationInput {
  orgId: string;
  userId: string;
  projectId: string;
  prompt: string;
  aspectRatio: string;
  name: string;
  /** The project's current paths, so a new image never takes an existing name. */
  existingPaths: ReadonlySet<string>;
}

export async function generateProjectImage(
  deps: WriteDeps & FileDeps & AiUsageDeps,
  generator: ImageGenerator | null,
  input: ImageGenerationInput,
): Promise<WriteResult<{ path: string; revision: number; model: string }>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  if (!generator) return fail("AI_UNAVAILABLE", `Image generation isn't connected on this server yet. ${MANUAL}`);
  const prompt = input.prompt.trim().replace(/\s+/g, " ");
  if (prompt.length < 3 || prompt.length > MAX_IMAGE_PROMPT) return fail("INVALID_IMAGE", `Describe the image in up to ${MAX_IMAGE_PROMPT.toLocaleString("en-US")} characters.`);
  if (!(ASPECT_RATIOS as readonly string[]).includes(input.aspectRatio)) return fail("INVALID_IMAGE", "Choose one of the shapes shown.");
  const stem = imageStem(input.name);
  if (!stem) return fail("INVALID_PATH", "Give the image a name, for example assets/hero.");

  const units = reserveUnits(generator.model, approxTokens(prompt) + 20, Math.ceil(IMAGE_OUTPUT_TOKENS * 1.25));
  const reserved = await reserveUsage(deps, { orgId: input.orgId, userId: input.userId, taskId: null, operation: "image_generation", units, manual: MANUAL });
  if (!reserved.ok) return reserved;
  const entry = { orgId: input.orgId, entryId: reserved.value.entryId };

  let outcome;
  try {
    outcome = await generator.generate({ prompt, aspectRatio: input.aspectRatio as AspectRatio });
  } catch {
    outcome = { ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null };
  }
  if (!outcome.ok) {
    await refundUsage(deps, { ...entry, usage: outcome.usage, reason: "failed" });
    return fail(outcome.failure === "PROVIDER_BUSY" ? "AI_BUSY" : outcome.failure === "REFUSED" ? "AI_REFUSED" : "AI_INCOMPLETE", FAILED[outcome.failure]);
  }

  // What came back must really be an image; its kind decides the extension.
  const kind = sniffImage(outcome.bytes);
  if (!kind) {
    await refundUsage(deps, { ...entry, usage: outcome.usage, reason: "failed" });
    return fail("AI_INCOMPLETE", FAILED.INCOMPLETE);
  }
  const ext = EXTENSION[kind];
  let path = `${stem}.${ext}`;
  for (let n = 2; input.existingPaths.has(path) && n <= 50; n += 1) path = `${stem}-${n}.${ext}`;

  const saved = await saveProjectImage(deps, { orgId: input.orgId, userId: input.userId, projectId: input.projectId, path, bytes: outcome.bytes, expectedRevision: 0 });
  if (!saved.ok) {
    // Nothing was added, so nothing is counted.
    await refundUsage(deps, { ...entry, usage: outcome.usage, reason: "failed" });
    return saved;
  }
  await settleUsage(deps, { ...entry, usage: outcome.usage });
  log("info", "image.generated", { org: input.orgId, project: input.projectId, model: outcome.usage.model, bytes: outcome.bytes.length });
  return { ok: true, value: { path, revision: saved.value, model: outcome.usage.model } };
}
