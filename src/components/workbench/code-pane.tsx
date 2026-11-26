"use client";

/**
 * The Code pane of Build's workspace (stage 202, ADR 0219): the project's files as a tree, and the one that's open in the
 * same editor the Files page uses (`CodeMirrorSurface`, ADR 0002). A file is read from its own route when it is opened.
 * Editing follows the Files page's rule: change it, review the exact change as a diff, then save it as a new revision
 * through the same action (`saveFileAction`), which checks the path, the size, secrets and the revision again on the server.
 * Where saving is off (the sample workspace, a viewer's role, an archived project) the file shows with its colours and
 * can't be typed into, and the pane says why.
 *
 * The pane owns which file is open, and every way of opening one goes through the same guard (`go`), from the tree here or
 * from a changed file in Output. A draft, a review and an error each remember the file they belong to, so nothing written
 * for one file can ever be shown, or saved, as another.
 */
import { ArrowClockwiseIcon, ArrowLeftIcon, CaretRightIcon, FileIcon, FolderSimpleIcon, GitDiffIcon, ImageSquareIcon, InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useImperativeHandle, useMemo, useState, useTransition, type Ref } from "react";
import { saveFileAction } from "@/app/app/actions";
import { Dialog } from "@/components/chat/primitives";
import { buttonClasses } from "@/components/ui/button";
import { buildTree, formatBytes, languageOf, type TreeNode } from "@/core/workspace/files";
import type { WorkbenchFile } from "@/server/workbench/types";

const Surface = dynamic(() => import("@/components/files/codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-md border border-line bg-surface-raised text-sm text-ink-3" role="status">
      Loading the editor…
    </div>
  ),
});

interface Opened {
  path: string;
  revision: number;
  sizeBytes: number;
  image: boolean;
  content: string;
}

type Loaded = { path: string; file: Opened } | { path: string; error: string } | null;

/** What the workspace can ask of the Code pane from outside it. */
export interface CodeHandle {
  /** Open a file, asking first if the one that's open has unsaved changes. */
  open(path: string): void;
}

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif" };

