"use client";

import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  CubeIcon,
  CursorClickIcon,
  DesktopIcon,
  DeviceMobileIcon,
  DeviceTabletIcon,
  FilmStripIcon,
  GitDiffIcon,
  ImageSquareIcon,
  PaletteIcon,
  RowsIcon,
  SelectionIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { z } from "zod";
import { saveFileAction, uploadStudioImageAction } from "@/app/app/actions";
import { MediaReplace, PlaceholderChip, ScenePicker } from "@/components/studio/media-replace";
import { SectionsPanel } from "@/components/studio/sections-panel";
import { ThemePanel, type ThemePreview } from "@/components/studio/theme-panel";
import { buttonClasses } from "@/components/ui/button";
import { TEXT_SIZES } from "@/core/studio/site-theme";
import {
  DESIGN_ACTION_MESSAGE,
  DESIGN_PICK_MESSAGE,
  DESIGN_SCRIPT,
  DESIGN_SECTIONS_MESSAGE,
  DESIGN_SELECT_MESSAGE,
  DESIGN_THEME_MESSAGE,
  annotateForDesign,
  applyVisualEdit,
  attrValue,
  cssColorToHex,
  editableText,
  hasAttr,
  labelText,
  mediaSlots,
  outline,
  relocate,
  scanElements,
  sections,
  type PickedStyle,
  type SourceElement,
  type StyleProp,
  type VisualEdit,
} from "@/core/studio/visual-edit";
import { buildStaticSrcdoc, sitePages } from "@/core/workspace/static-preview";

const Surface = dynamic(() => import("@/components/files/codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 items-center justify-center rounded-md border border-line bg-surface-raised text-sm text-ink-3" role="status">
      Loading the review…
    </div>
  ),
});

const DEVICES: { id: "phone" | "tablet" | "desktop"; label: string; icon: Icon; width: number | null }[] = [
  { id: "phone", label: "Phone", icon: DeviceMobileIcon, width: 390 },
  { id: "tablet", label: "Tablet", icon: DeviceTabletIcon, width: 820 },
  { id: "desktop", label: "Desktop", icon: DesktopIcon, width: null },
];

const TAG_LABELS: Record<string, string> = {
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  h5: "Heading 5",
  h6: "Heading 6",
  p: "Paragraph",
  a: "Link",
  button: "Button",
  img: "Image",
  video: "Video",
  li: "List item",
  blockquote: "Quote",
  figcaption: "Caption",
  label: "Label",
  span: "Text",
  small: "Small text",
  strong: "Bold text",
  em: "Italic text",
  section: "Section",
  header: "Header",
  footer: "Footer",
  nav: "Navigation",
  main: "Main content",
  article: "Article",
};
const tagLabel = (tag: string) => TAG_LABELS[tag] ?? `<${tag}>`;

const Picked = z.object({
  type: z.literal(DESIGN_PICK_MESSAGE),
  n: z.number().int().min(0),
  style: z.object({
    color: z.string().max(100),
    backgroundColor: z.string().max(100),
    fontSize: z.string().max(40),
    fontWeight: z.string().max(10),
    textAlign: z.string().max(20),
    padding: z.string().max(40),
    borderRadius: z.string().max(40),
  }),
});

// A section toolbar action from the preview (ADR 0159): the frame only reports it; the editor makes the edit.
const Action = z.object({
  type: z.literal(DESIGN_ACTION_MESSAGE),
  action: z.enum(["move", "duplicate", "remove"]),
  n: z.number().int().min(0),
  before: z.number().int().min(0).nullable().optional(),
});

type Message = { tone: "ok" | "warning" | "error"; text: string };
type Snapshot = { files: Record<string, string>; page: string };

/**
 * The visual editor (ADR 0118): pick an element in the page, change its text,
 * link, image description or style, then review the exact change to the
 * project's HTML and CSS and save it as new revisions, as the code editor
 * does. Nothing is saved until the review.
 */
