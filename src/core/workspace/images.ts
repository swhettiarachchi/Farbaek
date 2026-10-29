/**
 * Images in projects (ADR 0108): which paths hold images, how large one may
 * be, and what an image's bytes say it is. The database refuses an image on
 * a text path and text on an image path; this checks that the bytes match
 * the extension, so a renamed file is refused. SVG is text, not one of these.
 */

export const IMAGE_LIMITS = {
  /** Largest single image, in bytes. */
  maxImageBytes: 2 * 1024 * 1024,
} as const;

export type ImageKind = "png" | "jpeg" | "gif" | "webp" | "avif" | "ico";

export const IMAGE_MIME: Record<ImageKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
};

const EXTENSION: Record<string, ImageKind> = { png: "png", jpg: "jpeg", jpeg: "jpeg", gif: "gif", webp: "webp", avif: "avif", ico: "ico" };

/** The image kind a path's extension names, or null for a text path. Matches private.image_path in v68. */
export function imageKindOfPath(path: string): ImageKind | null {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
  return ext ? (EXTENSION[ext] ?? null) : null;
}

export function isImagePath(path: string): boolean {
  return imageKindOfPath(path) !== null;
}

const startsWith = (b: Uint8Array, bytes: number[], at = 0) => bytes.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, text: string, at = 0) => startsWith(b, [...text].map((c) => c.charCodeAt(0)), at);

/** What the bytes are, from their signature, or null when they aren't one of the kinds above. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (ascii(bytes, "GIF87a") || ascii(bytes, "GIF89a")) return "gif";
  if (ascii(bytes, "RIFF") && ascii(bytes, "WEBP", 8)) return "webp";
  if (ascii(bytes, "ftyp", 4) && (ascii(bytes, "avif", 8) || ascii(bytes, "avis", 8))) return "avif";
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return "ico";
  return null;
}

export type ImageCheck = { ok: true; kind: ImageKind; mime: string } | { ok: false; reason: "not_image_path" | "empty" | "too_large" | "not_an_image" | "wrong_type"; detail: string };

/** Whether these bytes may be saved at this path: an image path, within the limit, and bytes of the kind the extension names. */
export function checkImage(path: string, bytes: Uint8Array): ImageCheck {
  const named = imageKindOfPath(path);
  if (!named) return { ok: false, reason: "not_image_path", detail: "An image needs a name ending in .png, .jpg, .gif, .webp, .avif or .ico." };
  if (bytes.length === 0) return { ok: false, reason: "empty", detail: "That file is empty." };
  if (bytes.length > IMAGE_LIMITS.maxImageBytes) return { ok: false, reason: "too_large", detail: "Images can be up to 2 MB. Make it smaller or save it as WebP or JPEG." };
  const actual = sniffImage(bytes);
  if (!actual) return { ok: false, reason: "not_an_image", detail: "That file isn't a PNG, JPEG, GIF, WebP, AVIF or icon image." };
  // .jpg and .jpeg are one kind; anything else must match exactly.
  if (actual !== named) return { ok: false, reason: "wrong_type", detail: `That file is a ${actual.toUpperCase()} image, but its name ends in .${path.split(".").pop()}. Rename it to match.` };
  return { ok: true, kind: actual, mime: IMAGE_MIME[actual] };
}

/** The content type to serve an image path with, or null for a text path. */
export function imageMime(path: string): string | null {
  const kind = imageKindOfPath(path);
  return kind ? IMAGE_MIME[kind] : null;
}
