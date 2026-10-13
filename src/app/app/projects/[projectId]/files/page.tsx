import { ArrowLeftIcon, FileDashedIcon, FilePlusIcon, FolderOpenIcon, MagnifyingGlassIcon, PencilSimpleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, Notice } from "@/components/app/primitives";
import { CodeView } from "@/components/files/code-view";
import { DeleteFile } from "@/components/files/delete-file";
import { FileEditor } from "@/components/files/file-editor";
import { buttonClasses } from "@/components/ui/button";
import { FileTree, fileHref } from "@/components/files/file-tree";
import { ImportFiles } from "@/components/files/import-files";
import { RelativeTime } from "@/components/ui/local-time";
import { shortHash } from "@/core/trust/canonical-json";
import { buildTree, formatBytes, languageOf } from "@/core/workspace/files";
import { loadAppContext } from "@/server/workspace/context";
import type { SearchHit } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Files" };

const SMALL_PROJECT = 40;

/** Splits a line around case-insensitive matches so they can be marked. */
function highlight(text: string, query: string) {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let at = 0;
  for (let i = lower.indexOf(q); i !== -1 && q; i = lower.indexOf(q, i + q.length)) {
    if (i > at) parts.push({ text: text.slice(at, i), match: false });
    parts.push({ text: text.slice(i, i + q.length), match: true });
    at = i + q.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), match: false });
  return parts;
}

