"use client";

import { ArrowClockwiseIcon, CaretDownIcon, CaretRightIcon, FileIcon, FilePlusIcon, FloppyDiskIcon, FolderIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { FarbaekApiError, type FarbaekSandboxClient, type FileEntry } from "@/sdk/sandbox-client";

const Surface = dynamic(() => import("@/components/files/codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-48 items-center justify-center text-sm text-ink-3" role="status">
      Loading the editor…
    </div>
  ),
});

function message(e: unknown, fallback: string): string {
  return e instanceof FarbaekApiError ? e.message : fallback;
}

function Tree({
  client,
  sessionId,
  dir,
  depth,
  open,
  onOpen,
  version,
}: {
  client: FarbaekSandboxClient;
  sessionId: string;
  dir: string;
  depth: number;
  open: string | null;
  onOpen: (path: string) => void;
  version: number;
}) {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    client
      .listFiles(sessionId, dir)
      .then((e) => live && (setEntries(e), setError(null)))
      .catch((e: unknown) => live && setError(message(e, "Couldn't list files.")));
    return () => {
      live = false;
    };
  }, [client, sessionId, dir, version]);

  if (error) return <p className="px-3 py-2 text-xs text-failed">{error}</p>;
  if (!entries) {
    return (
      <div className="grid gap-1.5 px-3 py-2" role="status" aria-label="Loading files">
        {[70, 55, 80].map((w) => (
          <span key={w} className="h-3 rounded-full bg-surface-raised" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }
  if (entries.length === 0 && depth === 0) return <p className="px-3 py-2 text-xs text-ink-3">The project folder is empty.</p>;
  return (
    <ul role={depth === 0 ? "tree" : "group"} aria-label={depth === 0 ? "Sandbox files" : undefined}>
      {entries.map((e) => {
        const isOpen = expanded.has(e.path);
        const pad = { paddingLeft: `${0.75 + depth * 0.85}rem` };
        if (e.type === "dir") {
          return (
            <li key={e.path} role="treeitem" aria-expanded={isOpen} aria-selected={false}>
              <button
                type="button"
                style={pad}
                onClick={() => setExpanded((s) => (s.has(e.path) ? new Set([...s].filter((p) => p !== e.path)) : new Set([...s, e.path])))}
                className="flex min-h-9 w-full items-center gap-1.5 pr-3 text-left text-[13px] text-ink-2 hover:bg-surface-raised"
              >
                {isOpen ? <CaretDownIcon size={12} aria-hidden /> : <CaretRightIcon size={12} aria-hidden />}
                <FolderIcon size={15} className="shrink-0 text-accent" aria-hidden />
                <span className="truncate">{e.name}</span>
              </button>
              {isOpen ? <Tree client={client} sessionId={sessionId} dir={e.path} depth={depth + 1} open={open} onOpen={onOpen} version={version} /> : null}
            </li>
          );
        }
        return (
          <li key={e.path} role="treeitem" aria-selected={open === e.path}>
            <button
              type="button"
              style={pad}
              onClick={() => onOpen(e.path)}
              className={`flex min-h-9 w-full items-center gap-1.5 pr-3 text-left text-[13px] ${open === e.path ? "bg-accent/[0.08] font-medium text-ink" : "text-ink-2 hover:bg-surface-raised"}`}
            >
              <span className="w-3" aria-hidden />
              <FileIcon size={15} className="shrink-0 text-ink-3" aria-hidden />
              <span className="truncate">{e.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** File explorer and editor for the files inside the sandbox (not the project's saved files). */
export function FilesPanel({ client, sessionId, canWrite, readReason }: { client: FarbaekSandboxClient; sessionId: string; canWrite: boolean; readReason: string | null }) {
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [status, setStatus] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [width, setWidth] = useState(240);
  const dragging = useRef(false);
  const dirty = open !== null && draft !== saved;

  const load = useCallback(
    async (path: string) => {
      setLoading(true);
      setStatus(null);
      try {
        const file = await client.readFile(sessionId, path);
        setOpen(file.path);
        setSaved(file.content);
        setDraft(file.content);
      } catch (e) {
        setStatus({ tone: "error", text: message(e, "Couldn't open that file.") });
      } finally {
        setLoading(false);
      }
    },
    [client, sessionId],
  );

  const save = useCallback(async () => {
    if (!open || !canWrite) return;
    setStatus({ tone: "info", text: "Saving…" });
    try {
      const r = await client.writeFile(sessionId, open, draft);
      setSaved(draft);
      setStatus({ tone: "info", text: `Saved ${r.bytes.toLocaleString("en-US")} bytes to the sandbox.` });
    } catch (e) {
      setStatus({ tone: "error", text: message(e, "Saving failed.") });
    }
  }, [client, sessionId, open, draft, canWrite]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && open) {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, open]);

  async function createFile() {
    const path = newPath.trim();
    if (!path) return;
    try {
      await client.writeFile(sessionId, path, "");
      setNewPath("");
      setVersion((v) => v + 1);
      await load(path);
    } catch (e) {
      setStatus({ tone: "error", text: message(e, "Couldn't create that file.") });
    }
  }

  if (readReason) {
    return <p className="rounded-md border border-dashed border-line-strong/40 bg-surface px-5 py-8 text-center text-sm text-ink-2">{readReason}</p>;
  }

  return (
    <div className="grid min-h-[22rem] overflow-hidden rounded-md border border-line bg-surface shadow-e1 md:grid-cols-[var(--tree)_6px_minmax(0,1fr)]" style={{ ["--tree" as string]: `${width}px` }}>
      <div className="flex min-h-0 flex-col border-b border-line md:border-b-0">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <span className="text-[13px] font-medium text-ink-3">Files</span>
          <button type="button" onClick={() => setVersion((v) => v + 1)} className="inline-flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised" aria-label="Refresh files">
            <ArrowClockwiseIcon size={16} aria-hidden />
          </button>
        </div>
        <div className="max-h-72 min-h-0 flex-1 overflow-y-auto py-1 md:max-h-[28rem]">
          <Tree client={client} sessionId={sessionId} dir="" depth={0} open={open} onOpen={(p) => void load(p)} version={version} />
        </div>
        {canWrite ? (
          <form
            className="flex items-center gap-1.5 border-t border-line p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void createFile();
            }}
          >
            <label htmlFor={`new-${sessionId}`} className="sr-only">
              New file path
            </label>
            <input
              id={`new-${sessionId}`}
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="src/new-file.ts"
              className="h-10 min-w-0 flex-1 rounded-sm border border-line bg-surface px-2.5 text-base sm:text-[13px]"
            />
            <button type="submit" className="inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised" aria-label="Create file">
              <FilePlusIcon size={18} aria-hidden />
            </button>
          </form>
        ) : null}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the file list"
        aria-valuenow={width}
        aria-valuemin={160}
        aria-valuemax={420}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setWidth((w) => Math.max(160, w - 16));
          if (e.key === "ArrowRight") setWidth((w) => Math.min(420, w + 16));
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
          setWidth(Math.max(160, Math.min(420, e.clientX - box.left)));
        }}
        onPointerUp={() => (dragging.current = false)}
        className="hidden cursor-col-resize bg-line/60 transition-colors hover:bg-accent/40 focus-visible:bg-accent/60 focus-visible:outline-none md:block"
      />
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-1.5">
          <span className="min-w-0 truncate font-mono text-[13px] text-ink-2">
            {open ?? "No file open"}
            {dirty ? <span className="ml-2 font-sans text-xs text-approval">Unsaved</span> : null}
          </span>
          {open && canWrite ? (
            <button type="button" onClick={() => void save()} disabled={!dirty} className={buttonClasses("secondary", "sm")}>
              <FloppyDiskIcon size={16} aria-hidden /> Save
            </button>
          ) : null}
        </div>
        <div className="min-h-[18rem] flex-1">
          {loading ? (
            <p className="p-4 text-sm text-ink-3" role="status">
              Opening…
            </p>
          ) : open ? (
            <Surface key={open} path={open} value={saved} label={`Editing ${open} in the sandbox`} onChange={canWrite ? setDraft : undefined} />
          ) : (
            <p className="p-4 text-sm text-ink-3">Choose a file to open it. Edits save to the sandbox only, not to the project; bring changes back as a change to review.</p>
          )}
        </div>
        {status ? (
          <p role={status.tone === "error" ? "alert" : "status"} className={`border-t border-line px-3 py-2 text-xs ${status.tone === "error" ? "text-failed" : "text-ink-2"}`}>
            {status.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
