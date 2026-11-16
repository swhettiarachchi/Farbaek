/**
 * What a chat accepts as a file (stage 199, ADR 0213): pictures (PNG, JPEG, GIF, WebP), PDFs, and text the AI can read as words
 * (plain text, Markdown, CSV, JSON and code). The bytes decide, not the name: a picture must start like one, a PDF like a PDF, and
 * text must be valid UTF-8 without NUL bytes. Everything else is refused with a sentence saying what to do instead.
 */
import { sniffImage } from "@/core/workspace/images";
import { CHAT_LIMITS } from "./protocol";

export type FileKind = "image" | "pdf" | "text";

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "log", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "env.example",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "kt", "swift", "c", "h", "cpp", "hpp", "cs", "php", "sh", "bash", "ps1", "sql",
  "html", "htm", "css", "scss", "less", "vue", "svelte", "dart", "scala", "r", "lua", "pl", "tex", "srt", "vtt",
]);

const IMAGE_MIMES = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" } as const;

export type FileCheck =
  | { ok: true; kind: FileKind; mime: string; name: string }
  | { ok: false; reason: string };

/** A name safe to show and to download as: no folders, no control characters, at most 120 characters. */
export function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^\.+$/.test(cleaned)) return "file";
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 120 - ext.length) + ext;
}

function extension(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".env.example")) return "env.example";
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot + 1) : "";
}

function isUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function checkChatFile(name: string, bytes: Uint8Array): FileCheck {
  const clean = cleanName(name);
  if (bytes.length === 0) return { ok: false, reason: `${clean} is empty.` };
  if (bytes.length > CHAT_LIMITS.fileBytes) return { ok: false, reason: `${clean} is larger than 5 MB. Attach a smaller file, or a few pages of it as a PDF.` };

  const image = sniffImage(bytes);
  if (image) {
    if (image === "png" || image === "jpeg" || image === "gif" || image === "webp") return { ok: true, kind: "image", mime: IMAGE_MIMES[image], name: clean };
    return { ok: false, reason: `${clean} is a kind of picture the AI can't read. Save it as PNG, JPEG or WebP, then attach it again.` };
  }
  // %PDF- within the first kilobyte, as readers accept.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (head.includes("%PDF-")) return { ok: true, kind: "pdf", mime: "application/pdf", name: clean };

  const ext = extension(clean);
  if (TEXT_EXTENSIONS.has(ext) || ext === "") {
    if (bytes.length > CHAT_LIMITS.textBytes) return { ok: false, reason: `${clean} is more text than one message can carry (1 MB). Attach part of it.` };
    if (!isUtf8Text(bytes)) return { ok: false, reason: `${clean} isn't readable text. Save it as UTF-8 text or a PDF, then attach it again.` };
    const mime = ext === "md" || ext === "markdown" ? "text/markdown" : ext === "csv" || ext === "tsv" ? "text/csv" : ext === "json" || ext === "jsonl" ? "application/json" : "text/plain";
    return { ok: true, kind: "text", mime, name: clean };
  }
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "pages", "key", "numbers"].includes(ext)) {
    return { ok: false, reason: `${clean} is an office document. Save or export it as a PDF, then attach the PDF.` };
  }
  return { ok: false, reason: `${clean} isn't a file the AI can read. Attach a picture, a PDF or a text file.` };
}

/** Width and height from a PNG, JPEG, GIF or WebP header, or null when it can't be read. Used to keep a picture's shape on screen. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = sniffImage(bytes);
  try {
    if (kind === "png" && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
    if (kind === "gif" && bytes.length >= 10) return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    if (kind === "webp" && bytes.length >= 30) {
      const format = new TextDecoder("latin1").decode(bytes.subarray(12, 16));
      if (format === "VP8 ") return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
      if (format === "VP8L") {
        const b = view.getUint32(21, true);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      if (format === "VP8X") return { width: 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)), height: 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)) };
    }
    if (kind === "jpeg") {
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = bytes[i + 1]!;
        const length = view.getUint16(i + 2);
        // Start-of-frame markers carry the size.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
        i += 2 + length;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** "2.4 MB", "640 KB": for a file's line under its name. */
export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}
