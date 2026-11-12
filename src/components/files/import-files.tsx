"use client";

import { CheckCircleIcon, FolderOpenIcon, FilesIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRef, useState, useTransition } from "react";
import { importFilesAction, type ImportState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { SKIP_LABELS, formatBytes, screenFile, screenPath, stripRootFolder, type SkipReason } from "@/core/workspace/files";
import { ZIP_SKIP_LABELS } from "@/core/workspace/rescue-zip";
import { InflateUnavailableError, ZipError, readZip, type Inflate, type ZipResult, type ZipSkipReason } from "@/core/workspace/unzip";

type Skipped = { path: string; reason: SkipReason | ZipSkipReason };

export interface Prepared {
  files: { path: string; content: string }[];
  bytes: number;
  skipped: Skipped[];
  /** Picked zips that couldn't be opened, each with a plain reason. */
  zipProblems: { name: string; message: string }[];
}

const label = (reason: Skipped["reason"]) => (reason in SKIP_LABELS ? SKIP_LABELS[reason as SkipReason] : ZIP_SKIP_LABELS[reason as ZipSkipReason]);

/** Zips bigger than this are mostly dependencies or media; a project's source rarely is. The rescue import's cap too. */
const MAX_ZIP_BYTES = 60 * 1024 * 1024;

/**
 * What one picked zip may unpack to: files as large as an import takes, and
 * no more in all than a project can hold. Files in dependency folders are
 * listed in a zip but never unpacked, so the entry cap is the rescue import's.
 */
const ZIP_LIMITS = { maxFileBytes: WORKSPACE_LIMITS.maxFileBytes, maxTotalBytes: WORKSPACE_LIMITS.maxProjectBytes, maxEntries: 50_000 } as const;

const decoder = () => new TextDecoder("utf-8", { fatal: true });

const isZip = (file: File) => /\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed";

function skip(out: Prepared, path: string, reason: Skipped["reason"]) {
  // Dependency folders can hold tens of thousands of files: count them without listing each one.
  if (reason !== "ignored_folder" || out.skipped.length < 5_000) out.skipped.push({ path, reason });
}

/** Screens one file, picked or unzipped, in exactly the same way. */
async function addFile(out: Prepared, seen: Set<string>, raw: string, size: number, read: () => Promise<ArrayBuffer | Uint8Array>) {
  const byPath = screenPath(raw);
  if (!byPath.ok) return skip(out, raw, byPath.reason);
  if (size > WORKSPACE_LIMITS.maxFileBytes) return skip(out, byPath.path, "too_large");
  let content: string;
  try {
    content = decoder().decode(await read());
  } catch {
    return skip(out, byPath.path, "binary");
  }
  const screened = screenFile(byPath.path, content, size, WORKSPACE_LIMITS.maxFileBytes);
  if (!screened.ok) return skip(out, byPath.path, screened.reason);
  if (seen.has(screened.path)) return;
  seen.add(screened.path);
  out.files.push({ path: screened.path, content });
  out.bytes += size;
}

/** Unpacks a picked zip here in the browser, then screens each file as if it had been picked. */
async function addZip(out: Prepared, seen: Set<string>, file: File, inflate: Inflate | undefined) {
  const problem = (message: string) => {
    out.zipProblems.push({ name: file.name, message });
  };
  if (file.size > MAX_ZIP_BYTES) {
    return problem(`It's ${formatBytes(file.size)}, and a zip can be up to ${formatBytes(MAX_ZIP_BYTES)}. Zip just the folder with your code, without dependency or build folders.`);
  }
  const refused: Skipped[] = [];
  let zip: ZipResult;
  try {
    zip = await readZip(new Uint8Array(await file.arrayBuffer()), {
      ...ZIP_LIMITS,
      inflate,
      unwrapFolder: true,
      // Dependency folders, credential files and paths that aren't allowed are never unpacked.
      wanted: (path) => {
        const byPath = screenPath(path);
        if (!byPath.ok) refused.push({ path, reason: byPath.reason });
        return byPath.ok;
      },
    });
  } catch (e) {
    if (e instanceof InflateUnavailableError) return problem("This browser can't unpack zip files. Update it and try again.");
    return problem(e instanceof ZipError ? e.message : "It couldn't be read. Make the zip again and try once more.");
  }
  for (const s of refused) skip(out, s.path, s.reason);
  for (const s of zip.skipped) skip(out, s.path, s.reason);
  for (const entry of zip.entries) await addFile(out, seen, entry.path, entry.bytes.length, async () => entry.bytes);
}

/**
 * Reads and screens the selected files in the browser. A picked .zip is
 * unpacked first. The server screens everything again. `inflate` is for tests.
 */
export async function prepare(list: ArrayLike<File>, fromFolder: boolean, inflate?: Inflate): Promise<Prepared> {
  const out: Prepared = { files: [], bytes: 0, skipped: [], zipProblems: [] };
  const seen = new Set<string>();
  for (const file of Array.from(list)) {
    if (!fromFolder && isZip(file)) await addZip(out, seen, file, inflate);
    else await addFile(out, seen, fromFolder && file.webkitRelativePath ? stripRootFolder(file.webkitRelativePath) : file.name, file.size, () => file.arrayBuffer());
  }
  return out;
}

function SkippedList({ skipped }: { skipped: Skipped[] }) {
  if (skipped.length === 0) return null;
  const byReason = new Map<Skipped["reason"], string[]>();
  for (const s of skipped) byReason.set(s.reason, [...(byReason.get(s.reason) ?? []), s.path]);
  return (
    <details className="rounded-sm border border-line bg-surface-raised/50 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {skipped.length.toLocaleString("en-US")} {skipped.length === 1 ? "file" : "files"} skipped
      </summary>
      <ul className="mt-3 grid gap-3">
        {[...byReason].map(([reason, paths]) => (
          <li key={reason}>
            <p className="text-ink-2">
              {label(reason)}:{" "}
              <span className="tabular">
                {paths.length.toLocaleString("en-US")} {paths.length === 1 ? "file" : "files"}
              </span>
            </p>
            {reason === "ignored_folder" ? null : (
              <ul className="mt-1 grid gap-0.5 font-mono text-xs text-ink-3">
                {paths.slice(0, 12).map((p) => (
                  <li key={p} className="truncate">
                    {p}
                  </li>
                ))}
                {paths.length > 12 ? <li>and {paths.length - 12} more</li> : null}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-3">
        Files that hold keys and passwords, and anything that looks like a key or token, are never imported. Keep keys and passwords in your host&apos;s settings, not in the code.
      </p>
    </details>
  );
}

export function ImportFiles({ projectId, disabledReason, compact = false }: { projectId: string; disabledReason: string | null; compact?: boolean }) {
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [result, setResult] = useState<ImportState | null>(null);
  const [pending, startImport] = useTransition();

  async function onPick(list: FileList | null, fromFolder: boolean) {
    if (!list || list.length === 0) return;
    setResult(null);
    setReading(true);
    try {
      setPrepared(await prepare(list, fromFolder));
    } finally {
      setReading(false);
      if (folderInput.current) folderInput.current.value = "";
      if (filesInput.current) filesInput.current.value = "";
    }
  }

  const tooBig = prepared ? prepared.bytes > WORKSPACE_LIMITS.maxImportBytes : false;
  const tooMany = prepared ? prepared.files.length > WORKSPACE_LIMITS.maxProjectFiles : false;
  const blocked = Boolean(disabledReason) || reading || pending;

  function onImport() {
    if (!prepared || prepared.files.length === 0 || tooBig || tooMany) return;
    const files = prepared.files;
    startImport(async () => {
      const r = await importFilesAction({ projectId, files });
      setResult(r);
      if (r.status === "done") setPrepared(null);
    });
  }

  return (
    <div className="grid gap-4">
      {/* webkitdirectory isn't in React's types; it is supported by every current browser engine. */}
      <input ref={folderInput} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden {...{ webkitdirectory: "" }} onChange={(e) => onPick(e.target.files, true)} />
      {/* Any file, zips included. Naming .zip here would make desktop pickers offer zips alone by default. */}
      <input ref={filesInput} type="file" multiple accept="*/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onPick(e.target.files, false)} />

      <div className={`flex flex-wrap items-center gap-3 ${compact ? "" : "justify-center"}`}>
        <button type="button" disabled={blocked} onClick={() => folderInput.current?.click()} className={buttonClasses(compact ? "secondary" : "primary", compact ? "sm" : "md")}>
          <FolderOpenIcon size={16} weight="bold" aria-hidden /> Choose a folder
        </button>
        <button type="button" disabled={blocked} onClick={() => filesInput.current?.click()} className={buttonClasses(compact ? "ghost" : "secondary", compact ? "sm" : "md")}>
          <FilesIcon size={16} weight="bold" aria-hidden /> Choose files
        </button>
      </div>
      <p className={`text-xs leading-relaxed text-ink-3 ${compact ? "" : "text-center"}`}>
        Text files only, up to {formatBytes(WORKSPACE_LIMITS.maxFileBytes)} each and {formatBytes(WORKSPACE_LIMITS.maxImportBytes)} per import. A .zip of your project works too:
        choose it with Choose files, which is also the way to bring a project in from a phone. Dependency and build folders are skipped, and so are files that hold or seem to hold
        keys and passwords. Everything is read and unzipped in your browser first, so you can check the list before anything is uploaded.
      </p>
      {disabledReason ? <p className={`text-sm text-ink-2 ${compact ? "" : "text-center"}`}>{disabledReason}</p> : null}

      <div aria-live="polite" className="grid gap-3 empty:hidden">
        {reading ? <p className="text-sm text-ink-2">Reading files…</p> : null}
        {prepared && !reading ? (
          <div className="grid gap-3 rounded-sm border border-line bg-surface p-4">
            <p className="text-sm">
              <span className="font-medium tabular">{prepared.files.length.toLocaleString("en-US")}</span> {prepared.files.length === 1 ? "file" : "files"} ready to import,{" "}
              {formatBytes(prepared.bytes)} in all.
            </p>
            {prepared.zipProblems.map((p, i) => (
              <p key={`${i}-${p.name}`} role="alert" className="flex items-start gap-2 text-sm text-failed">
                <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
                <span className="min-w-0 break-words">
                  <span className="font-mono">{p.name}</span> wasn&apos;t opened. {p.message}
                </span>
              </p>
            ))}
            {tooBig ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-failed">
                <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
                That&apos;s more than {formatBytes(WORKSPACE_LIMITS.maxImportBytes)} of text. Choose a smaller folder, for example src.
              </p>
            ) : null}
            {tooMany ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-failed">
                <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
                A project can hold up to {WORKSPACE_LIMITS.maxProjectFiles.toLocaleString("en-US")} files.
              </p>
            ) : null}
            <SkippedList skipped={prepared.skipped} />
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={onImport} disabled={blocked || prepared.files.length === 0 || tooBig || tooMany} className={buttonClasses("primary", "sm")}>
                {pending ? "Importing…" : `Import ${prepared.files.length.toLocaleString("en-US")} ${prepared.files.length === 1 ? "file" : "files"}`}
              </button>
              <button type="button" onClick={() => setPrepared(null)} disabled={pending} className={buttonClasses("ghost", "sm")}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {result?.status === "done" ? (
          <div role="status" className="grid gap-3 rounded-sm border border-verified/30 bg-verified/[0.05] p-4 text-sm">
            <p className="flex items-start gap-2">
              <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
              <span>
                Imported. {result.summary.created} new, {result.summary.updated} updated, {result.summary.unchanged} unchanged.
              </span>
            </p>
            <SkippedList skipped={result.summary.skipped} />
          </div>
        ) : null}
        {result?.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            {result.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
