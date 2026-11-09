"use client";

import { CheckCircleIcon, FileZipIcon, ShieldCheckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { rescueImportAction } from "@/app/app/rescue/actions";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { SKIP_LABELS, formatBytes, type SkipReason } from "@/core/workspace/files";
import { ZIP_SKIP_LABELS, rescueFilesFromZip, type RescueFiles, type RescueSkipReason } from "@/core/workspace/rescue-zip";
import { ZipError } from "@/core/workspace/unzip";

/** Archives bigger than this are mostly dependencies or media; a project's source rarely is. */
const MAX_ARCHIVE_BYTES = 60 * 1024 * 1024;

const label = (reason: RescueSkipReason) => (reason in SKIP_LABELS ? SKIP_LABELS[reason as SkipReason] : ZIP_SKIP_LABELS[reason as keyof typeof ZIP_SKIP_LABELS]);

function nameFromFile(file: string): string {
  const base = file.replace(/\.zip$/i, "").replace(/[-_]+(main|master)$/i, "").replace(/[-_]+/g, " ").trim();
  return (base ? base[0]!.toUpperCase() + base.slice(1) : "Rescued app").slice(0, 80);
}

/**
 * Rescue import (Phase D): a .zip of an app built elsewhere becomes a project
 * and gets a security check. It's unpacked and screened here in the browser,
 * so secrets, binaries and dependency folders never leave this computer.
 */
export function RescueImport({ disabledReason }: { disabledReason: string | null }) {
  const [prepared, setPrepared] = useState<RescueFiles | null>(null);
  const [name, setName] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onFile = async (file: File | undefined) => {
    setPrepared(null);
    setError(null);
    if (!file) return;
    if (file.size > MAX_ARCHIVE_BYTES) {
      setError(`This zip is ${formatBytes(file.size)}. Zip just the app's source, without dependency or build folders, and try again.`);
      return;
    }
    setReading(true);
    try {
      const result = await rescueFilesFromZip(new Uint8Array(await file.arrayBuffer()), { maxFileBytes: WORKSPACE_LIMITS.maxFileBytes, maxEntries: 50_000 });
      setPrepared(result);
      setName(nameFromFile(file.name));
    } catch (e) {
      setError(e instanceof ZipError ? e.message : "This zip couldn't be read. Make it again from the app's folder and try once more.");
    } finally {
      setReading(false);
    }
  };

  const tooBig = prepared ? prepared.bytes > WORKSPACE_LIMITS.maxImportBytes : false;
  const tooMany = prepared ? prepared.files.length > WORKSPACE_LIMITS.maxProjectFiles : false;
  const blocked = disabledReason ?? (prepared && prepared.files.length === 0 ? "There are no text source files in this zip to check." : null);
  const byReason = new Map<RescueSkipReason, string[]>();
  for (const s of prepared?.skipped ?? []) byReason.set(s.reason, [...(byReason.get(s.reason) ?? []), s.path]);

  return (
    <div className="grid gap-5">
      <label
        className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-line-strong/50 bg-surface px-6 py-8 text-center transition-colors duration-150 hover:border-accent/60 has-focus-visible:outline-2 has-focus-visible:outline-accent ${disabledReason ? "pointer-events-none opacity-60" : ""}`}
      >
        <FileZipIcon size={32} className="text-accent" aria-hidden />
        <span className="text-body font-medium">{reading ? "Unpacking in your browser…" : prepared ? "Choose a different zip" : "Choose a .zip of your app"}</span>
        <span className="text-sm text-ink-3">For example GitHub&apos;s &quot;Download ZIP&quot;, or an export from another builder.</span>
        <input type="file" accept=".zip,application/zip" className="sr-only" disabled={Boolean(disabledReason) || reading || pending} onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> {error}
        </p>
      ) : null}

      {prepared ? (
        <div className="grid gap-4 rounded-md border border-line bg-surface p-5 shadow-e1 motion-safe:animate-[usage-in_220ms_cubic-bezier(0.16,1,0.3,1)_both]">
          <p className="flex items-center gap-2 text-body">
            <CheckCircleIcon size={16} weight="fill" className="shrink-0 text-verified" aria-hidden />
            <span>
              <span className="font-medium">{prepared.files.length.toLocaleString("en-US")} files</span> ready, {formatBytes(prepared.bytes)} of text.
            </span>
          </p>
          {prepared.ignored > 0 ? (
            <p className="text-sm text-ink-2">
              {prepared.ignored.toLocaleString("en-US")} {prepared.ignored === 1 ? "file" : "files"} in dependency and build folders {prepared.ignored === 1 ? "was" : "were"} left packed; they aren&apos;t your code.
            </p>
          ) : null}
          {byReason.size > 0 ? (
            <details className="rounded-sm border border-line bg-surface-raised/50 px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium">
                {prepared.skipped.length.toLocaleString("en-US")} {prepared.skipped.length === 1 ? "file" : "files"} left out
              </summary>
              <ul className="mt-3 grid gap-3">
                {[...byReason].map(([reason, paths]) => (
                  <li key={reason}>
                    <p className="text-ink-2">
                      {label(reason)} <span className="text-ink-3 tabular">({paths.length.toLocaleString("en-US")})</span>
                    </p>
                    <ul className="mt-1 grid gap-0.5 font-mono text-xs text-ink-3">
                      {paths.slice(0, 10).map((p) => (
                        <li key={p} className="truncate">
                          {p}
                        </li>
                      ))}
                      {paths.length > 10 ? <li>and {paths.length - 10} more</li> : null}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {tooBig || tooMany ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-failed">
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
              <span>
                {tooBig
                  ? `That's more than ${formatBytes(WORKSPACE_LIMITS.maxImportBytes)} of text for one import. Zip just the folder with your code, for example src.`
                  : `That's more than ${WORKSPACE_LIMITS.maxProjectFiles.toLocaleString("en-US")} files. Zip just the folder with your code.`}
              </span>
            </p>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                startTransition(async () => {
                  const r = await rescueImportAction({ name, files: prepared.files });
                  if (r?.status === "error") setError(r.message);
                });
              }}
            >
              <label className="grid gap-1.5">
                <span className={LABEL_CLASSES}>Project name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  required
                  className={inputClasses()}
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={pending || Boolean(blocked) || !name.trim()} className={buttonClasses("primary")}>
                  <ShieldCheckIcon size={16} weight="bold" aria-hidden /> {pending ? "Importing and starting the check…" : "Import and check"}
                </button>
                {blocked ? <span className="text-sm text-ink-3">{blocked}</span> : null}
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