export function CodePane({ ref, projectId, files, editOff }: { ref?: Ref<CodeHandle>; projectId: string; files: WorkbenchFile[]; editOff: string | null }) {
  const router = useRouter();
  const tree = useMemo(() => buildTree(files.map((f) => f.path)), [files]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded>(null);
  // Each belongs to one file, and counts for nothing once another is open.
  const [draft, setDraft] = useState<{ path: string; text: string } | null>(null);
  const [review, setReview] = useState<{ path: string; text: string } | null>(null);
  const [failure, setFailure] = useState<{ path: string; text: string } | null>(null);
  // Discarding starts the editor afresh from the saved text; reading again asks the route once more.
  const [resets, setResets] = useState(0);
  const [reads, setReads] = useState(0);
  const [saving, startSave] = useTransition();
  // Another file was asked for while this one has unsaved changes: ask before leaving it.
  const [leaving, setLeaving] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!selected) return;
    const stop = new AbortController();
    fetch(`/app/workbench/${projectId}/file?path=${encodeURIComponent(selected)}`, { cache: "no-store", signal: stop.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { data?: Opened; error?: string } | null;
        setLoaded(!res.ok || !body?.data ? { path: selected, error: body?.error ?? "That file couldn't be read." } : { path: selected, file: body.data });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") setLoaded({ path: selected, error: "That file couldn't be read. Check your connection and try again." });
      });
    return () => stop.abort();
  }, [projectId, selected, reads]);

  const current = selected && loaded?.path === selected ? loaded : null;
  const file = current && "file" in current ? current.file : null;
  const text = file && draft?.path === file.path ? draft.text : (file?.content ?? "");
  const reviewing = file && review?.path === file.path ? review.text : null;
  const error = file && failure?.path === file.path ? failure.text : null;
  const dirty = Boolean(file && !file.image && (text !== file.content || (reviewing !== null && reviewing !== file.content)));

  const leave = (path: string | null) => {
    setDraft(null);
    setReview(null);
    setFailure(null);
    setSelected(path);
  };
  const go = (path: string | null) => {
    if (path === selected) return;
    if (dirty) return setLeaving(path);
    leave(path);
  };
  useImperativeHandle(ref, () => ({ open: go }));

  const save = () => {
    if (!file || reviewing === null) return;
    const saved = { path: file.path, content: reviewing };
    setFailure(null);
    startSave(async () => {
      const r = await saveFileAction({ projectId, path: saved.path, content: saved.content, expectedRevision: file.revision });
      if (r.status === "error") return setFailure({ path: saved.path, text: r.message });
      // Only while this file is still the one that's open: a save that lands after leaving changes nothing on screen.
      setLoaded((now) => (now && "file" in now && now.path === saved.path ? { path: saved.path, file: { ...now.file, content: saved.content, revision: r.revision, sizeBytes: new TextEncoder().encode(saved.content).length } } : now));
      setDraft((d) => (d?.path === saved.path ? null : d));
      setReview((v) => (v?.path === saved.path ? null : v));
      // The file list and the preview's key come from the page: read it again so both follow the new revision.
      router.refresh();
    });
  };

  return (
    <div className="flex h-full min-h-0">
      {/* The tree: beside the file on a wide pane, and the whole pane on a phone until a file is opened. */}
      <nav aria-label="Files" className={`min-h-0 w-full shrink-0 flex-col overflow-y-auto overscroll-contain border-line bg-canvas-2 p-2 sm:flex sm:w-60 sm:border-r ${selected ? "hidden" : "flex"}`}>
        {files.length === 0 ? (
          <p className="px-2 py-3 text-sm leading-relaxed text-ink-3">This project has no files yet. The agent writes them when it builds, or you can add them on the Files page.</p>
        ) : (
          <Tree nodes={tree} selected={selected} onOpen={go} depth={0} />
        )}
        <Link href={`/app/projects/${projectId}/files`} className="mt-auto flex min-h-10 items-center gap-2 rounded-full px-3 pt-2 text-xs text-ink-3 hover:text-ink">
          Add, import, history: the Files page
        </Link>
      </nav>

      <div className={`min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain sm:flex ${selected ? "flex" : "hidden"}`}>
        {!selected ? (
          <div className="m-auto grid max-w-sm justify-items-center gap-2 p-8 text-center">
            <FileIcon size={32} weight="bold" className="text-ink-3" aria-hidden />
            <p className="text-sm leading-relaxed text-ink-2">Choose a file to read it. You can edit it here, review the change, and save it as a new revision.</p>
          </div>
        ) : (
          <div className="grid gap-3 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button type="button" onClick={() => go(null)} className="tap inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-sm text-ink-2 hover:text-ink sm:hidden">
                <ArrowLeftIcon size={14} weight="bold" aria-hidden /> Files
              </button>
              <p className="min-w-0 flex-1 break-all font-mono text-sm text-ink">{selected}</p>
              {file ? (
                <p className="shrink-0 text-xs text-ink-3" aria-live="polite">
                  {file.image ? "Picture" : languageOf(file.path)}, {formatBytes(file.sizeBytes)}. Revision {file.revision}
                  {dirty ? ", with unsaved changes" : ""}.
                </p>
              ) : null}
            </div>

            {!current ? (
              <div role="status" aria-label="Reading the file" className="h-64 rounded-md bg-surface-raised motion-safe:animate-pulse" />
            ) : "error" in current ? (
              <div className="grid justify-items-start gap-3">
                <p role="alert" className="flex items-start gap-2 text-sm text-ink-2">
                  <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> {current.error}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLoaded(null);
                    setReads((n) => n + 1);
                  }}
                  className={buttonClasses("secondary", "sm")}
                >
                  <ArrowClockwiseIcon size={16} weight="bold" aria-hidden /> Try again
                </button>
              </div>
            ) : file?.image ? (
              <div className="grid justify-items-start gap-2">
                {IMAGE_TYPES[file.path.split(".").at(-1)?.toLowerCase() ?? ""] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the project's own picture, shown from its stored bytes
                  <img src={`data:${IMAGE_TYPES[file.path.split(".").at(-1)!.toLowerCase()]};base64,${file.content}`} alt={`The picture at ${file.path}`} className="max-h-[60dvh] max-w-full rounded-md border border-line bg-surface-sunken object-contain" />
                ) : (
                  <p className="flex items-center gap-2 text-sm text-ink-2">
                    <ImageSquareIcon size={16} weight="bold" className="text-ink-3" aria-hidden /> This picture&apos;s kind can&apos;t be shown here.
                  </p>
                )}
                <p className="text-xs text-ink-3">Pictures are replaced on the Files page or in Design, not edited as text.</p>
              </div>
            ) : file ? (
              <>
                {editOff ? (
                  <p className="flex items-start gap-2 text-sm text-ink-2">
                    <InfoIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-info" aria-hidden /> {editOff}
                  </p>
                ) : null}
                {reviewing === null ? (
                  <Surface
                    key={`edit:${file.path}@${file.revision}:${resets}`}
                    path={file.path}
                    value={text}
                    readOnly={editOff !== null}
                    label={editOff ? `Reading ${file.path}` : `Editing ${file.path}`}
                    onChange={(doc) => setDraft({ path: file.path, text: doc })}
                  />
                ) : (
                  <div className="grid gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <GitDiffIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden /> Review the change
                    </p>
                    <Surface key={`review:${file.path}@${file.revision}`} path={file.path} value={reviewing} original={file.content} label={`Reviewing the change to ${file.path}`} onChange={(doc) => setReview({ path: file.path, text: doc })} />
                  </div>
                )}
                {error ? (
                  <p role="alert" className="flex items-start gap-2 text-sm text-failed">
                    <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {error}
                  </p>
                ) : null}
                {editOff ? null : (
                  <div className="flex flex-wrap items-center gap-2">
                    {reviewing === null ? (
                      <>
                        <button type="button" disabled={!dirty} onClick={() => setReview({ path: file.path, text })} className={buttonClasses("primary", "sm")}>
                          <GitDiffIcon size={16} weight="bold" aria-hidden /> Review the change
                        </button>
                        {dirty ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDraft(null);
                              setFailure(null);
                              // The editor keeps its own text, so it is started again from what is saved.
                              setResets((n) => n + 1);
                            }}
                            className={buttonClasses("ghost", "sm")}
                          >
                            Discard
                          </button>
                        ) : (
                          <p className="text-xs text-ink-3">Type in the file to change it. Nothing is saved until you review it.</p>
                        )}
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={saving || reviewing === file.content} onClick={save} className={buttonClasses("primary", "sm")}>
                          {saving ? "Saving…" : "Save as a new revision"}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            // Back to typing, from what the review kept.
                            setDraft({ path: file.path, text: reviewing });
                            setReview(null);
                            setResets((n) => n + 1);
                          }}
                          className={buttonClasses("secondary", "sm")}
                        >
                          Keep editing
                        </button>
                        {reviewing === file.content ? <p className="text-xs text-ink-3">Nothing is left to save.</p> : null}
                      </>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>

      <Dialog open={leaving !== undefined} onClose={() => setLeaving(undefined)} title="Leave this file?" description="It has changes that aren't saved. Leaving drops them.">
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setLeaving(undefined)} className={buttonClasses("secondary", "sm")}>
            Stay
          </button>
          <button
            type="button"
            onClick={() => {
              const next = leaving ?? null;
              setLeaving(undefined);
              leave(next);
            }}
            className={buttonClasses("danger", "sm")}
          >
            Leave without saving
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function Tree({ nodes, selected, onOpen, depth }: { nodes: TreeNode[]; selected: string | null; onOpen: (path: string) => void; depth: number }) {
  return (
    <ul className="grid gap-0.5">
      {nodes.map((n) =>
        n.children ? (
          <li key={`d:${n.path}`}>
            {/* Open to begin with near the top, and wherever the open file is. */}
            <details open={depth < 1 || Boolean(selected?.startsWith(`${n.path}/`))}>
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-sm px-2 text-sm text-ink-2 hover:bg-surface hover:text-ink pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden" style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}>
                {/* The arrow follows its own folder, not an open one above it. */}
                <CaretRightIcon size={14} weight="bold" className="shrink-0 text-ink-3 transition-transform duration-150 [details[open]>summary>&]:rotate-90" aria-hidden />
                <FolderSimpleIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
                <span className="truncate">{n.name}</span>
              </summary>
              <Tree nodes={n.children} selected={selected} onOpen={onOpen} depth={depth + 1} />
            </details>
          </li>
        ) : (
          <li key={`f:${n.path}`}>
            <button
              type="button"
              aria-current={selected === n.path ? "true" : undefined}
              onClick={() => onOpen(n.path)}
              style={{ paddingLeft: `${1.75 + depth * 0.75}rem` }}
              className="flex min-h-9 w-full items-center gap-1.5 rounded-sm pr-2 text-left text-sm text-ink-2 hover:bg-surface hover:text-ink aria-[current=true]:bg-surface aria-[current=true]:font-medium aria-[current=true]:text-ink aria-[current=true]:shadow-e1 pointer-coarse:min-h-11"
            >
              <FileIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
              <span className="truncate">{n.name}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}
