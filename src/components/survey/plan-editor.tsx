"use client";

import {
  ArrowArcLeftIcon,
  ArrowArcRightIcon,
  ArrowsInIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  FloppyDiskIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  SelectionPlusIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { LAYER_IDS, type LayerId, type SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import { fmt, type SurveyorDetails } from "@/core/survey/sheet/compose";
import type { SceneItem } from "@/core/survey/sheet/scene";
import { buildPlan } from "@/core/survey/view";
import { LAYER_NAMES } from "@/core/survey/assistant/describe";
import { applyOps, revertPatch, type Applied, type Patch } from "@/core/survey/assistant/apply";
import type { PlanOp } from "@/core/survey/assistant/ops";
import type { StepId } from "@/core/survey/assistant/reader";
import { entityBounds, viewAround } from "@/core/survey/sheet/entities";
import { saveSurveyDrawingAction } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";
import { AssistantDock, type EditorBridge } from "./assistant/assistant-dock";
import { handoffKey } from "./assistant/handoff";
import { CodesPanel, SheetFields, describeSelection, type SurveyorOption } from "./plan-panels";
import { SheetSvg } from "./sheet-svg";

export type { SurveyorOption } from "./plan-panels";

export interface PlanEditorProps {
  projectId: string;
  baseVersion: number;
  initialDocument: SurveyDocument;
  points: SurveyPoint[];
  crsId: string;
  crsConfirmation: string | null;
  surveyors: SurveyorOption[];
  approval: { by: string; at: string } | null;
  /** The surveyor's details as stored with the approval, shown while the approved version is unedited. */
  approvedSurveyor: SurveyorDetails | null;
  /** Why this person can't save here (the sample, the demo, a viewer), or null when they can. */
  readOnly: string | null;
  /** Why the drafting assistant can't ask the model here (the demo, no AI), or null; undefined leaves the assistant out. */
  assistantAiOff?: string | null;
}


type Tab = "sheet" | "codes" | "layers" | "selection";
type View = [number, number, number, number];

interface History {
  stack: SurveyDocument[];
  index: number;
  /** The index that matches the last saved version. */
  saved: number;
  coalesce: { key: string; at: number } | null;
}

const clone = (d: SurveyDocument): SurveyDocument => structuredClone(d);

export function PlanEditor(props: PlanEditorProps) {
  const router = useRouter();
  const [history, setHistory] = useState<History>({ stack: [props.initialDocument], index: 0, saved: 0, coalesce: null });
  const doc = history.stack[history.index]!;
  const dirty = history.index !== history.saved;
  const [baseVersion, setBaseVersion] = useState(props.baseVersion);
  const [tab, setTab] = useState<Tab>("sheet");
  const [selected, setSelected] = useState<string | null>(null);
  // Items picked in order (shift, ctrl or cmd plus a tap, or "Select several" on phones), for "these points".
  const [picked, setPicked] = useState<string[]>([]);
  const [several, setSeveral] = useState(false);
  const [message, setMessage] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  // The assistant's change while it waits for Apply, shown on the sheet, and what the last turn changed, marked until the next.
  const [previewOps, setPreviewOps] = useState<PlanOp[] | null>(null);
  const [marks, setMarks] = useState<string[]>([]);
  const preview = useMemo(() => (previewOps ? applyOps(doc, previewOps, props.points) : null), [doc, previewOps, props.points]);
  const shown = preview?.ok ? preview.doc : doc;
  const markSet = useMemo(() => new Set(preview?.ok ? preview.touched : marks), [preview, marks]);

  // An approved, unedited version shows the surveyor's details as they approved them, as the PDF does.
  const plan = useMemo(
    () => buildPlan({ points: props.points, document: shown, crsId: props.crsId, crsConfirmation: props.crsConfirmation, surveyor: !dirty && props.approval && props.approvedSurveyor ? props.approvedSurveyor : (props.surveyors.find((s) => s.userId === doc.surveyorUserId) ?? null), approval: dirty ? null : props.approval, version: dirty ? undefined : baseVersion }),
    [shown, doc.surveyorUserId, props.points, props.crsId, props.crsConfirmation, props.surveyors, props.approval, props.approvedSurveyor, dirty, baseVersion],
  );
  const page = plan.sheet.pages[0]!;
  const fullView: View = [0, 0, page.widthMm, page.heightMm];
  const [view, setView] = useState<View>(fullView);
  const viewKey = `${page.widthMm}x${page.heightMm}`;
  const [lastKey, setLastKey] = useState(viewKey);
  if (lastKey !== viewKey) {
    // The sheet changed size (paper or orientation): show the whole new sheet.
    setLastKey(viewKey);
    setView([0, 0, page.widthMm, page.heightMm]);
  }

  /** Applies an edit. Edits with the same key within 1.5 s (typing in one field) become one undo step. */
  const update = useCallback(
    (change: (d: SurveyDocument) => void, key?: string) => {
      if (props.readOnly) return;
      setHistory((h) => {
        const next = clone(h.stack[h.index]!);
        change(next);
        const now = Date.now();
        const merge = key && h.coalesce && h.coalesce.key === key && now - h.coalesce.at < 1500 && h.index > h.saved;
        const base = h.stack.slice(0, merge ? h.index : h.index + 1);
        const stack = [...base, next];
        return { stack, index: stack.length - 1, saved: h.saved > stack.length - 1 ? -1 : h.saved, coalesce: key ? { key, at: now } : null };
      });
      setMessage(null);
    },
    [props.readOnly],
  );
  const undo = useCallback(() => setHistory((h) => (h.index > 0 ? { ...h, index: h.index - 1, coalesce: null } : h)), []);
  const redo = useCallback(() => setHistory((h) => (h.index < h.stack.length - 1 ? { ...h, index: h.index + 1, coalesce: null } : h)), []);

  /** Saves a version; `after` runs once it's saved (or at once when nothing needs saving). */
  const save = (after?: () => void) => {
    // Nothing can be saved here (the sample, a viewer), so there's nothing unsaved either: go on.
    if (props.readOnly || !dirty) {
      after?.();
      return;
    }
    const target = history.index;
    startSaving(async () => {
      const r = await saveSurveyDrawingAction({ projectId: props.projectId, baseVersion, document: doc });
      if (r.status === "done" && r.version) {
        setBaseVersion(r.version);
        setHistory((h) => ({ ...h, saved: target, coalesce: null }));
        setMessage({ tone: "done", text: r.message });
        if (after) after();
        else router.refresh();
      } else if (r.status === "error") setMessage({ tone: "error", text: r.message });
    });
  };

  /** One change from the assistant, as one undo step. */
  const pushDocument = (next: SurveyDocument) =>
    setHistory((h) => {
      const stack = [...h.stack.slice(0, h.index + 1), next];
      return { stack, index: stack.length - 1, saved: h.saved > stack.length - 1 ? -1 : h.saved, coalesce: null };
    });

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ---- Pan, zoom and dragging -------------------------------------------------
  const svgWrap = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | { kind: "pan"; startX: number; startY: number; view: View; moved: boolean; entity: string | null }
    | { kind: "label"; entity: string; startX: number; startY: number; base: { dx: number; dy: number }; moved: boolean }
    | null
  >(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /** Keeps receiving a pointer that leaves the canvas. Best effort: a pointer the browser no longer tracks can't be captured. */
  const capture = (id: number) => {
    try {
      svgWrap.current?.setPointerCapture(id);
    } catch {
      // Not an active pointer: the drag still works while it stays over the canvas.
    }
  };
  const pinch = useRef<{ dist: number; view: View } | null>(null);

  /** Screen pixels per sheet millimetre at the current view. */
  const pxPerMm = useCallback(() => {
    const el = svgWrap.current;
    if (!el) return 1;
    const r = el.getBoundingClientRect();
    return Math.min(r.width / view[2], r.height / view[3]);
  }, [view]);

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      setView((v) => {
        const w = Math.min(page.widthMm * 1.2, Math.max(8, v[2] / factor));
        const h = (w / v[2]) * v[3];
        const fx = cx ?? v[0] + v[2] / 2;
        const fy = cy ?? v[1] + v[3] / 2;
        return [fx - ((fx - v[0]) / v[2]) * w, fy - ((fy - v[1]) / v[3]) * h, w, h];
      });
    },
    [page.widthMm],
  );

  /** A client point as sheet millimetres in the current view. */
  const toSheet = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const el = svgWrap.current;
      if (!el) return [0, 0];
      const r = el.getBoundingClientRect();
      const k = pxPerMm();
      const ox = (r.width - view[2] * k) / 2;
      const oy = (r.height - view[3] * k) / 2;
      return [view[0] + (clientX - r.left - ox) / k, view[1] + (clientY - r.top - oy) / k];
    },
    [view, pxPerMm],
  );

  useEffect(() => {
    const el = svgWrap.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const [x, y] = toSheet(e.clientX, e.clientY);
      zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, x, y);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [toSheet, zoomAt]);

  const layerOf = (l: string) => doc.layers[l as LayerId];
  const canDrag = (item: SceneItem) => !props.readOnly && item.kind === "text" && Boolean(item.entity) && item.layer !== "SHEET" && !layerOf(item.layer)?.locked && item.entity !== "north" && item.entity !== "scalebar" && item.entity !== "checkline";

  const onEntityDown = (item: SceneItem, e: ReactPointerEvent<SVGElement>) => {
    if (!item.entity || e.button !== 0) return;
    e.stopPropagation();
    capture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (canDrag(item)) {
      const base = doc.labelOffsets[item.entity] ?? { dx: 0, dy: 0 };
      drag.current = { kind: "label", entity: item.entity, startX: e.clientX, startY: e.clientY, base, moved: false };
    } else {
      drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, view, moved: false, entity: item.entity };
    }
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    capture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), view };
      drag.current = null;
      return;
    }
    drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, view, moved: false, entity: null };
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const f = dist / (pinch.current.dist || 1);
      const v = pinch.current.view;
      const w = Math.min(page.widthMm * 1.2, Math.max(8, v[2] / f));
      const h = (w / v[2]) * v[3];
      setView([v[0] + (v[2] - w) / 2, v[1] + (v[3] - h) / 2, w, h]);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const k = pxPerMm();
    const dx = (e.clientX - d.startX) / k;
    const dy = (e.clientY - d.startY) / k;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 3) d.moved = true;
    if (d.kind === "pan") {
      if (d.moved) setView([d.view[0] - dx, d.view[1] - dy, d.view[2], d.view[3]]);
    } else if (d.moved) {
      const next = { dx: Math.max(-200, Math.min(200, d.base.dx + dx)), dy: Math.max(-200, Math.min(200, d.base.dy + dy)) };
      update((doc2) => {
        doc2.labelOffsets[d.entity] = next;
      }, `drag:${d.entity}:${d.startX}:${d.startY}`);
    }
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    // A tap without movement selects what was tapped, or clears the selection. With shift, ctrl or cmd, or "Select several", it adds
    // the item to the picked ones, in order, or takes it out again.
    const entity = d.kind === "label" ? d.entity : d.entity;
    if ((several || e.shiftKey || e.ctrlKey || e.metaKey) && entity) {
      setPicked((p) => (p.includes(entity) ? p.filter((x) => x !== entity) : [...p, entity]));
      setSelected(entity);
      return;
    }
    setPicked([]);
    setSelected(entity);
    if (entity) setTab("selection");
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
    } else if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    } else if (e.key === "+" || e.key === "=") zoomAt(1.25);
    else if (e.key === "-") zoomAt(0.8);
    else if (e.key === "0") setView(fullView);
    else if (e.key === "Escape") {
      setSelected(null);
      setPicked([]);
    }
    else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = view[2] * 0.08;
      const [dx, dy] = e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : [0, step];
      setView([view[0] + dx, view[1] + dy, view[2], view[3]]);
    }
  };

  const hidden = useMemo(() => new Set(LAYER_IDS.filter((l) => l !== "TITLE" && shown.layers[l]?.visible === false)), [shown.layers]);
  const selection = describeSelection(selected, plan, props.points, doc);
  const blocking = plan.findings.filter((f) => f.severity === "error");

  // What the drafting assistant can see and do: the plan as it stands, through the editor's own history and view.
  const go = (step: StepId) => save(() => router.push(`/app/survey/${props.projectId}?step=${step}`));
  const handOver = (value: unknown, step: StepId) => {
    try {
      window.sessionStorage.setItem(handoffKey(props.projectId), JSON.stringify(value));
    } catch {
      setMessage({ tone: "error", text: "This browser won't keep the values for the next step. Type them there instead." });
      return;
    }
    go(step);
  };
  const bridge: EditorBridge = {
    projectId: props.projectId,
    doc,
    points: props.points,
    plan,
    selection: picked.length ? picked : selected ? [selected] : [],
    readOnly: props.readOnly,
    aiOff: props.assistantAiOff ?? null,
    approved: Boolean(props.approval),
    dirty,
    setPreview: setPreviewOps,
    apply: (ops): Applied => {
      if (props.readOnly) return { ok: false, error: props.readOnly };
      const r = applyOps(doc, ops, props.points);
      if (r.ok) {
        pushDocument(r.doc);
        setMessage(null);
      }
      return r;
    },
    revert: (patch: Patch) => {
      if (props.readOnly) return { ok: false, changedSince: [] };
      const r = revertPatch(doc, patch);
      if (r.ok) pushDocument(r.doc);
      return r.ok ? { ok: true } : r;
    },
    view: (op) => {
      if (op.action === "zoom_in") zoomAt(1.25);
      else if (op.action === "zoom_out") zoomAt(0.8);
      else if (op.action === "whole_sheet") setView(fullView);
      else if (op.action === "clear_selection") {
        setSelected(null);
        setPicked([]);
      } else {
        const boxes = op.entities.map((e) => entityBounds(page, e)).filter((b): b is [number, number, number, number] => b !== null);
        if (boxes.length) {
          const [x0, y0] = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1]))];
          const [x1, y1] = [Math.max(...boxes.map((b) => b[0] + b[2])), Math.max(...boxes.map((b) => b[1] + b[3]))];
          setView(viewAround([x0, y0, x1 - x0, y1 - y0], page));
        }
        if (op.action === "select") {
          setPicked(op.entities.length > 1 ? op.entities : []);
          setSelected(op.entities[0] ?? null);
          if (op.entities.length === 1) setTab("selection");
        }
      }
    },
    history: (action) => (action === "undo" ? undo() : redo()),
    setMarks,
    save: () => save(),
    openDivide: (op) => handOver({ kind: "divide", op }, "boundary"),
    openEntry: (op) => handOver({ kind: "entry", op }, "import"),
    goto: go,
  };

  return (
    <div className={`grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] ${props.assistantAiOff !== undefined ? "pb-44 lg:pb-0" : ""}`}>
      <div className="grid min-w-0 content-start gap-3 xl:sticky xl:top-4 xl:self-start">
        <div role="toolbar" aria-label="Plan tools" className="flex flex-wrap items-center gap-2">
          <ToolButton label="Undo" onClick={undo} disabled={history.index === 0} icon={<ArrowArcLeftIcon size={16} weight="bold" aria-hidden />} />
          <ToolButton label="Redo" onClick={redo} disabled={history.index >= history.stack.length - 1} icon={<ArrowArcRightIcon size={16} weight="bold" aria-hidden />} />
          <span className="mx-1 h-6 w-px bg-line" aria-hidden />
          <ToolButton label="Zoom out" onClick={() => zoomAt(0.8)} icon={<MagnifyingGlassMinusIcon size={16} weight="bold" aria-hidden />} />
          <ToolButton label="Whole sheet" onClick={() => setView(fullView)} icon={<ArrowsInIcon size={16} weight="bold" aria-hidden />} />
          <ToolButton label="Zoom in" onClick={() => zoomAt(1.25)} icon={<MagnifyingGlassPlusIcon size={16} weight="bold" aria-hidden />} />
          <button type="button" aria-pressed={several} aria-label="Select several" title="Select several: tap points in order. Shift, Ctrl or Cmd and a click do the same." onClick={() => setSeveral((v) => !v)} className={buttonClasses(several ? "primary" : "secondary", "sm", "size-11 !px-0")}>
            <SelectionPlusIcon size={16} weight="bold" aria-hidden />
          </button>
          {picked.length > 1 ? <span className="text-sm text-ink-2">{picked.length} picked, in order</span> : null}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-ink-3" aria-live="polite">
              {props.readOnly ? props.readOnly : saving ? "Saving…" : dirty ? "Unsaved changes" : `Version ${baseVersion}`}
            </span>
            {props.readOnly ? null : (
              <button type="button" onClick={() => save()} disabled={!dirty || saving} className={buttonClasses("primary", "sm")}>
                <FloppyDiskIcon size={16} weight="bold" aria-hidden />
                Save version
              </button>
            )}
          </div>
        </div>
        {message ? (
          <p role={message.tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 text-sm ${message.tone === "error" ? "text-failed" : "text-ink-2"}`}>
            {message.tone === "error" ? <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> : <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />}
            {message.text}
          </p>
        ) : null}
        <div className="relative">
        <div
          ref={svgWrap}
          tabIndex={0}
          role="application"
          data-plan-canvas="true"
          aria-label="Plan sheet. Drag to move around, scroll or pinch to zoom, drag a label to move it. Plus and minus zoom, 0 shows the whole sheet, arrow keys move."
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
          className="relative h-[62vh] min-h-[22rem] touch-none select-none overflow-hidden rounded-lg bg-canvas-2 ring-1 ring-line focus-visible:outline-2 focus-visible:outline-accent lg:h-[70vh]"
        >
          <SheetSvg page={page} viewBox={view} hidden={hidden} selected={selected} picked={picked} marks={markSet} draggable={canDrag} onEntityPointerDown={onEntityDown} label={`Plan sheet, ${plan.sheet.paper} ${shown.settings.orientation}, scale 1:${plan.sheet.scale ?? "not set"}${preview?.ok ? ", showing the assistant's change before it's applied" : ""}`} className="h-full w-full" />
          {preview?.ok ? <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink shadow-e1 ring-1 ring-line">Showing the change before it&apos;s applied</span> : null}
        </div>
        {props.assistantAiOff !== undefined ? <AssistantDock bridge={bridge} /> : null}
        </div>
        <p className="text-sm text-ink-3">
          {plan.sheet.scale ? `Scale 1:${fmt(plan.sheet.scale, 0)}${shown.settings.scale === null ? " (automatic)" : ""} on ${plan.sheet.paper} ${shown.settings.orientation}.` : "Set the lots to see the plan at scale."}{" "}
          {blocking.length > 0 ? `${blocking.length} ${blocking.length === 1 ? "check stops" : "checks stop"} export: see the Check step.` : "Labels move on paper only: no coordinate changes."}
        </p>
      </div>

      <div className="grid content-start gap-3">
        <div role="tablist" aria-label="Plan panels" className="inline-flex w-full rounded-full bg-canvas-2 p-1 ring-1 ring-line">
          {(["sheet", "codes", "layers", "selection"] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-11 flex-1 rounded-full px-3 text-sm font-medium transition-colors duration-150 ${tab === t ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}>
              {t === "sheet" ? "Sheet" : t === "codes" ? "Codes" : t === "layers" ? "Layers" : "Selected"}
            </button>
          ))}
        </div>

        {tab === "layers" ? (
          <ul className="grid gap-1 rounded-md bg-surface p-2 ring-1 ring-line">
            {/* The north point, scale bar, check line and title block always print, so they're never hidden here either. */}
            {LAYER_IDS.filter((l) => l !== "TITLE").map((l) => {
              const st = doc.layers[l] ?? { visible: true, locked: false };
              return (
                <li key={l} className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate px-2 text-sm text-ink">{LAYER_NAMES[l]}</span>
                  <button type="button" aria-pressed={st.visible} aria-label={`${st.visible ? "Hide" : "Show"} ${LAYER_NAMES[l]}`} disabled={Boolean(props.readOnly)} onClick={() => update((d) => void (d.layers[l] = { ...st, visible: !st.visible }))} className={buttonClasses("ghost", "sm", "size-11 px-0")}>
                    {st.visible ? <EyeIcon size={16} weight="bold" aria-hidden /> : <EyeSlashIcon size={16} weight="bold" aria-hidden />}
                  </button>
                  <button type="button" aria-pressed={st.locked} aria-label={`${st.locked ? "Unlock" : "Lock"} ${LAYER_NAMES[l]}`} disabled={Boolean(props.readOnly)} onClick={() => update((d) => void (d.layers[l] = { ...st, locked: !st.locked }))} className={buttonClasses("ghost", "sm", "size-11 px-0")}>
                    {st.locked ? <LockSimpleIcon size={16} weight="bold" aria-hidden /> : <LockSimpleOpenIcon size={16} weight="bold" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {tab === "selection" ? (
          <div className="rounded-md bg-surface p-4 ring-1 ring-line">
            {selection ? (
              <>
                <p className="font-medium text-ink">{selection.title}</p>
                <dl className="mt-3 grid gap-2 text-sm">
                  {selection.rows.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
                      <dt className="text-ink-3">{k}</dt>
                      <dd className="font-mono text-ink tabular break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
                {selection.note ? <p className="mt-3 text-sm text-ink-3">{selection.note}</p> : null}
                {selected && doc.labelOffsets[selected] && !props.readOnly ? (
                  <button type="button" onClick={() => update((d) => void delete d.labelOffsets[selected])} className={buttonClasses("secondary", "sm", "mt-3")}>
                    Put the label back
                  </button>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-ink-2">Tap a line, point or label on the sheet to see where its figures come from.</p>
            )}
          </div>
        ) : null}

        {tab === "sheet" ? <SheetFields doc={doc} update={update} readOnly={Boolean(props.readOnly)} surveyors={props.surveyors} suggested={plan.sheet.suggestedScale} paper={plan.sheet.paper} /> : null}
        {tab === "codes" ? <CodesPanel doc={doc} update={update} readOnly={Boolean(props.readOnly)} /> : null}
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, icon, disabled = false }: { label: string; onClick: () => void; icon: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={buttonClasses("secondary", "sm", "size-11 !px-0")}>
      {icon}
    </button>
  );
}