export default async function FilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ path?: string | string[]; q?: string | string[]; edit?: string | string[]; new?: string | string[] }>;
}) {
  const [{ projectId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const orgId = ctx.current.id;
  const project = await ctx.reader.getProject(orgId, projectId);
  if (!project) notFound();

  const path = typeof sp.path === "string" ? sp.path : null;
  const query = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const editing = sp.edit === "1" && path !== null;
  const creating = sp.new === "1";
  const [files, file, hits] = await Promise.all([
    ctx.reader.listFiles(orgId, project.id),
    path ? ctx.reader.getFile(orgId, project.id, path) : Promise.resolve(null),
    query ? ctx.reader.searchFiles(orgId, project.id, query) : Promise.resolve([] as SearchHit[]),
  ]);
  const totalBytes = files.reduce((n, f) => n + f.sizeBytes, 0);
  const writeReason = ctx.writes.enabled ? null : ctx.writes.reason;
  const tree = buildTree(files.map((f) => f.path));
  const nameMatches = query ? files.filter((f) => f.path.toLowerCase().includes(query.toLowerCase())).slice(0, 20) : [];
  const grouped = new Map<string, SearchHit[]>();
  for (const h of hits) grouped.set(h.path, [...(grouped.get(h.path) ?? []), h]);
  const base = `/app/projects/${project.id}/files`;
  const focused = Boolean(file) || creating;

  return (
    <div className="grid gap-6">
      <div>
        <Link href={`/app/projects/${project.id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} aria-hidden /> {project.name}
        </Link>
        <div className="mt-3 flex flex-col gap-1">
          <h1 className="text-[1.75rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.1rem]">Files</h1>
          <p className="text-[15px] text-ink-2">
            {files.length === 0 ? (
              "No files yet."
            ) : (
              <>
                <span className="tabular">{files.length.toLocaleString("en-US")}</span> {files.length === 1 ? "file" : "files"} ·{" "}
                <span className="tabular">{formatBytes(totalBytes)}</span>. Every change is kept as a revision.
              </>
            )}
          </p>
        </div>
      </div>

      {ctx.mode === "demo" ? <Notice>These are sample files in the demo workspace. Nothing here is a real project.</Notice> : null}

      {files.length === 0 ? (
        <EmptyState icon={FolderOpenIcon} title="Import your project">
          Bring in a folder from your computer. Farbaek keeps every version of every file, so later changes can be reviewed as diffs and undone.
        </EmptyState>
      ) : null}
      {files.length === 0 ? (
        <Card>
          <ImportFiles projectId={project.id} disabledReason={writeReason} />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] lg:items-start">
          <aside className={`grid gap-4 lg:sticky lg:top-6 ${focused ? "order-2 lg:order-none" : ""}`} aria-label="Project files">
            <Link href={`${base}?new=1`} className={buttonClasses("secondary", "sm", "w-full")}>
              <FilePlusIcon size={16} aria-hidden /> New file
            </Link>
            <form action={base} className="flex gap-2" role="search">
              {path ? <input type="hidden" name="path" value={path} /> : null}
              <label htmlFor="file-search" className="sr-only">
                Search files
              </label>
              <input
                id="file-search"
                name="q"
                type="search"
                defaultValue={query}
                maxLength={200}
                placeholder="Search in files"
                className="h-11 min-w-0 flex-1 rounded-sm border border-line-strong/60 bg-surface px-3.5 text-base shadow-e1 focus:border-accent"
              />
              <button type="submit" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface shadow-e1 hover:bg-canvas-2" aria-label="Search">
                <MagnifyingGlassIcon size={18} aria-hidden />
              </button>
            </form>
            <div className="max-h-[60vh] overflow-auto rounded-md border border-line bg-surface p-2 lg:max-h-[calc(100vh-12rem)]">
              <FileTree projectId={project.id} nodes={tree} current={file?.path ?? path} expandAll={files.length <= SMALL_PROJECT} />
            </div>
            <details className="rounded-md border border-line bg-surface p-4">
              <summary className="cursor-pointer text-sm font-medium">Import more files</summary>
              <div className="mt-4">
                <ImportFiles projectId={project.id} disabledReason={writeReason} compact />
              </div>
            </details>
          </aside>

          <section className="grid min-w-0 gap-4" aria-live="polite">
            {query ? (
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-medium">
                    Results for <span className="font-mono text-base">&ldquo;{query}&rdquo;</span>
                  </h2>
                  <Link href={path ? fileHref(project.id, path) : base} className="text-sm text-accent hover:underline">
                    Clear search
                  </Link>
                </div>
                {nameMatches.length > 0 ? (
                  <div className="mt-4">
                    <p className="font-mono text-xs text-ink-3">{"// file names"}</p>
                    <ul className="mt-2 grid gap-1">
                      {nameMatches.map((f) => (
                        <li key={f.path}>
                          <Link href={fileHref(project.id, f.path)} className="font-mono text-[13px] break-all text-accent hover:underline">
                            {f.path}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {hits.length === 0 && nameMatches.length === 0 ? <p className="mt-4 text-sm text-ink-2">Nothing matches. Search looks for the exact text, ignoring case.</p> : null}
                {hits.length > 0 ? (
                  <div className="mt-5 grid gap-5">
                    {[...grouped].map(([p, lines]) => (
                      <div key={p} className="min-w-0">
                        <Link href={fileHref(project.id, p)} className="font-mono text-[13px] font-medium break-all hover:text-accent">
                          {p}
                        </Link>
                        <ul className="mt-1.5 overflow-hidden rounded-sm border border-line">
                          {lines.map((h) => (
                            <li key={h.line} className="border-b border-line last:border-b-0">
                              <Link href={fileHref(project.id, p, h.line)} className="flex gap-3 px-3 py-1.5 font-mono text-[13px] hover:bg-surface-raised">
                                <span className="w-10 shrink-0 text-right text-ink-3 tabular">{h.line}</span>
                                <span className="min-w-0 truncate whitespace-pre">
                                  {highlight(h.text.trimEnd(), query).map((part, i) =>
                                    part.match ? (
                                      <mark key={i} className="rounded-[3px] bg-accent/15 text-ink">
                                        {part.text}
                                      </mark>
                                    ) : (
                                      <span key={i}>{part.text}</span>
                                    ),
                                  )}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {hits.length >= 200 ? <p className="text-xs text-ink-3">Showing the first 200 matching lines. Narrow the search to see more.</p> : null}
                  </div>
                ) : null}
              </Card>
            ) : null}

            {path && !file ? (
              <EmptyState icon={FileDashedIcon} title="File not found" action={<Link href={base} className="text-sm text-accent hover:underline">Back to all files</Link>}>
                There&apos;s no current file at <span className="font-mono text-[13px] break-all">{path}</span>. It may have been deleted or renamed.
              </EmptyState>
            ) : null}

            {creating ? <FileEditor projectId={project.id} path={null} initialContent="" revision={0} disabledReason={writeReason} /> : null}

            {file && editing && !creating ? (
              <FileEditor key={`${file.path}@${file.revision}`} projectId={project.id} path={file.path} initialContent={file.content} revision={file.revision} disabledReason={writeReason} />
            ) : null}

            {file && !editing && !creating ? (
              <div className="grid min-w-0 gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link href={base} className="text-sm text-ink-2 hover:text-ink lg:hidden">
                      All files
                    </Link>
                    <h2 className="font-mono text-[15px] font-medium break-all">{file.path}</h2>
                    <p className="mt-1 text-xs text-ink-3">
                      {languageOf(file.path)} · {formatBytes(file.sizeBytes)} · revision <span className="tabular">{file.revision}</span> · updated{" "}
                      <RelativeTime iso={file.updatedAt} /> · <span className="font-mono">{shortHash(file.sha256)}</span>
                    </p>
                    {writeReason ? <p className="mt-1 text-xs text-ink-3">{writeReason}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {/* Opens even when changes aren't allowed: the editor explains why it can't save. */}
                    <Link href={`${fileHref(project.id, file.path)}&edit=1`} className={buttonClasses("secondary", "sm")}>
                      <PencilSimpleIcon size={16} aria-hidden /> {writeReason ? "Try the editor" : "Edit"}
                    </Link>
                    <DeleteFile projectId={project.id} path={file.path} revision={file.revision} disabledReason={writeReason} />
                  </div>
                </div>
                <CodeView content={file.content} label={`Contents of ${file.path}`} />
                <p className="text-xs text-ink-3">Every saved change becomes a new revision, after you review it as a diff.</p>
              </div>
            ) : null}

            {!file && !path && !query && !creating ? (
              <Card>
                <h2 className="text-lg font-medium">Pick a file</h2>
                <p className="mt-1 text-sm text-ink-2">Open a file from the tree, or search across every file in the project.</p>
                {writeReason ? <p className="mt-3 text-sm text-ink-3">{writeReason}</p> : null}
              </Card>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
