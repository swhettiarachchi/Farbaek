/**
 * How Nearby talks about what arrived (stage 188, ADR 0196): where it went, in
 * the words the person's own file manager uses, what it is, and whether it's
 * safe to open with a click. Plain functions, so the wording and the safety
 * rules are tested without Electron.
 */
import { formatBytes } from "@/core/workspace/files";

/** Invisible formatting characters (Unicode Cf, such as a right-to-left override) and controls, which can disguise a name. */
const INVISIBLE = /[\p{Cf}\p{Cc}]/gu;

/** A name as it may be shown: without characters that can make `invoice‮fdp.exe` read as `invoiceexe.pdf`. */
export function displayName(name: string): string {
  const shown = name.replace(INVISIBLE, "").trim();
  return shown.length > 0 ? shown : "Unnamed";
}

const PHOTO = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "avif"]);
const VIDEO = new Set(["mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp"]);
const AUDIO = new Set(["mp3", "m4a", "wav", "aac", "flac", "ogg", "opus"]);
/** Documents that open in a viewer and run nothing. SVG and HTML are left out: a browser runs their scripts. */
const DOCUMENT = new Set(["pdf", "txt"]);

/** The real extension, from the cleaned name, lower case; "" when there's none. */
export function extensionOf(name: string): string {
  const base = displayName(name).split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export type FileKind = "photo" | "video" | "audio" | "document" | "other";

export function kindOf(name: string): FileKind {
  const ext = extensionOf(name);
  if (PHOTO.has(ext)) return "photo";
  if (VIDEO.has(ext)) return "video";
  if (AUDIO.has(ext)) return "audio";
  if (DOCUMENT.has(ext)) return "document";
  return "other";
}

/**
 * Whether a received file may open with a click. Opening a program or a shortcut would run it, and received files
 * carry nothing that makes Windows warn first, so only kinds that open in a viewer qualify. Everything else is shown
 * in its folder instead.
 */
export function canOpen(name: string): boolean {
  return kindOf(name) !== "other";
}

/** Whether a thumbnail can be drawn for it: photos only, and not huge ones. */
export function canPreview(name: string, bytes: number): boolean {
  return kindOf(name) === "photo" && bytes <= 50 * 1024 * 1024;
}

/** "1 photo", "3 photos", "2 videos", "1 photo and 2 files", "6 files": what arrived, as a person would say it. */
export function summarise(files: { path: string }[], total = files.length): string {
  const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
  if (files.length === 0 || files.length < total) return count(total, "file", "files");
  const photos = files.filter((f) => kindOf(f.path) === "photo").length;
  const videos = files.filter((f) => kindOf(f.path) === "video").length;
  const rest = files.length - photos - videos;
  const parts: string[] = [];
  if (photos) parts.push(count(photos, "photo", "photos"));
  if (videos) parts.push(count(videos, "video", "videos"));
  if (rest) parts.push(count(rest, "file", "files"));
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** A folder people know by name: the label their file manager shows for it. */
export interface KnownFolder {
  label: string;
  path: string;
}

/** Splits a path into its parts, whichever separator it uses. */
function parts(p: string): string[] {
  return p.split(/[\\/]+/).filter((s) => s.length > 0);
}

/**
 * Where a folder is, in words: "Downloads › From Redmi A5 13 Nov 18.43" for a path under a known folder (the most
 * specific one wins), and the full path otherwise. Windows paths compare without regard to letter case.
 */
export function placeLabel(dest: string, known: KnownFolder[], platform: NodeJS.Platform = process.platform): string {
  const fold = (s: string) => (platform === "win32" ? s.toLowerCase() : s);
  const target = parts(dest);
  let best: { label: string; depth: number } | null = null;
  for (const k of known) {
    const base = parts(k.path);
    if (base.length === 0 || base.length > target.length) continue;
    if (!base.every((segment, i) => fold(segment) === fold(target[i]!))) continue;
    if (!best || base.length > best.depth) best = { label: k.label, depth: base.length };
  }
  if (!best) return displayName(dest);
  const rest = target.slice(best.depth).map(displayName);
  return [best.label, ...rest].join(" › ");
}

export interface OfferWords {
  title: string;
  body: string;
}

/** The notification for an offer that waits for the person. */
export function offerWords(peer: string, files: number, bytes: number): OfferWords {
  const what = `${files.toLocaleString("en-US")} ${files === 1 ? "file" : "files"} (${formatBytes(bytes)})`;
  return { title: `${displayName(peer)} wants to send you ${what}`, body: "Open Farbaek Agent to accept or decline it in Nearby." };
}

/** The notification for an arrival: what came, from whom, and where it is. The words alone must say where. */
export function arrivalWords(peer: string, files: { path: string }[], total: number, place: string): OfferWords {
  const what = summarise(files, total);
  const single = total === 1 && files.length === 1 ? kindOf(files[0]!.path) : null;
  const noun = single === "photo" ? "Photo" : single === "video" ? "Video" : total === 1 ? "File" : null;
  const title = noun ? `${noun} from ${displayName(peer)} arrived` : `${what[0]!.toUpperCase()}${what.slice(1)} from ${displayName(peer)} arrived`;
  return { title, body: `Saved in ${place}. Every file was checked.` };
}
