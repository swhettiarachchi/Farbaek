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
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { formatDms, formatQuadrant, toDms } from "@/core/survey/angles";
import { BRIEF_LEGEND_EXAMPLES, LAYER_IDS, STANDARD_SCALES, type LayerId, type SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import { fmt, type SurveyorDetails } from "@/core/survey/sheet/compose";
import type { SceneItem } from "@/core/survey/sheet/scene";
import { fromSquareMetres, formatArp, toArp } from "@/core/survey/units";
import { buildPlan } from "@/core/survey/view";
import { saveSurveyDrawingAction } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses, textareaClasses } from "@/components/ui/field";
import { SheetSvg } from "./sheet-svg";

export interface SurveyorOption {
  userId: string;
  name: string;
  designation: string;
  registration: string;
  address: string;
  contact: string;
}

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
}

const LAYER_LABELS: Record<LayerId, string> = {
  BOUNDARY: "Boundary",
  POINTS: "Boundary points",
  POINT_NUMBERS: "Point numbers",
  DIMENSIONS: "Bearings and distances",
  LOT_TEXT: "Lot and extent",
  BOUNDARY_MARKS: "Boundary marks",
  BUILDINGS: "Buildings",
  WALLS: "Walls",
  FENCES: "Fences",
  DRAINS: "Drains",
  ROADS: "Roads",
  UTILITIES: "Utilities",
  TEXT: "Text",
  TITLE: "North point and scale",
};

