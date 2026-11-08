"use client";

import { ArrowCounterClockwiseIcon, CheckCircleIcon, CursorClickIcon, GitDiffIcon, WarningCircleIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { saveFileAction } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { CLASS_GROUPS, classGroup, parseClasses, scanJsx, setJsxClasses, setJsxText, withClassGroup, type ClassGroup, type JsxElement } from "@/core/studio/jsx-edit";
import { matchPicked, type PickCandidate, type Picked } from "@/core/studio/pick-match";
import { RunningAppPicker } from "./running-app-picker";

const Surface = dynamic(() => import("@/components/files/codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 items-center justify-center rounded-md border border-line bg-surface-raised text-sm text-ink-3" role="status">
      Loading the review…
    </div>
  ),
});

const field = "min-h-11 w-full rounded-sm border border-line bg-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
type Message = { tone: "ok" | "error"; text: string };

/**
 * The component editor (ADR 0129) for apps with a build step: a component's
 * JSX as a list of its elements, with each element's words and Tailwind
 * classes editable. Edits build a draft; Review shows the exact diff; Save
 * writes each file through the same server path as the code editor.
 */
export function ComponentEditor({
  projectId,
  files,
  revisions,
  tailwind,
  disabledReason,
  pick = null,
}: {
  projectId: string;
  files: Record<string, string>;
  revisions: Record<string, number>;
  tailwind: boolean;
  disabledReason: string | null;
  /** The project's running sandbox sessions, to pick elements in (ADR 0149); null where that isn't offered. */
  pick?: { sessions: { id: string; name: string }[]; unavailable: string | null } | null;
}) {
  const router = useRouter();
  const paths = Object.keys(files);
  const [path, setPath] = useState(paths[0] ?? "");
  const [draft, setDraft] = useState<Record<string, string>>(files);
  const [history, setHistory] = useState<{ path: string; source: string }[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [mode, setMode] = useState<"edit" | "review">("edit");
  const [reviewed, setReviewed] = useState<Record<string, string>>({});
  const [saving, startSave] = useTransition();

  const source = draft[path] ?? "";
  const scan = useMemo(() => scanJsx(source), [source]);
  const elements = scan.ok ? scan.elements : [];
  const el = selected === null ? undefined : elements[selected];
  const changedPaths = paths.filter((p) => draft[p] !== files[p]);
  const [candidates, setCandidates] = useState<PickCandidate[] | null>(null);

  /** A click in the running app (ADR 0149): matched by words and classes across every component, best first. */
  function onPicked(picked: Picked) {
    const scans = Object.keys(draft).map((p) => {
      const s = scanJsx(draft[p] ?? "");
      return { path: p, elements: s.ok ? s.elements : [] };
    });
    const found = matchPicked(picked, scans);
    setCandidates(found);
    const best = found[0];
    if (!best) {
      setMessage({ tone: "error", text: `Nothing in the code has the words or classes of that <${picked.tag}>. The app may build them as it runs; find it in the outline instead.` });
      return;
    }
    setPath(best.path);
    setSelected(best.n);
    setMessage({ tone: "ok", text: `Selected <${best.tag}> at ${best.path}:${best.line}. ${best.why}.` });
  }

  function apply(next: string, note: string) {
    setHistory((h) => [...h, { path, source }]);
    setDraft((d) => ({ ...d, [path]: next }));
    setReviewed({});
    setMessage({ tone: "ok", text: note });
  }

  function undo() {
    const last = history.at(-1);
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setDraft((d) => ({ ...d, [last.path]: last.source }));
    setPath(last.path);
    setReviewed({});
    setMessage({ tone: "ok", text: "Undid the last change to the draft." });
  }

  function save() {
    startSave(async () => {
      const done: string[] = [];
      for (const p of changedPaths) {
        const content = reviewed[p] ?? draft[p]!;
        if (content === files[p]) continue;
        const r = await saveFileAction({ projectId, path: p, content, expectedRevision: revisions[p] ?? 0 });
        if (r.status !== "done") {
          setMessage({ tone: "error", text: `${done.length ? `Saved ${done.join(" and ")}, then ` : ""}${p} wasn't saved: ${r.message}` });
          router.refresh();
          return;
        }
        done.push(p);
      }
      if (done.length === 0) {
        setMessage({ tone: "ok", text: "Nothing to save: every change was rejected in the review." });
        setMode("edit");
        return;
      }
      router.replace(`/app/projects/${projectId}/design?saved=${done.length}`);
      router.refresh();
    });
  }

  if (mode === "review") {
    return (
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
            <GitDiffIcon size={20} className="text-accent" aria-hidden /> Review the change to {changedPaths.length === 1 ? "1 file" : `${changedPaths.length} files`}
          </p>
          <button type="button" onClick={() => setMode("edit")} className={buttonClasses("ghost", "sm")}>
            Back to editing
          </button>
        </div>
        <p className="text-sm text-ink-2">This is exactly what will change in the project&apos;s files. Press Leave out on any part you don&apos;t want, then save.</p>
        {changedPaths.map((p) => (
          <div key={p} className="grid gap-2">
            <p className="break-all font-mono text-xs text-ink-3">{p}</p>
            <Surface key={`review:${p}`} path={p} value={draft[p]!} original={files[p] ?? ""} label={`Changes to ${p}`} onChange={(next) => setReviewed((r) => ({ ...r, [p]: next }))} />
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
    <div className="grid gap-5">
      {pick ? (
        <details className="group rounded-md border border-line bg-surface p-4" open={pick.sessions.length > 0}>
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-[0.9375rem] font-medium">
            <CursorClickIcon size={18} className="text-accent" aria-hidden /> Pick in the running app
          </summary>
          <div className="mt-3 grid gap-3">
            <RunningAppPicker projectId={projectId} sessions={pick.sessions} unavailable={pick.unavailable} onPicked={onPicked} />
            {candidates && candidates.length > 1 ? (
              <div className="grid gap-1.5">
                <p className="text-sm text-ink-2">{candidates.length} places in the code match. The best is selected; choose another if it&apos;s that one:</p>
                <ul className="grid gap-1">
                  {candidates.map((c) => (
                    <li key={`${c.path}:${c.n}`}>
                      <button
                        type="button"
                        aria-pressed={path === c.path && selected === c.n}
                        onClick={() => {
                          setPath(c.path);
                          setSelected(c.n);
                        }}
                        className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-sm px-3 text-left text-sm transition-colors duration-150 ${path === c.path && selected === c.n ? "bg-accent/[0.09] ring-1 ring-accent/40" : "hover:bg-surface-raised"}`}
                      >
                        <span className="min-w-0 truncate font-mono text-xs" title={`${c.path}:${c.line} <${c.tag}>`}>
                          {c.path}:{c.line} &lt;{c.tag}&gt;
                        </span>
                        <span className="ml-auto shrink-0 text-xs text-ink-3">{c.why}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start">
        <div className="grid min-w-0 gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            Component
            <select
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setSelected(null);
                setMessage(null);
              }}
              className={`${field} font-mono sm:text-sm`}
            >
              {paths.map((p) => (
                <option key={p} value={p}>
                  {draft[p] !== files[p] ? `${p} (changed)` : p}
                </option>
              ))}
            </select>
          </label>
          {scan.ok ? (
            <ol aria-label={`Elements in ${path}`} className="grid gap-1 rounded-md border border-line bg-surface p-2">
              {elements.map((e) => (
                <li key={e.n}>
                  <button
                    type="button"
                    aria-pressed={selected === e.n}
                    onClick={() => {
                      setSelected(e.n);
                      setMessage(null);
                    }}
                    style={{ paddingLeft: `${0.75 + Math.min(e.depth, 6) * 0.9}rem` }}
                    className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-sm pr-3 text-left text-sm transition-colors duration-150 ${selected === e.n ? "bg-accent/[0.09] text-ink ring-1 ring-accent/40" : "hover:bg-surface-raised"}`}
                  >
                    <span className={`shrink-0 font-mono text-xs ${e.builtin ? "text-ink-2" : "text-accent"}`}>&lt;{e.tag}&gt;</span>
                    {e.text ? (
                      <span className="min-w-0 truncate text-ink-2" title={e.text.value}>
                        {e.text.value}
                      </span>
                    ) : e.className ? (
                      <span className="min-w-0 truncate font-mono text-xs text-ink-3" title={e.className.value}>
                        {e.className.value || "no classes"}
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 text-xs text-ink-3">line {e.line}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-md border border-dashed border-line-strong/50 p-4 text-sm text-ink-2">{scan.reason}</p>
          )}
        </div>

        <div className="grid gap-4 lg:sticky lg:top-24">
          {el ? <Inspector key={`${path}:${el.n}:${source.length}`} el={el} source={source} tailwind={tailwind} onApply={apply} onError={(text) => setMessage({ tone: "error", text })} /> : <p className="rounded-md border border-line bg-surface p-4 text-sm text-ink-2">Choose an element to change its words or style.</p>}
          <Feedback message={message} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setMode("review")} disabled={changedPaths.length === 0} className={buttonClasses("primary", "sm")}>
              <GitDiffIcon size={16} aria-hidden /> Review {changedPaths.length ? (changedPaths.length === 1 ? "1 file" : `${changedPaths.length} files`) : "changes"}
            </button>
            <button type="button" onClick={undo} disabled={history.length === 0} className={buttonClasses("ghost", "sm")}>
              <ArrowCounterClockwiseIcon size={16} aria-hidden /> Undo
            </button>
          </div>
          <p className="text-xs text-ink-3">
            Changes show in the app after it rebuilds. Open a live preview from the{" "}
            <Link href={`/app/projects/${projectId}`} className="font-medium text-accent hover:underline">
              project page
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function Feedback({ message }: { message: Message | null }) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 text-sm ${message.tone === "error" ? "text-failed" : "text-ink-2"}`}>
          {message.tone === "error" ? <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> : <CheckCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden />}
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function Inspector({ el, source, tailwind, onApply, onError }: { el: JsxElement; source: string; tailwind: boolean; onApply: (next: string, note: string) => void; onError: (text: string) => void }) {
  const id = useId();
  const [text, setText] = useState(el.text?.value ?? "");
  const [classes, setClasses] = useState(el.className?.value ?? "");
  const styleable = Boolean(el.className) || (el.builtin && !el.classNameInCode);
  const list = parseClasses(classes);

  function setGroup(group: ClassGroup, value: string) {
    if (!list.ok) return;
    setClasses(withClassGroup(list.classes, group, value || null).join(" "));
  }

  function applyEdits() {
    let next = source;
    const notes: string[] = [];
    // Words come after the open tag, so change them first and the class positions still hold.
    if (el.text && text.trim() !== el.text.value) {
      const r = setJsxText(next, el, text);
      if (!r.ok) return onError(r.reason);
      next = r.source;
      notes.push("words");
    }
    if (styleable && classes.trim() !== (el.className?.value ?? "").trim()) {
      const r = setJsxClasses(next, el, classes);
      if (!r.ok) return onError(r.reason);
      next = r.source;
      notes.push("classes");
    }
    if (next === source) return onError("Nothing changed. Edit the words or classes first.");
    onApply(next, `Changed the ${notes.join(" and ")} of <${el.tag}> in the draft. Review to see the diff.`);
  }

  return (
    <div className="grid gap-4 rounded-md border border-line bg-surface p-4 shadow-e1">
      <p className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-mono text-[0.8125rem] text-ink">&lt;{el.tag}&gt;</span>
        <span className="text-xs text-ink-3">line {el.line}</span>
      </p>
      {el.text ? (
        <label className="grid gap-1.5 text-sm font-medium" htmlFor={`${id}-text`}>
          Words
          <input id={`${id}-text`} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} className={field} />
        </label>
      ) : (
        <p className="text-sm text-ink-3">{el.builtin ? "This element's words are mixed with code or other elements; change them in the code editor." : "A component: its words come from inside it, or from the code here."}</p>
      )}
      {styleable ? (
        <>
          {tailwind && list.ok ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
              {(Object.keys(CLASS_GROUPS) as ClassGroup[]).map((g) => (
                <label key={g} className="grid gap-1.5 text-sm font-medium">
                  {CLASS_GROUPS[g].label}
                  <select value={classGroup(list.classes, g) ?? ""} onChange={(e) => setGroup(g, e.target.value)} className={`${field} sm:text-sm`}>
                    <option value="">Not set</option>
                    {CLASS_GROUPS[g].values.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}
          <label className="grid gap-1.5 text-sm font-medium" htmlFor={`${id}-classes`}>
            Classes
            <input id={`${id}-classes`} value={classes} onChange={(e) => setClasses(e.target.value)} spellCheck={false} autoCapitalize="none" className={`${field} font-mono`} />
            <span className="text-xs font-normal text-ink-3">{tailwind ? "Tailwind classes. Colours and anything else go here." : "The element's class names."}</span>
          </label>
        </>
      ) : (
        <p className="text-sm text-ink-3">{el.classNameInCode ? "Its className is written as code, so change its style in the code editor." : `<${el.tag}> is a component; its styles are set in its own file.`}</p>
      )}
      <button type="button" onClick={applyEdits} disabled={!el.text && !styleable} className={buttonClasses("secondary", "sm", "justify-self-start")}>
        Apply to the draft
      </button>
    </div>
  );
}
