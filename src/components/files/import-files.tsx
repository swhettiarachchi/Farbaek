"use client";

import { CheckCircleIcon, FolderOpenIcon, FilesIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRef, useState, useTransition } from "react";
import { importFilesAction, type ImportState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { SKIP_LABELS, formatBytes, screenFile, screenPath, stripRootFolder, type SkipReason } from "@/core/workspace/files";

interface Prepared {
  files: { path: string; content: string }[];
  bytes: number;
  skipped: { path: string; reason: SkipReason }[];
}

const decoder = () => new TextDecoder("utf-8", { fatal: true });

/** Reads and screens the selected files in the browser. The server screens them again. */
async function prepare(list: FileList, fromFolder: boolean): Promise<Prepared> {
  const out: Prepared = { files: [], bytes: 0, skipped: [] };
  const seen = new Set<string>();
  for (const file of Array.from(list)) {
    const raw = fromFolder && file.webkitRelativePath ? stripRootFolder(file.webkitRelativePath) : file.name;
    const byPath = screenPath(raw);
    if (!byPath.ok) {
      // Dependency folders can hold tens of thousands of files: count them without listing each one.
      if (byPath.reason !== "ignored_folder" || out.skipped.length < 5_000) out.skipped.push({ path: raw, reason: byPath.reason });
      continue;
    }
    if (file.size > WORKSPACE_LIMITS.maxFileBytes) {
      out.skipped.push({ path: byPath.path, reason: "too_large" });
      continue;
    }
    let content: string;
    try {
      content = decoder().decode(await file.arrayBuffer());
    } catch {
      out.skipped.push({ path: byPath.path, reason: "binary" });
      continue;
    }
    const screened = screenFile(byPath.path, content, file.size, WORKSPACE_LIMITS.maxFileBytes);
    if (!screened.ok) {
      out.skipped.push({ path: byPath.path, reason: screened.reason });
      continue;
    }
    if (seen.has(screened.path)) continue;
    seen.add(screened.path);
    out.files.push({ path: screened.path, content });
    out.bytes += file.size;
  }
  return out;
}

function SkippedList({ skipped }: { skipped: Prepared["skipped"] }) {
  if (skipped.length === 0) return null;
  const byReason = new Map<SkipReason, string[]>();
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
              {SKIP_LABELS[reason]} <span className="text-ink-3 tabular">({paths.length.toLocaleString("en-US")})</span>
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
      <p className="mt-3 text-xs text-ink-3">Credentials files and anything that looks like a key or token are never imported. Keep secrets in environment variables.</p>
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
      <input ref={filesInput} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onPick(e.target.files, false)} />

      <div className={`flex flex-wrap items-center gap-3 ${compact ? "" : "justify-center"}`}>
        <button type="button" disabled={blocked} onClick={() => folderInput.current?.click()} className={buttonClasses(compact ? "secondary" : "primary", compact ? "sm" : "md")}>
          <FolderOpenIcon size={18} aria-hidden /> Choose a folder
        </button>
        <button type="button" disabled={blocked} onClick={() => filesInput.current?.click()} className={buttonClasses(compact ? "ghost" : "secondary", compact ? "sm" : "md")}>
          <FilesIcon size={18} aria-hidden /> Choose files
        </button>
      </div>
      <p className={`text-xs leading-relaxed text-ink-3 ${compact ? "" : "text-center"}`}>
        Text files only, up to {formatBytes(WORKSPACE_LIMITS.maxFileBytes)} each and {formatBytes(WORKSPACE_LIMITS.maxImportBytes)} per import. Dependency and build folders,
        credentials files and anything that looks like a secret are skipped. Files are read in your browser first so you can check the list before anything is uploaded.
      </p>
      {disabledReason ? <p className={`text-sm text-ink-2 ${compact ? "" : "text-center"}`}>{disabledReason}</p> : null}

      <div aria-live="polite" className="grid gap-3 empty:hidden">
        {reading ? <p className="text-sm text-ink-2">Reading files…</p> : null}
        {prepared && !reading ? (
          <div className="grid gap-3 rounded-sm border border-line bg-surface p-4">
            <p className="text-sm">
              <span className="font-medium tabular">{prepared.files.length.toLocaleString("en-US")}</span> {prepared.files.length === 1 ? "file" : "files"} ready to import
              <span className="text-ink-3"> · {formatBytes(prepared.bytes)}</span>
            </p>
            {tooBig ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-failed">
                <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
                That&apos;s more than {formatBytes(WORKSPACE_LIMITS.maxImportBytes)} of text. Choose a smaller folder, for example src.
              </p>
            ) : null}
            {tooMany ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-failed">
                <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
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
              <CheckCircleIcon size={18} weight="fill" className="mt-px shrink-0 text-verified" aria-hidden />
              <span>
                Imported. {result.summary.created} new, {result.summary.updated} updated, {result.summary.unchanged} unchanged.
              </span>
            </p>
            <SkippedList skipped={result.summary.skipped} />
          </div>
        ) : null}
        {result?.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
            {result.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