export function VisualEditor({
  projectId,
  files,
  revisions,
  images,
  imagePaths = [],
  initialPage,
  disabledReason,
  kitPro = false,
}: {
  projectId: string;
  /** The project's text files, by path. */
  files: Record<string, string>;
  revisions: Record<string, number>;
  images?: Record<string, string>;
  /** Every image in the project, by path, which a replaced image may use (ADR 0156). */
  imagePaths?: readonly string[];
  initialPage: string | null;
  /** Why saving isn't possible right now; editing the draft still works. */
  disabledReason: string | null;
  /** Whether the workspace's plan includes Studio kit Pro, for Pro sections and looks (ADR 0157). */
  kitPro?: boolean;
}) {
  const router = useRouter();
  const pages = useMemo(() => sitePages(files), [files]);
  const [page, setPage] = useState(initialPage && pages.includes(initialPage) ? initialPage : pages.includes("index.html") ? "index.html" : pages[0]!);
  const [draft, setDraft] = useState(files);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [tab, setTab] = useState<"element" | "sections" | "theme">("element");
  const [selected, setSelected] = useState<{ n: number; style: PickedStyle | null; stamp: number } | null>(null);
  // The styles the last edit asked for, checked against what the page then shows.
  const expected = useRef<{ n: number; props: Partial<Record<StyleProp, string | null>> } | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [mode, setMode] = useState<"design" | "review">("design");
  const [reviewed, setReviewed] = useState<Record<string, string>>({});
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("desktop");
  const [saving, startSave] = useTransition();
  const frame = useRef<HTMLIFrameElement>(null);
  const listId = useId();

  const html = draft[page] ?? "";
  const elements = useMemo(() => scanElements(html), [html]);
  const items = useMemo(() => outline(html, elements), [html, elements]);
  const media = useMemo(() => mediaSlots(elements), [elements]);
  const sectionItems = useMemo(() => sections(html, elements), [html, elements]);
  const onKit = useMemo(() => Object.entries(draft).some(([p, c]) => /\.html?$/i.test(p) && /kit\/studio\/v\d+\/studio\.css/.test(c)), [draft]);
  // Photos uploaded in this session (ADR 0160): saved to the project already, shown here until the page reloads.
  const [uploads, setUploads] = useState<Record<string, string>>({});
  const allImages = useMemo(() => ({ ...images, ...uploads }), [images, uploads]);
  const allPaths = useMemo(() => [...new Set([...imagePaths, ...Object.keys(uploads)])], [imagePaths, uploads]);
  const assets = useMemo(() => new Set(allPaths), [allPaths]);
  const changedPaths = Object.keys(draft).filter((p) => draft[p] !== files[p]);

  const doc = useMemo(() => {
    const built = buildStaticSrcdoc({ ...draft, [page]: annotateForDesign(html, elements) }, page, allImages);
    if (built === null) return null;
    const at = built.toLowerCase().lastIndexOf("</body>");
    return at < 0 ? built + DESIGN_SCRIPT : built.slice(0, at) + DESIGN_SCRIPT + built.slice(at);
  }, [draft, page, html, elements, allImages]);

  // Picks arrive from this frame only, for an element that exists in this version of the page.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const action = Action.safeParse(e.data);
      if (action.success) {
        const { n, before } = action.data;
        if (n >= elements.length || (before !== undefined && before !== null && before >= elements.length)) return;
        applyRef.current(n, action.data.action === "move" ? { kind: "move", before: before ?? null } : { kind: action.data.action });
        return;
      }
      const parsed = Picked.safeParse(e.data);
      if (!parsed.success || parsed.data.n >= elements.length) return;
      const { n, style } = parsed.data;
      setSelected((s) => ({ n, style, stamp: (s?.stamp ?? 0) + 1 }));
      const want = expected.current;
      expected.current = null;
      const missed = want && want.n === n ? styleMisses(want.props, style) : [];
      if (missed.length > 0) {
        setMessage({
          tone: "warning",
          text: `The draft has the new ${missed.join(" and ")}, but a more specific rule in the site's CSS still wins, so it doesn't look different. Change that rule in code, or remove it.`,
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [elements.length]);

  function select(n: number) {
    frame.current?.contentWindow?.postMessage({ type: DESIGN_SELECT_MESSAGE, n }, "*");
    setSelected((s) => ({ n, style: null, stamp: (s?.stamp ?? 0) + 1 }));
  }

  /** The section around an element: the element itself when it is one. */
  function sectionAround(n: number): number | null {
    for (let k: number | null = n; k !== null; k = elements[k]?.parent ?? null) if (sectionItems.some((s) => s.n === k)) return k;
    return null;
  }

  const STRUCTURAL = new Set(["move", "duplicate", "remove", "insert"]);
  const DONE: Partial<Record<VisualEdit["kind"], string>> = { move: "Moved the section", duplicate: "Duplicated the section", remove: "Deleted the section", insert: "Added the section", theme: "Changed the theme" };

  function applyAt(n: number, edit: VisualEdit, uploaded?: string): boolean {
    const r = applyVisualEdit(draft, page, n, edit, uploaded ? new Set([...assets, uploaded]) : assets);
    if (!r.ok) {
      setMessage({ tone: "error", text: r.reason });
      return false;
    }
    const next = r.select ?? (STRUCTURAL.has(edit.kind) || edit.kind === "theme" ? (edit.kind === "theme" ? (selected?.n ?? null) : null) : relocate(html, n, r.files[page]!));
    setHistory((h) => [...h.slice(-49), { files: draft, page }]);
    setFuture([]);
    setDraft(r.files);
    setSelected(next === null || next === undefined ? null : { n: next, style: selected?.n === n ? selected.style : null, stamp: (selected?.stamp ?? 0) + 1 });
    expected.current = edit.kind === "style" && next !== null && next !== undefined ? { n: next, props: edit.props } : null;
    if (edit.kind === "theme") frame.current?.contentWindow?.postMessage({ type: DESIGN_THEME_MESSAGE }, "*");
    setMessage({ tone: "ok", text: `${DONE[edit.kind] ?? "Applied to the draft"}${r.note ? `. ${r.note}` : ""}. Nothing is saved until you review it.` });
    return true;
  }
  // The preview's toolbar reaches applyAt through a ref, so its listener always uses this render's draft.
  const applyRef = useRef(applyAt);
  useEffect(() => {
    applyRef.current = applyAt;
  });

  function apply(edit: VisualEdit) {
    if (selected) applyAt(selected.n, edit);
  }

  /** Saves a photo to the project, then puts it in picture n of the draft. Resolves to an error message, or null. */
  async function upload(n: number, file: File): Promise<string | null> {
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("image", file);
    const r = await uploadStudioImageAction(form);
    if (r.status === "error") return r.message;
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setUploads((u) => ({ ...u, [r.path]: url }));
    // The latest render's applyAt, so an edit made while the photo uploaded isn't lost.
    if (applyRef.current(n, { kind: "media", src: r.path }, r.path)) {
      setMessage({ tone: "ok", text: `Uploaded ${r.path} to the project and put it in the picture. Describe it below for screen readers, then review and save the draft.` });
    }
    return null;
  }

  function preview(p: ThemePreview) {
    frame.current?.contentWindow?.postMessage({ type: DESIGN_THEME_MESSAGE, look: p?.look ?? null, vars: p?.vars ?? {} }, "*");
  }

  function step(from: Snapshot[], to: (f: (s: Snapshot[]) => Snapshot[]) => void, setFrom: (f: (s: Snapshot[]) => Snapshot[]) => void, words: string) {
    const last = from.at(-1);
    if (!last) return;
    const n = selected && last.page === page ? relocate(html, selected.n, last.files[page] ?? "") : null;
    setFrom((h) => h.slice(0, -1));
    to((h) => [...h.slice(-49), { files: draft, page }]);
    setDraft(last.files);
    setPage(last.page);
    setSelected(n === null ? null : { n, style: null, stamp: (selected?.stamp ?? 0) + 1 });
    expected.current = null;
    setMessage({ tone: "ok", text: words });
  }
  const undo = () => step(history, setFuture, setHistory, "Undid the last change to the draft.");
  const redo = () => step(future, setHistory, setFuture, "Redid the change.");
  const keys = useRef({ undo, redo });
  useEffect(() => {
    keys.current = { undo, redo };
  });

  // Ctrl+Z and Ctrl+Shift+Z (Cmd on a Mac) undo and redo, unless the person is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      if (e.shiftKey) keys.current.redo();
      else keys.current.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function save() {
    startSave(async () => {
      // Stylesheets first: if a page fails to save after them, the worst left behind is an unused rule.
      const order = [...changedPaths].sort((a, b) => Number(/\.html?$/i.test(a)) - Number(/\.html?$/i.test(b)));
      const done: string[] = [];
      for (const path of order) {
        const content = reviewed[path] ?? draft[path]!;
        if (content === files[path]) continue;
        const r = await saveFileAction({ projectId, path, content, expectedRevision: revisions[path] ?? 0 });
        if (r.status !== "done") {
          setMessage({ tone: "error", text: `${done.length ? `Saved ${done.join(" and ")}, then ` : ""}${path} wasn't saved: ${r.message}` });
          router.refresh();
          return;
        }
        done.push(path);
      }
      if (done.length === 0) {
        setMessage({ tone: "ok", text: "Nothing to save: every change was rejected in the review." });
        setMode("design");
        return;
      }
      router.replace(`/app/projects/${projectId}/design?page=${encodeURIComponent(page)}&saved=${done.length}`);
      router.refresh();
    });
  }

  const el = selected ? elements[selected.n] : undefined;
  const width = DEVICES.find((d) => d.id === device)!.width;

  if (mode === "review") {
    return (
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[15px] font-medium">
            <GitDiffIcon size={20} className="text-accent" aria-hidden /> Review the change to {changedPaths.length === 1 ? "1 file" : `${changedPaths.length} files`}
          </p>
          <button type="button" onClick={() => setMode("design")} className={buttonClasses("ghost", "sm")}>
            Back to editing
          </button>
        </div>
        <p className="text-sm text-ink-2">This is exactly what will change in the project&apos;s files. Reject any part you don&apos;t want, then save.</p>
        {changedPaths.map((path) => (
          <div key={path} className="grid gap-2">
            <p className="font-mono text-xs text-ink-3">{path}</p>
            <Surface key={`review:${path}`} path={path} value={draft[path]!} original={files[path] ?? ""} label={`Changes to ${path}`} onChange={(next) => setReviewed((r) => ({ ...r, [path]: next }))} />
          </div>
        ))}
        <Feedback message={message} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={saving || disabledReason !== null} className={buttonClasses("primary", "md")}>
            <CheckCircleIcon size={18} aria-hidden /> {saving ? "Saving…" : changedPaths.length === 1 ? "Save the change" : `Save ${changedPaths.length} files`}
          </button>
          {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : <p className="text-sm text-ink-3">Each file becomes a new revision you can see and restore in its history.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-start">
      <div className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {pages.length > 1 ? (
            <label className="flex items-center gap-2 text-sm text-ink-2">
              Page
              <select
                value={page}
                onChange={(e) => {
                  setPage(e.target.value);
                  setSelected(null);
                  setMessage(null);
                }}
                className="min-h-11 rounded-full border border-line bg-surface px-3 text-base text-ink sm:text-sm"
              >
                {pages.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="font-mono text-xs text-ink-3">{page}</span>
          )}
          <div className="inline-flex rounded-full border border-line bg-surface p-1" role="group" aria-label="Device width">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={device === d.id}
                aria-label={d.label}
                title={d.label}
                onClick={() => setDevice(d.id)}
                className={`inline-flex size-11 items-center justify-center rounded-full transition-colors duration-150 ${device === d.id ? "bg-surface-raised text-ink" : "text-ink-3 hover:text-ink"}`}
              >
                <d.icon size={17} weight={device === d.id ? "fill" : "regular"} aria-hidden />
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-line bg-surface-sunken p-2 sm:p-3">
          {doc === null ? (
            <p className="grid h-72 place-items-center px-6 text-center text-sm text-ink-3">There&apos;s no {page} to show.</p>
          ) : (
            <div className="mx-auto overflow-hidden rounded-sm bg-surface shadow-e1 motion-safe:transition-[max-width] motion-safe:duration-300" style={{ maxWidth: width ?? "100%" }}>
              <iframe
                ref={frame}
                title={`Visual editor for ${page}`}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                srcDoc={doc}
                onLoad={() => {
                  const win = frame.current?.contentWindow;
                  win?.postMessage({ type: DESIGN_SECTIONS_MESSAGE, items: sectionItems.map((s) => [s.n, s.label]) }, "*");
                  if (selected) win?.postMessage({ type: DESIGN_SELECT_MESSAGE, n: selected.n }, "*");
                }}
                className="block h-[min(62dvh,640px)] w-full bg-white"
              />
            </div>
          )}
        </div>
        <p className="text-xs text-ink-3">Click or tap an element to change it, or Alt+click to pick its whole section. Drag a section by the handle on its toolbar. Links don&apos;t open while you edit, and the page runs locked down, with no access to Farbaek or the network.</p>
      </div>

      <aside aria-label="Edit the site" className="grid gap-4 rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5 lg:sticky lg:top-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-2">
            {changedPaths.length === 0 ? "No changes yet." : `${changedPaths.length === 1 ? "1 file" : `${changedPaths.length} files`} changed in the draft.`}
          </p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={undo} disabled={history.length === 0} aria-label="Undo" title="Undo (Ctrl+Z)" className={buttonClasses("ghost", "sm")}>
              <ArrowCounterClockwiseIcon size={16} aria-hidden />
            </button>
            <button type="button" onClick={redo} disabled={future.length === 0} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className={buttonClasses("ghost", "sm")}>
              <ArrowClockwiseIcon size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                setReviewed({});
                setMessage(null);
                setMode("review");
              }}
              disabled={changedPaths.length === 0}
              className={buttonClasses("secondary", "sm")}
            >
              <GitDiffIcon size={16} aria-hidden /> Review
            </button>
          </div>
        </div>

        <div className="flex rounded-full border border-line bg-surface p-1" role="tablist" aria-label="What to edit">
          {(
            [
              ["element", "Element", CursorClickIcon],
              ["sections", "Sections", RowsIcon],
              ["theme", "Theme", PaletteIcon],
            ] as const
          ).map(([t, label, TabIcon]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                if (t !== "theme") preview(null);
              }}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-sm transition-colors duration-150 ${tab === t ? "bg-primary font-medium text-on-primary" : "text-ink-2 hover:text-ink"}`}
            >
              <TabIcon size={15} aria-hidden /> {label}
            </button>
          ))}
        </div>

        <Feedback message={message} />

        {tab === "sections" ? (
          <SectionsPanel
            items={sectionItems}
            selected={selected ? sectionAround(selected.n) : null}
            container={elements.find((e) => e.tag === "main")?.n ?? elements.find((e) => e.tag === "body")?.n ?? null}
            kitPro={kitPro}
            onSelect={select}
            onEdit={applyAt}
          />
        ) : tab === "theme" ? (
          <ThemePanel files={draft} onKit={onKit} kitPro={kitPro} upgradeHref={`/app/projects/${projectId}`} onApply={(edit) => applyAt(0, edit)} onPreview={preview} />
        ) : el ? (
          <Inspector
            key={`${page}:${selected!.n}:${selected!.stamp}`}
            html={html}
            el={el}
            elements={elements}
            picked={selected!.style}
            onApply={apply}
            images={allImages}
            imagePaths={allPaths}
            onUpload={(file) => upload(selected!.n, file)}
            uploadDisabledReason={disabledReason}
            mediaSource={media.find((m) => m.n === selected!.n)?.source ?? null}
            sectionAround={sectionAround(selected!.n)}
            onSelectSection={(n) => {
              select(n);
              setTab("sections");
            }}
          />
        ) : (
          <div className="grid justify-items-start gap-2 rounded-sm border border-dashed border-line-strong/40 p-4 text-sm text-ink-2">
            <CursorClickIcon size={22} className="text-accent" aria-hidden />
            Pick an element in the page, or choose one from the list below.
          </div>
        )}

        {tab === "element" && media.length ? (
          <details className="group" open={media.some((m) => m.placeholder)}>
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
              Media on this page ({media.length}
              {media.some((m) => m.placeholder) ? `, ${media.filter((m) => m.placeholder).length} to replace` : ""})
            </summary>
            <ul className="mt-1 grid max-h-72 gap-0.5 overflow-y-auto pr-1">
              {media.map((m) => {
                const KindIcon = m.kind === "image" ? ImageSquareIcon : m.kind === "video" ? FilmStripIcon : CubeIcon;
                return (
                  <li key={m.n}>
                    <button
                      type="button"
                      onClick={() => select(m.n)}
                      aria-current={selected?.n === m.n ? "true" : undefined}
                      className={`flex min-h-11 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-surface-raised ${selected?.n === m.n ? "bg-accent/[0.08] text-ink" : "text-ink-2"}`}
                    >
                      <KindIcon size={16} className="shrink-0 text-ink-3" aria-hidden />
                      <span className="sr-only">{m.kind === "scene" ? "3D scene" : m.kind === "image" ? "Image" : "Video"}: </span>
                      <span className="min-w-0 flex-1 truncate">{m.slot ?? m.source ?? "(no address)"}</span>
                      {m.placeholder ? <PlaceholderChip /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}

        <details className={`group ${tab === "element" ? "" : "hidden"}`}>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Elements on this page ({items.length})</summary>
          {items.length === 0 ? (
            <p className="text-sm text-ink-3">This page has no headings, text, links or images inside its body.</p>
          ) : (
            <ul id={listId} className="mt-1 grid max-h-72 gap-0.5 overflow-y-auto pr-1">
              {items.map((item) => (
                <li key={item.n}>
                  <button
                    type="button"
                    onClick={() => select(item.n)}
                    aria-current={selected?.n === item.n ? "true" : undefined}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-surface-raised ${selected?.n === item.n ? "bg-accent/[0.08] text-ink" : "text-ink-2"}`}
                    style={{ paddingLeft: `${8 + Math.min(item.depth, 6) * 10}px` }}
                  >
                    <span className="shrink-0 text-xs text-ink-3">{tagLabel(item.tag)}</span>
                    <span className="min-w-0 truncate">{item.label || "(no text)"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>
      </aside>
    </div>
  );
}

function Feedback({ message }: { message: Message | null }) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 text-sm ${message.tone === "error" ? "text-failed" : "text-ink-2"}`}>
          {message.tone === "ok" ? (
            <CheckCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden />
          ) : (
            <WarningCircleIcon size={16} weight="bold" className={`mt-0.5 shrink-0 ${message.tone === "warning" ? "text-approval" : ""}`} aria-hidden />
          )}
          <span>{message.text}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Which requested styles the browser didn't end up showing. */
function styleMisses(props: Partial<Record<StyleProp, string | null>>, got: PickedStyle): string[] {
  const shown: Record<StyleProp, string | null> = {
    color: cssColorToHex(got.color),
    "background-color": cssColorToHex(got.backgroundColor),
    "font-size": got.fontSize,
    "font-weight": got.fontWeight,
    "text-align": got.textAlign === "start" ? "left" : got.textAlign,
    padding: got.padding || null,
    "border-radius": got.borderRadius,
  };
  return (Object.entries(props) as [StyleProp, string | null][]).filter(([p, v]) => v !== null && shown[p] !== v).map(([p]) => STYLE_WORDS[p]);
}

const STYLE_WORDS: Record<StyleProp, string> = {
  color: "text colour",
  "background-color": "background",
  "font-size": "text size",
  "font-weight": "weight",
  "text-align": "alignment",
  padding: "padding",
  "border-radius": "corner radius",
};

const WEIGHTS = [
  ["300", "Light"],
  ["400", "Regular"],
  ["500", "Medium"],
  ["600", "Semibold"],
  ["700", "Bold"],
  ["800", "Extra bold"],
] as const;

const px = (v: string | undefined) => {
  const n = Number.parseFloat(v ?? "");
  return Number.isFinite(n) ? String(Math.round(n)) : "";
};

const fieldClass = "min-h-11 w-full rounded-sm border border-line bg-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Inspector({
  html,
  el,
  elements,
  picked,
  onApply,
  images,
  imagePaths,
  onUpload,
  uploadDisabledReason,
  mediaSource,
  sectionAround,
  onSelectSection,
}: {
  html: string;
  el: SourceElement;
  picked: PickedStyle | null;
  onApply: (edit: VisualEdit) => void;
  images?: Record<string, string>;
  imagePaths: readonly string[];
  onUpload: (file: File) => Promise<string | null>;
  uploadDisabledReason: string | null;
  /** The image or video's current address, from the page's media list. */
  mediaSource: string | null;
  elements: SourceElement[];
  /** The section this element is in, or null. */
  sectionAround: number | null;
  onSelectSection(n: number): void;
}) {
  const id = useId();
  const text = editableText(html, el);
  const label = labelText(html, el, elements);
  const [labelDraft, setLabel] = useState(label ?? "");
  const scene = attrValue(el, "data-farbaek-scene");
  const isMedia = el.tag === "img" || el.tag === "video";
  const [textDraft, setText] = useState(text ?? "");
  const [href, setHref] = useState(attrValue(el, "href") ?? "");
  const [alt, setAlt] = useState(attrValue(el, "alt") ?? "");
  const shown = {
    color: (picked && cssColorToHex(picked.color)) ?? "#111111",
    "background-color": (picked && cssColorToHex(picked.backgroundColor)) ?? "#ffffff",
    "font-size": px(picked?.fontSize),
    "font-weight": WEIGHTS.map(([w]) => w).find((w) => w === picked?.fontWeight) ?? "400",
    "text-align": picked?.textAlign === "center" || picked?.textAlign === "right" ? picked.textAlign : "left",
    padding: px(picked?.padding),
    "border-radius": px(picked?.borderRadius),
  };
  const [style, setStyle] = useState<Partial<Record<StyleProp, string>>>({});
  const value = (p: StyleProp) => style[p] ?? shown[p];
  const set = (p: StyleProp, v: string) => setStyle((s) => ({ ...s, [p]: v }));
  const touched = Object.keys(style).length > 0;

  function applyStyle() {
    const props: Partial<Record<StyleProp, string>> = {};
    for (const [p, v] of Object.entries(style) as [StyleProp, string][]) props[p] = (p === "font-size" || p === "padding" || p === "border-radius") && /^\d+$/.test(v) ? `${v}px` : v;
    onApply({ kind: "style", props });
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
          {scene !== null ? "3D scene" : tagLabel(el.tag)}
          {attrValue(el, "data-farbaek-media") ? <span className="font-mono text-xs font-normal text-ink-3">{attrValue(el, "data-farbaek-media")}</span> : null}
          {!isMedia && hasAttr(el, "data-farbaek-placeholder") ? <PlaceholderChip /> : null}
        </p>
        {picked === null ? <p className="text-xs text-ink-3">Reading its styles from the page…</p> : null}
        {sectionAround !== null && sectionAround !== el.n ? (
          <button type="button" onClick={() => onSelectSection(sectionAround)} className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-ink-2 transition-colors duration-150 hover:text-ink">
            <SelectionIcon size={15} aria-hidden /> Select the section around this
          </button>
        ) : null}
      </div>

      {isMedia ? (
        <MediaReplace
          kind={el.tag === "img" ? "image" : "video"}
          current={mediaSource}
          placeholder={hasAttr(el, "data-farbaek-placeholder")}
          images={images}
          imagePaths={imagePaths}
          onReplace={(edit) => onApply({ kind: "media", ...edit })}
          onUpload={el.tag === "img" ? onUpload : undefined}
          uploadDisabledReason={uploadDisabledReason}
        />
      ) : null}

      {scene !== null ? <ScenePicker current={scene} onPick={(s) => onApply({ kind: "scene", scene: s })} /> : null}

      {text !== null ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-text`} className="text-sm font-medium">
            Text
          </label>
          <textarea id={`${id}-text`} value={textDraft} onChange={(e) => setText(e.target.value)} rows={3} className={`${fieldClass} py-2`} />
          <div>
            <button type="button" onClick={() => onApply({ kind: "text", text: textDraft })} disabled={textDraft === text} className={buttonClasses("secondary", "sm")}>
              Apply text
            </button>
          </div>
        </div>
      ) : label !== null ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-label`} className="text-sm font-medium">
            Label
          </label>
          <input id={`${id}-label`} value={labelDraft} onChange={(e) => setLabel(e.target.value)} className={fieldClass} />
          <div>
            <button type="button" onClick={() => onApply({ kind: "label", text: labelDraft })} disabled={labelDraft.trim() === label} className={buttonClasses("secondary", "sm")}>
              Apply label
            </button>
          </div>
        </div>
      ) : !isMedia && scene === null ? (
        <p className="text-sm text-ink-3">Its text is made of other elements. Pick one of them to change the words.</p>
      ) : null}

      {el.tag === "a" ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-href`} className="text-sm font-medium">
            Goes to
          </label>
          <input id={`${id}-href`} value={href} onChange={(e) => setHref(e.target.value)} inputMode="url" autoComplete="off" spellCheck={false} className={`${fieldClass} font-mono`} />
          <p className="text-xs text-ink-3">A page in this site, an anchor such as #contact, or an https, mailto or tel address.</p>
          <div>
            <button type="button" onClick={() => onApply({ kind: "link", href })} disabled={href === (attrValue(el, "href") ?? "")} className={buttonClasses("secondary", "sm")}>
              Apply link
            </button>
          </div>
        </div>
      ) : null}

      {el.tag === "img" ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-alt`} className="text-sm font-medium">
            Description for screen readers
          </label>
          <input id={`${id}-alt`} value={alt} onChange={(e) => setAlt(e.target.value)} className={fieldClass} />
          <div>
            <button type="button" onClick={() => onApply({ kind: "image", alt })} disabled={alt === (attrValue(el, "alt") ?? "")} className={buttonClasses("secondary", "sm")}>
              Apply description
            </button>
          </div>
        </div>
      ) : null}

      <fieldset className="grid gap-3 border-t border-line pt-4">
        <legend className="sr-only">Style</legend>
        <p className="text-sm font-medium">Style</p>
        <div className="grid grid-cols-2 gap-3">
          <ColorField id={`${id}-color`} label="Text colour" value={value("color")} onChange={(v) => set("color", v)} />
          <ColorField id={`${id}-bg`} label="Background" value={value("background-color")} onChange={(v) => set("background-color", v)} />
          <NumberField id={`${id}-size`} label="Exact text size (px)" value={/^\d+$/.test(value("font-size")) ? value("font-size") : ""} min={8} max={160} onChange={(v) => set("font-size", v)} />
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-weight`} className="text-xs text-ink-2">
              Weight
            </label>
            <select id={`${id}-weight`} value={value("font-weight")} onChange={(e) => set("font-weight", e.target.value)} className={fieldClass}>
              {WEIGHTS.map(([w, label]) => (
                <option key={w} value={w}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <NumberField id={`${id}-pad`} label="Padding (px)" value={value("padding")} min={0} max={200} onChange={(v) => set("padding", v)} />
          <NumberField id={`${id}-radius`} label="Corners (px)" value={value("border-radius")} min={0} max={200} onChange={(v) => set("border-radius", v)} />
        </div>
        <div className="grid gap-1.5">
          <span className="text-xs text-ink-2" id={`${id}-sizes`}>
            Text size that scales with the screen
          </span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={`${id}-sizes`}>
            {Object.values(TEXT_SIZES).map((s) => (
              <button
                key={s.label}
                type="button"
                role="radio"
                aria-checked={style["font-size"] === s.value}
                onClick={() => set("font-size", s.value)}
                className={`min-h-11 rounded-full border px-3.5 text-sm transition-colors duration-150 ${style["font-size"] === s.value ? "border-accent bg-accent/[0.06] font-medium text-ink" : "border-line text-ink-2 hover:text-ink"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className="text-xs text-ink-2" id={`${id}-align`}>
            Alignment
          </span>
          <div className="inline-flex w-full rounded-full border border-line bg-surface p-1 sm:w-auto" role="radiogroup" aria-labelledby={`${id}-align`}>
            {([["left", "Left"], ["center", "Center"], ["right", "Right"]] as const).map(([a, word]) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={value("text-align") === a}
                onClick={() => set("text-align", a)}
                className={`min-h-11 flex-1 rounded-full px-4 text-sm transition-colors duration-150 ${value("text-align") === a ? "bg-primary font-medium text-on-primary" : "text-ink-2 hover:text-ink"}`}
              >
                {word}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={applyStyle} disabled={!touched} className={buttonClasses("secondary", "sm")}>
            Apply style
          </button>
          {touched ? (
            <button type="button" onClick={() => setStyle({})} className={buttonClasses("ghost", "sm")}>
              Reset
            </button>
          ) : null}
        </div>
        <p className="text-xs text-ink-3">Styles go into a CSS rule for this element, in the page&apos;s stylesheet, not into the HTML.</p>
      </fieldset>
    </div>
  );
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs text-ink-2">
        {label}
      </label>
      <span className="flex min-h-11 items-center gap-2 rounded-sm border border-line bg-surface px-2">
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-8 shrink-0 cursor-pointer rounded-sm border-0 bg-transparent p-0" />
        <span className="font-mono text-xs text-ink-2">{value}</span>
      </span>
    </div>
  );
}

function NumberField({ id, label, value, min, max, onChange }: { id: string; label: string; value: string; min: number; max: number; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs text-ink-2">
        {label}
      </label>
      <input id={id} type="number" inputMode="numeric" min={min} max={max} step={1} value={value} onChange={(e) => onChange(e.target.value)} className={`${fieldClass} tabular`} />
    </div>
  );
}
