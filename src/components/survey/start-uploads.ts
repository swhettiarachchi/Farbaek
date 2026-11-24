/**
 * The start screen's files as they're kept in this browser, and back (stage 250, ADR 0258). Only what the screen needs to show them
 * again is kept: a survey file's text, a code library's text, a sketch photo as shrunk, and a document's name. What Farbaek found in
 * each is worked out again, by the same readers, when they come back. Nothing here is trusted by the server, which reads every file again.
 */
import { ADJUST_METHODS, type AdjustMethod } from "@/core/survey/adjust";
import { sketchFileNames } from "@/core/survey/autosurvey/sketch";
import { START_LIMITS, notReadYet, type FileRead } from "@/core/survey/autosurvey/start";
import { LIBRARY_LIMITS, parseCodeLibrary, type LibraryRead } from "@/core/survey/codelib";
import { IMPORT_LIMITS } from "@/core/survey/import/delimited";

/** One uploaded file and what Farbaek found in it, read here so the surveyor sees it at once. The server reads it all again. */
export type Upload =
  | { key: string; name: string; size: number; kind: "survey-data"; content: string; read: FileRead | null; problem: string | null; encoding: string | null; adjust: AdjustMethod | null }
  /** A field sketch, shrunk as it's added so a photo this device can't open is said at once, not after the plan exists. */
  | { key: string; name: string; size: number; kind: "sketch"; photo: Blob | null; problem: string | null }
  | { key: string; name: string; size: number; kind: "document"; reason: string }
  /** An office code library (ADR 0237): read here to show, and again on the server. */
  | { key: string; name: string; size: number; kind: "code-library"; content: string; read: LibraryRead };

/** One file as it's kept: nothing worked out from it, and nothing that couldn't be used. */
export type KeptUpload =
  | { name: string; size: number; kind: "survey-data"; content: string; encoding: string | null; adjust: AdjustMethod | null }
  | { name: string; size: number; kind: "sketch"; photo: Blob }
  | { name: string; size: number; kind: "document" }
  | { name: string; size: number; kind: "code-library"; content: string };

/** What the start screen keeps: its files, the title typed and the grid chosen. Never the consent to read sketches: that's asked again. */
export interface KeptStart {
  v: 1;
  title: string;
  crsId: string;
  uploads: KeptUpload[];
  /** When Generate Plan was pressed with these files: a refresh before its answer can't tell whether the plan was made. */
  sentAt?: number;
}

/** The files to keep: a file too large to use, or a photo this device couldn't open, isn't kept, since it can't be sent anyway. */
export function toKept(uploads: readonly Upload[], title: string, crsId: string, sentAt?: number): KeptStart {
  const kept: KeptUpload[] = [];
  for (const u of uploads) {
    if (u.kind === "survey-data") {
      if (u.content) kept.push({ name: u.name, size: u.size, kind: u.kind, content: u.content, encoding: u.encoding, adjust: u.adjust });
    } else if (u.kind === "sketch") {
      if (u.photo) kept.push({ name: u.name, size: u.size, kind: u.kind, photo: u.photo });
    } else if (u.kind === "document") kept.push({ name: u.name, size: u.size, kind: u.kind });
    else kept.push({ name: u.name, size: u.size, kind: u.kind, content: u.content });
  }
  return { v: 1, title: title.slice(0, 200), crsId: crsId.slice(0, 40), uploads: kept, ...(sentAt !== undefined ? { sentAt } : {}) };
}

const str = (x: unknown, max: number): x is string => typeof x === "string" && x.length <= max;
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;
const isBlob = (x: unknown): x is Blob => typeof Blob !== "undefined" && x instanceof Blob;

/**
 * The files back, as the screen shows them before reading them again: survey files and libraries are read by the caller, as when
 * they were added. Anything kept that doesn't look like this code wrote it is left out, so a damaged entry can't break the screen.
 */
export function fromKept(value: unknown, nextKey: () => string): { title: string; crsId: string; uploads: Upload[]; sent: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<KeptStart>;
  if (v.v !== 1 || !Array.isArray(v.uploads)) return null;
  const uploads: Upload[] = [];
  for (const raw of v.uploads.slice(0, START_LIMITS.files)) {
    if (!raw || typeof raw !== "object") continue;
    const u = raw as Record<string, unknown>;
    if (!str(u.name, 300) || !u.name || !num(u.size)) continue;
    const base = { key: nextKey(), name: u.name, size: u.size };
    if (u.kind === "survey-data" && str(u.content, IMPORT_LIMITS.maxBytes)) {
      const adjust = typeof u.adjust === "string" && (ADJUST_METHODS as readonly string[]).includes(u.adjust) ? (u.adjust as AdjustMethod) : null;
      uploads.push({ ...base, kind: "survey-data", content: u.content, read: null, problem: null, encoding: str(u.encoding, 300) ? u.encoding : null, adjust });
    } else if (u.kind === "sketch" && isBlob(u.photo)) {
      uploads.push({ ...base, kind: "sketch", photo: u.photo, problem: null });
    } else if (u.kind === "document") {
      uploads.push({ ...base, kind: "document", reason: notReadYet(u.name) });
    } else if (u.kind === "code-library" && str(u.content, LIBRARY_LIMITS.bytes)) {
      uploads.push({ ...base, kind: "code-library", content: u.content, read: parseCodeLibrary(u.content) });
    }
  }
  return { title: str(v.title, 200) ? v.title : "", crsId: str(v.crsId, 40) ? v.crsId : "", uploads, sent: num(v.sentAt) };
}

/** Sketch photos kept until their read is saved: which run they belong to, and the photos as sent. */
export interface KeptSketches {
  v: 1;
  jobId: string | null;
  /** When the plan's sketches had last been read as these were kept (null for none): a newer read is what reading these makes. */
  before: string | null;
  photos: { name: string; blob: Blob }[];
}

/** The photos back, or null when what's kept isn't photos this code wrote. */
export function keptSketches(value: unknown): KeptSketches | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<KeptSketches>;
  if (v.v !== 1 || !Array.isArray(v.photos) || v.photos.length === 0 || v.photos.length > 6) return null;
  const photos = v.photos.filter((p): p is { name: string; blob: Blob } => !!p && typeof p === "object" && str(p.name, 300) && isBlob(p.blob));
  if (photos.length !== v.photos.length) return null;
  return { v: 1, jobId: str(v.jobId, 40) ? v.jobId : null, before: str(v.before, 40) ? v.before : null, photos };
}

/**
 * Whether the photos kept here were read after all: the plan has a read newer than the one it had when they were kept, from photos named
 * exactly as the server names these. No clock is compared, so a phone naming every shot "image.jpg" can't make an earlier read pass.
 */
export function readAlready(kept: { before: string | null; names: readonly string[] }, record: { readAt: string; files: readonly string[] } | null): boolean {
  if (!record || record.readAt === kept.before) return false;
  const names = sketchFileNames(kept.names);
  return names.length === record.files.length && names.every((n, i) => record.files[i] === n);
}