type Tab = "sheet" | "layers" | "selection";
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
  const [message, setMessage] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  // An approved, unedited version shows the surveyor's details as they approved them, as the PDF does.
  const plan = useMemo(
    () => buildPlan({ points: props.points, document: doc, crsId: props.crsId, crsConfirmation: props.crsConfirmation, surveyor: !dirty && props.approval && props.approvedSurveyor ? props.approvedSurveyor : (props.surveyors.find((s) => s.userId === doc.surveyorUserId) ?? null), approval: dirty ? null : props.approval }),
    [doc, props.points, props.crsId, props.crsConfirmation, props.surveyors, props.approval, props.approvedSurveyor, dirty],
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

  const save = () => {
    if (props.readOnly || !dirty) return;
    const target = history.index;
    startSaving(async () => {
      const r = await saveSurveyDrawingAction({ projectId: props.projectId, baseVersion, document: doc });
      if (r.status === "done" && r.version) {
        setBaseVersion(r.version);
        setHistory((h) => ({ ...h, saved: target, coalesce: null }));
        setMessage({ tone: "done", text: r.message });
        router.refresh();
      } else if (r.status === "error") setMessage({ tone: "error", text: r.message });
    });
  };

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
    // A tap without movement selects what was tapped, or clears the selection.
    const entity = d.kind === "label" ? d.entity : d.entity;
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
    else if (e.key === "Escape") setSelected(null);
    else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = view[2] * 0.08;
      const [dx, dy] = e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : [0, step];
      setView([view[0] + dx, view[1] + dy, view[2], view[3]]);
    }
  };

  const hidden = useMemo(() => new Set(LAYER_IDS.filter((l) => l !== "TITLE" && doc.layers[l]?.visible === false)), [doc.layers]);
  const selection = describeSelection(selected, plan, props.points, doc);
  const blocking = plan.findings.filter((f) => f.severity === "error");

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 content-start gap-3 xl:sticky xl:top-4 xl:self-start">
        <div role="toolbar" aria-label="Plan tools" className="flex flex-wrap items-center gap-2">
          <ToolButton label="Undo" onClick={undo} disabled={history.index === 0} icon={<ArrowArcLeftIcon size={16} weight="bold" aria-hidden />} />
          <ToolButton label="Redo" onClick={redo} disabled={history.index >= history.stack.length - 1} icon={<ArrowArcRightIcon size={16} weight="bold" aria-hidden />} />
          <span className="mx-1 h-6 w-px bg-line" aria-hidden />
          <ToolButton label="Zoom out" onClick={() => zoomAt(0.8)} icon={<MagnifyingGlassMinusIcon size={16} weight="bold" aria-hidden />} />
          <ToolButton label="Whole sheet" onClick={() => setView(fullView)} icon={<ArrowsInIcon size={16} weight="bold" aria-hidden />} />
          <ToolButton label="Zoom in" onClick={() => zoomAt(1.25)} icon={<MagnifyingGlassPlusIcon size={16} weight="bold" aria-hidden />} />
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-ink-3" aria-live="polite">
              {props.readOnly ? props.readOnly : saving ? "Saving…" : dirty ? "Unsaved changes" : `Version ${baseVersion}`}
            </span>
            {props.readOnly ? null : (
              <button type="button" onClick={save} disabled={!dirty || saving} className={buttonClasses("primary", "sm")}>
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
        <div
          ref={svgWrap}
          tabIndex={0}
          role="application"
          aria-label="Plan sheet. Drag to move around, scroll or pinch to zoom, drag a label to move it. Plus and minus zoom, 0 shows the whole sheet, arrow keys move."
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
          className="relative h-[62vh] min-h-[22rem] touch-none select-none overflow-hidden rounded-lg bg-canvas-2 ring-1 ring-line focus-visible:outline-2 focus-visible:outline-accent lg:h-[70vh]"
        >
          <SheetSvg page={page} viewBox={view} hidden={hidden} selected={selected} draggable={canDrag} onEntityPointerDown={onEntityDown} label={`Plan sheet, ${doc.settings.paper} ${doc.settings.orientation}, scale 1:${plan.sheet.scale ?? "not set"}`} className="h-full w-full" />
        </div>
        <p className="text-sm text-ink-3">
          {plan.sheet.scale ? `Scale 1:${fmt(plan.sheet.scale, 0)}${doc.settings.scale === null ? " (suggested)" : ""} on ${doc.settings.paper} ${doc.settings.orientation}.` : "Choose the boundary to see the plan at scale."}{" "}
          {blocking.length > 0 ? `${blocking.length} ${blocking.length === 1 ? "check stops" : "checks stop"} export: see the Check step.` : "Labels move on paper only: no coordinate changes."}
        </p>
      </div>

      <div className="grid content-start gap-3">
        <div role="tablist" aria-label="Plan panels" className="inline-flex w-full rounded-full bg-canvas-2 p-1 ring-1 ring-line">
          {(["sheet", "layers", "selection"] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-11 flex-1 rounded-full px-3 text-sm font-medium transition-colors duration-150 ${tab === t ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}>
              {t === "sheet" ? "Sheet" : t === "layers" ? "Layers" : "Selected"}
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
                  <span className="min-w-0 flex-1 truncate px-2 text-sm text-ink">{LAYER_LABELS[l]}</span>
                  <button type="button" aria-pressed={st.visible} aria-label={`${st.visible ? "Hide" : "Show"} ${LAYER_LABELS[l]}`} disabled={Boolean(props.readOnly)} onClick={() => update((d) => void (d.layers[l] = { ...st, visible: !st.visible }))} className={buttonClasses("ghost", "sm", "size-11 px-0")}>
                    {st.visible ? <EyeIcon size={16} weight="bold" aria-hidden /> : <EyeSlashIcon size={16} weight="bold" aria-hidden />}
                  </button>
                  <button type="button" aria-pressed={st.locked} aria-label={`${st.locked ? "Unlock" : "Lock"} ${LAYER_LABELS[l]}`} disabled={Boolean(props.readOnly)} onClick={() => update((d) => void (d.layers[l] = { ...st, locked: !st.locked }))} className={buttonClasses("ghost", "sm", "size-11 px-0")}>
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

        {tab === "sheet" ? <SheetFields doc={doc} update={update} readOnly={Boolean(props.readOnly)} surveyors={props.surveyors} suggested={plan.sheet.suggestedScale} /> : null}
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, icon, disabled = false }: { label: string; onClick: () => void; icon: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={buttonClasses("secondary", "sm", "size-11 px-0")}>
      {icon}
    </button>
  );
}

function describeSelection(entity: string | null, plan: ReturnType<typeof buildPlan>, points: SurveyPoint[], doc: SurveyDocument): { title: string; rows: [string, string][]; note?: string } | null {
  if (!entity) return null;
  const p = plan.parcel;
  if (entity.startsWith("leg:") && p) {
    const leg = p.legs[Number(entity.slice(4))];
    if (!leg) return null;
    return {
      title: `Leg ${leg.from.pointId} to ${leg.to.pointId}`,
      rows: [
        ["Bearing", leg.bearing === null ? "None" : formatDms(toDms(leg.bearing, 1))],
        ["Quadrant", leg.bearing === null ? "None" : formatQuadrant(leg.bearing, 1)],
        ["Distance", `${fmt(leg.distance, 4)} m`],
      ],
      note: "Computed from the two points' coordinates. To change it, import corrected points.",
    };
  }
  if (entity.startsWith("pt:") || entity.startsWith("mark:")) {
    const id = entity.slice(entity.indexOf(":") + 1);
    const pt = points.find((x) => x.id === id);
    if (!pt) return null;
    return {
      title: `Point ${pt.pointId}`,
      rows: [
        ["Easting", `${fmt(pt.e, 4)} m`],
        ["Northing", `${fmt(pt.n, 4)} m`],
        ["Elevation", pt.z === null ? "None" : `${fmt(pt.z, 3)} m`],
        ["Code", pt.code ?? "None"],
      ],
      note: "Imported, so it can't be edited here. Its label can be moved.",
    };
  }
  if ((entity === "boundary" || entity.startsWith("lot")) && p) {
    return {
      title: doc.sheet.lot.trim() ? `Lot ${doc.sheet.lot.trim()}` : "The parcel",
      rows: [
        ["Extent", formatArp(toArp(p.areaM2, doc.settings.perchDecimals))],
        ["Hectares", fmt(fromSquareMetres(p.areaM2, "ha"), 6)],
        ["Square metres", fmt(p.areaM2, 3)],
        ["Perimeter", `${fmt(p.perimeterM, 3)} m`],
        ["Legs", String(p.legs.length)],
      ],
      note: "Grid area by the coordinate method.",
    };
  }
  if (entity.startsWith("feature:")) {
    const f = doc.features.find((x) => `feature:${x.id}` === entity);
    if (!f) return null;
    const names = f.points.map((id) => points.find((x) => x.id === id)?.pointId ?? "?");
    return { title: `${LAYER_LABELS[f.layer]} ${f.code}`.trim(), rows: [["Points", names.join(", ")], ["Shape", f.closed ? "Closed outline" : "Open line"]], note: "Change features on the Boundary step." };
  }
  return null;
}

function SheetFields({ doc, update, readOnly, surveyors, suggested }: { doc: SurveyDocument; update: (c: (d: SurveyDocument) => void, key?: string) => void; readOnly: boolean; surveyors: SurveyorOption[]; suggested: number | null }) {
  const text = (label: string, value: string, set: (d: SurveyDocument, v: string) => void, key: string, max: number, long = false) => (
    <label className="grid gap-1.5">
      <span className={LABEL_CLASSES}>{label}</span>
      {long ? (
        <textarea value={value} maxLength={max} rows={2} disabled={readOnly} onChange={(e) => update((d) => set(d, e.target.value), key)} className={textareaClasses()} />
      ) : (
        <input value={value} maxLength={max} disabled={readOnly} onChange={(e) => update((d) => set(d, e.target.value), key)} className={inputClasses()} />
      )}
    </label>
  );
  const s = doc.sheet;
  return (
    <div className="grid gap-5 rounded-md bg-surface p-4 ring-1 ring-line">
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium text-ink">Sheet</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Paper</span>
            <select value={doc.settings.paper} disabled={readOnly} onChange={(e) => update((d) => void (d.settings.paper = e.target.value as SurveyDocument["settings"]["paper"]))} className={inputClasses()}>
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="A2">A2</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Orientation</span>
            <select value={doc.settings.orientation} disabled={readOnly} onChange={(e) => update((d) => void (d.settings.orientation = e.target.value as SurveyDocument["settings"]["orientation"]))} className={inputClasses()}>
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
        </div>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Scale</span>
          <select value={doc.settings.scale ?? ""} disabled={readOnly} onChange={(e) => update((d) => void (d.settings.scale = e.target.value ? Number(e.target.value) : null))} className={inputClasses()}>
            <option value="">{suggested ? `Suggested, 1:${fmt(suggested, 0)}` : "Suggested"}</option>
            {STANDARD_SCALES.map((sc) => (
              <option key={sc} value={sc}>
                1:{fmt(sc, 0)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
          <input type="checkbox" checked={doc.settings.overleaf} disabled={readOnly} onChange={(e) => update((d) => void (d.settings.overleaf = e.target.checked))} className="size-5 accent-[var(--color-accent)]" />
          Overleaf schedule of coordinates and legs
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
          <input type="checkbox" checked={doc.settings.permitBox} disabled={readOnly} onChange={(e) => update((d) => void (d.settings.permitBox = e.target.checked))} className="size-5 accent-[var(--color-accent)]" />
          Development permit box (UDA areas)
        </label>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium text-ink">Plan</legend>
        {text("Plan number", s.planNumber, (d, v) => void (d.sheet.planNumber = v), "planNumber", 40)}
        <div className="grid grid-cols-2 gap-3">
          {text("Plan date", s.planDate, (d, v) => void (d.sheet.planDate = v), "planDate", 20)}
          {text("Survey date", s.surveyDate, (d, v) => void (d.sheet.surveyDate = v), "surveyDate", 20)}
        </div>
        {text("Lot", s.lot, (d, v) => void (d.sheet.lot = v), "lot", 40)}
        {text("Land called", s.landName, (d, v) => void (d.sheet.landName = v), "landName", 120)}
        {text("Village", s.village, (d, v) => void (d.sheet.village = v), "village", 60)}
        <div className="grid grid-cols-2 gap-3">
          {text("GN division", s.gnDivision, (d, v) => void (d.sheet.gnDivision = v), "gn", 60)}
          {text("DS division", s.dsDivision, (d, v) => void (d.sheet.dsDivision = v), "ds", 60)}
          {text("District", s.district, (d, v) => void (d.sheet.district = v), "district", 60)}
          {text("Province", s.province, (d, v) => void (d.sheet.province = v), "province", 60)}
        </div>
        {text("Previous plans", s.previousPlans, (d, v) => void (d.sheet.previousPlans = v), "previous", 400, true)}
        {text("Stated extent (from the deed or an earlier plan)", s.statedExtent, (d, v) => void (d.sheet.statedExtent = v), "stated", 80)}
        {text("Remarks", s.remarks, (d, v) => void (d.sheet.remarks = v), "remarks", 600, true)}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-ink">Boundaries</legend>
        <p className="text-sm text-ink-3">What adjoins each side, as you found it. Farbaek never fills these in.</p>
        {text("North by", s.boundaries.north, (d, v) => void (d.sheet.boundaries.north = v), "north", 160)}
        {text("East by", s.boundaries.east, (d, v) => void (d.sheet.boundaries.east = v), "east", 160)}
        {text("South by", s.boundaries.south, (d, v) => void (d.sheet.boundaries.south = v), "south", 160)}
        {text("West by", s.boundaries.west, (d, v) => void (d.sheet.boundaries.west = v), "west", 160)}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-ink">References</legend>
        <p className="text-sm text-ink-3">The starting codes come from examples, not an official list: keep the ones this plan uses.</p>
        <ul className="grid gap-2">
          {s.legend.map((e, i) => (
            <li key={i} className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-end gap-2">
              <label className="grid gap-1">
                <span className="sr-only">Code {i + 1}</span>
                <input value={e.code} maxLength={12} disabled={readOnly} onChange={(ev) => update((d) => void (d.sheet.legend[i]!.code = ev.target.value), `lc${i}`)} className={inputClasses("font-mono")} />
              </label>
              <label className="grid gap-1">
                <span className="sr-only">Meaning {i + 1}</span>
                <input value={e.meaning} maxLength={60} disabled={readOnly} onChange={(ev) => update((d) => void (d.sheet.legend[i]!.meaning = ev.target.value), `lm${i}`)} className={inputClasses()} />
              </label>
              <button type="button" aria-label={`Remove ${e.code || "this reference"}`} disabled={readOnly} onClick={() => update((d) => void d.sheet.legend.splice(i, 1))} className={buttonClasses("ghost", "sm", "size-11 px-0")}>
                <TrashIcon size={16} weight="bold" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={readOnly || s.legend.length >= 30} onClick={() => update((d) => void d.sheet.legend.push({ code: "X", meaning: "Describe it" }))} className={buttonClasses("secondary", "sm")}>
            <PlusIcon size={16} weight="bold" aria-hidden />
            Add a reference
          </button>
          <button type="button" disabled={readOnly} onClick={() => update((d) => void (d.sheet.legend = BRIEF_LEGEND_EXAMPLES.map((x) => ({ ...x }))))} className={buttonClasses("ghost", "sm")}>
            Start again from the examples
          </button>
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-ink">Surveyor</legend>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>The licensed surveyor responsible for this plan</span>
          <select value={doc.surveyorUserId ?? ""} disabled={readOnly} onChange={(e) => update((d) => void (d.surveyorUserId = e.target.value || null))} className={inputClasses()}>
            <option value="">Not chosen yet</option>
            {surveyors.map((sv) => (
              <option key={sv.userId} value={sv.userId}>
                {sv.name}
                {sv.registration ? ` (${sv.registration})` : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-ink-3">Surveyors enter their own details under Surveyor details. Only they can approve a plan they are named on.</p>
      </fieldset>
    </div>
  );
}
