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
import { CODE_KINDS, LINE_STYLES, commonCodes, type CodeKind, type LineStyle } from "@/core/survey/codes";
import { runsText, titleSentence } from "@/core/survey/description";
import { LAYER_IDS, STANDARD_SCALES, lotName, type LayerId, type SurveyDocument } from "@/core/survey/document";
import { roadWidth } from "@/core/survey/roads";
import { UDA_2020, reviewNote } from "@/core/survey/rules";
import type { SurveyPoint } from "@/core/survey/parcel";
import { fmt, type SurveyorDetails } from "@/core/survey/sheet/compose";
import type { SceneItem } from "@/core/survey/sheet/scene";
import { fromSquareMetres, formatArp, toArp } from "@/core/survey/units";
import { buildPlan } from "@/core/survey/view";
import { saveSurveyDrawingAction } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses, textareaClasses } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
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
  POINTS: "Corner points",
  POINT_NUMBERS: "Point numbers",
  DIMENSIONS: "Bearings and distances",
  LOT_TEXT: "Lot labels",
  BOUNDARY_MARKS: "Boundary marks",
  BUILDINGS: "Buildings",
  WALLS: "Walls",
  FENCES: "Fences",
  DRAINS: "Drains",
  ROADS: "Roads",
  UTILITIES: "Utilities",
  ADJOINING: "Adjoining lands",
  TEXT: "Text",
  TITLE: "North point and scale",
};

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
  const [message, setMessage] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  // An approved, unedited version shows the surveyor's details as they approved them, as the PDF does.
  const plan = useMemo(
    () => buildPlan({ points: props.points, document: doc, crsId: props.crsId, crsConfirmation: props.crsConfirmation, surveyor: !dirty && props.approval && props.approvedSurveyor ? props.approvedSurveyor : (props.surveyors.find((s) => s.userId === doc.surveyorUserId) ?? null), approval: dirty ? null : props.approval, version: dirty ? undefined : baseVersion }),
    [doc, props.points, props.crsId, props.crsConfirmation, props.surveyors, props.approval, props.approvedSurveyor, dirty, baseVersion],
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
          <SheetSvg page={page} viewBox={view} hidden={hidden} selected={selected} draggable={canDrag} onEntityPointerDown={onEntityDown} label={`Plan sheet, ${plan.sheet.paper} ${doc.settings.orientation}, scale 1:${plan.sheet.scale ?? "not set"}`} className="h-full w-full" />
        </div>
        <p className="text-sm text-ink-3">
          {plan.sheet.scale ? `Scale 1:${fmt(plan.sheet.scale, 0)}${doc.settings.scale === null ? " (automatic)" : ""} on ${plan.sheet.paper} ${doc.settings.orientation}.` : "Set the lots to see the plan at scale."}{" "}
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

        {tab === "sheet" ? <SheetFields doc={doc} update={update} readOnly={Boolean(props.readOnly)} surveyors={props.surveyors} suggested={plan.sheet.suggestedScale} paper={plan.sheet.paper} /> : null}
        {tab === "codes" ? <CodesPanel doc={doc} update={update} readOnly={Boolean(props.readOnly)} /> : null}
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
  if (entity.startsWith("leg:")) {
    const [, lotId, i] = entity.split(":");
    const leg = plan.lots.lots.find((r) => r.lot.id === lotId)?.parcel?.legs[Number(i)];
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
  if (entity.startsWith("lot:") || entity.startsWith("lot-extent:")) {
    const id = entity.slice(entity.indexOf(":") + 1);
    const r = plan.lots.lots.find((x) => x.lot.id === id);
    const p = r?.parcel;
    if (!r || !p) return null;
    return {
      title: `Lot ${lotName(r.lot)}`,
      rows: [
        ["Extent", formatArp(toArp(p.areaM2, doc.settings.perchDecimals))],
        ["Hectares", fmt(fromSquareMetres(p.areaM2, "ha"), 6)],
        ["Square metres", fmt(p.areaM2, 3)],
        ["Perimeter", `${fmt(p.perimeterM, 3)} m`],
        ["Corners", p.vertices.map((v) => v.pointId).join(", ")],
      ],
      note: "Grid area by the coordinate method. Change its corners on the Lots step.",
    };
  }
  if (entity.startsWith("road")) {
    const id = entity.slice(entity.indexOf(":") + 1);
    const road = doc.roads.find((x) => x.id === id);
    if (!road) return null;
    const a = road.edgeA.map((i) => points.find((x) => x.id === i)).filter((x): x is SurveyPoint => Boolean(x));
    const b = road.edgeB.map((i) => points.find((x) => x.id === i)).filter((x): x is SurveyPoint => Boolean(x));
    const w = roadWidth(a, b);
    return {
      title: road.name || "Road",
      rows: [
        ["Width", w ? `${fmt(w.minM, 3)} to ${fmt(w.maxM, 3)} m` : "Needs both edges"],
        ["Edges", `${a.map((p) => p.pointId).join(", ")} | ${b.map((p) => p.pointId).join(", ")}`],
      ],
      note: "The width is measured square across from each edge's points, never typed.",
    };
  }
  if (entity.startsWith("adjoining:")) {
    const a = doc.adjoining.find((x) => `adjoining:${x.id}` === entity);
    if (!a) return null;
    const lot = doc.lots.find((l) => l.id === a.lot);
    const num = (id: string) => points.find((x) => x.id === id)?.pointId ?? "?";
    return { title: "Adjoining land", rows: [["Text", a.text], ["Beside", lot ? `Lot ${lotName(lot)}, between ${num(a.from)} and ${num(a.to)}` : "No lot"]], note: "Change it on the Lots step." };
  }
  if (entity.startsWith("feature:")) {
    const f = doc.features.find((x) => `feature:${x.id}` === entity);
    if (!f) return null;
    const names = f.points.map((id) => points.find((x) => x.id === id)?.pointId ?? "?");
    return { title: `${LAYER_LABELS[f.layer]} ${f.code}`.trim(), rows: [["Points", names.join(", ")], ["Shape", f.closed ? "Closed outline" : "Open line"]], note: "Change features on the Lots step." };
  }
  return null;
}

type Update = (c: (d: SurveyDocument) => void, key?: string) => void;

/** Marks a field the AI filled as reviewed once the surveyor edits it: changing it is checking it. */
const touched = (d: SurveyDocument, key: string) => {
  const p = d.provenance[key];
  if (p) d.provenance[key] = { ...p, reviewed: true };
};

/** An AI-filled field waiting for the surveyor: they confirm it as it is, or change it (which counts as checking it). */
function CheckMark({ doc, field, update, readOnly }: { doc: SurveyDocument; field: string; update: Update; readOnly: boolean }) {
  const p = doc.provenance[field];
  if (!p || p.reviewed || p.source === "engine") return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StatusBadge status="approval" label={p.source === "ai_photo" ? "Read from a photo, check" : "From your description, check"} />
      <button type="button" disabled={readOnly} onClick={() => update((d) => touched(d, field))} className={buttonClasses("ghost", "sm")}>
        <CheckCircleIcon size={16} weight="bold" aria-hidden />
        Looks right
      </button>
    </span>
  );
}

function SheetFields({ doc, update, readOnly, surveyors, suggested, paper }: { doc: SurveyDocument; update: Update; readOnly: boolean; surveyors: SurveyorOption[]; suggested: number | null; paper: string }) {
  // The label names the input by id, so the "Looks right" button beside it stays outside the label.
  const field = (label: string, value: string, key: string, set: (d: SurveyDocument, v: string) => void, max: number, opts: { long?: boolean; hint?: string; type?: string } = {}) => {
    const id = `sheet-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    return (
      <div className="grid gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className={LABEL_CLASSES}>
            {label}
          </label>
          <CheckMark doc={doc} field={`sheet.${key}`} update={update} readOnly={readOnly} />
        </span>
        {opts.long ? (
          <textarea id={id} value={value} maxLength={max} rows={3} disabled={readOnly} onChange={(e) => update((d) => (set(d, e.target.value), touched(d, `sheet.${key}`)), key)} className={textareaClasses()} />
        ) : (
          <input id={id} type={opts.type ?? "text"} value={value} maxLength={max} disabled={readOnly} onChange={(e) => update((d) => (set(d, e.target.value), touched(d, `sheet.${key}`)), key)} className={inputClasses()} />
        )}
        {opts.hint ? <span className="text-sm text-ink-3">{opts.hint}</span> : null}
      </div>
    );
  };
  const check = (label: string, checked: boolean, set: (d: SurveyDocument, v: boolean) => void) => (
    <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
      <input type="checkbox" checked={checked} disabled={readOnly} onChange={(e) => update((d) => set(d, e.target.checked))} className="size-5 accent-[var(--color-accent)]" />
      {label}
    </label>
  );
  const s = doc.sheet;
  const st = doc.settings;
  const sentence = runsText(titleSentence(s, doc.lots, s.extractOf ? (doc.lots.find((l) => l.id === s.extractOf) ?? null) : null));
  return (
    <div className="grid gap-5 rounded-md bg-surface p-4 ring-1 ring-line">
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium text-ink">Sheet</legend>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Layout</span>
          <select value={st.template} disabled={readOnly} onChange={(e) => update((d) => void (d.settings.template = e.target.value as SurveyDocument["settings"]["template"]))} className={inputClasses()}>
            <option value="classic">Classic Sri Lankan plan</option>
            <option value="panel">Panel layout</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Paper</span>
            <select value={st.paper} disabled={readOnly} onChange={(e) => update((d) => void (d.settings.paper = e.target.value as SurveyDocument["settings"]["paper"]))} className={inputClasses()}>
              <option value="auto">Automatic ({paper})</option>
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="A2">A2</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Orientation</span>
            <select value={st.orientation} disabled={readOnly} onChange={(e) => update((d) => void (d.settings.orientation = e.target.value as SurveyDocument["settings"]["orientation"]))} className={inputClasses()}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
        </div>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Scale</span>
          <select value={st.scale ?? ""} disabled={readOnly} onChange={(e) => update((d) => void (d.settings.scale = e.target.value ? Number(e.target.value) : null))} className={inputClasses()}>
            <option value="">{suggested ? `Automatic, 1:${fmt(suggested, 0)}` : "Automatic"}</option>
            {STANDARD_SCALES.map((sc) => (
              <option key={sc} value={sc}>
                1:{fmt(sc, 0)}
              </option>
            ))}
          </select>
        </label>
        {check("Slanted lettering", st.slant, (d, v) => void (d.settings.slant = v))}
        {check("Bearings and distances on the face", st.faceDimensions, (d, v) => void (d.settings.faceDimensions = v))}
        {check("Boundaries schedule overleaf", st.overleaf, (d, v) => void (d.settings.overleaf = v))}
        {check("Development permit box (UDA areas, panel layout)", st.permitBox, (d, v) => void (d.settings.permitBox = v))}
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Extract of one lot</span>
          <select value={s.extractOf} disabled={readOnly || doc.lots.length < 2} onChange={(e) => update((d) => void (d.sheet.extractOf = e.target.value))} className={inputClasses()}>
            <option value="">No, the whole plan</option>
            {doc.lots.map((l) => (
              <option key={l.id} value={l.id}>
                Lot {lotName(l)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium text-ink">Planning minimums</legend>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Check the lots against</span>
          <select
            value={doc.rules?.id ?? ""}
            disabled={readOnly}
            onChange={(e) => {
              const v = e.target.value;
              update((d) => void (d.rules = v === "uda-2020" ? { id: "uda-2020" } : v === "own" ? { id: "own", areaM2: 0, frontageM: 0, depthM: 0, source: "" } : null));
            }}
            className={inputClasses()}
          >
            <option value="">No minimums</option>
            <option value="uda-2020">
              UDA regulations: {UDA_2020.minimums.areaM2} m², {UDA_2020.minimums.frontageM} m frontage, {UDA_2020.minimums.depthM} m depth
            </option>
            <option value="own">Minimums I enter, from a Development Plan or other rule</option>
          </select>
        </label>
        {doc.rules?.id === "own" ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <MinimumField label="Least area (m²)" value={doc.rules.areaM2} disabled={readOnly} onCommit={(v) => update((d) => void (d.rules?.id === "own" && (d.rules.areaM2 = v)))} />
              <MinimumField label="Frontage (m)" value={doc.rules.frontageM} disabled={readOnly} onCommit={(v) => update((d) => void (d.rules?.id === "own" && (d.rules.frontageM = v)))} />
              <MinimumField label="Depth (m)" value={doc.rules.depthM} disabled={readOnly} onCommit={(v) => update((d) => void (d.rules?.id === "own" && (d.rules.depthM = v)))} />
            </div>
            <label className="grid gap-1.5">
              <span className={LABEL_CLASSES}>Where they come from</span>
              <input value={doc.rules.source} maxLength={200} disabled={readOnly} placeholder="The Development Plan and zone, for example" onChange={(e) => update((d) => void (d.rules?.id === "own" && (d.rules.source = e.target.value)))} className={inputClasses()} />
            </label>
          </>
        ) : null}
        <p className="text-sm text-ink-3">
          {doc.rules?.id === "uda-2020" ? `For ${UDA_2020.appliesTo}. ${reviewNote(UDA_2020, new Date().toISOString().slice(0, 10)) ?? ""} ` : doc.rules?.id === "own" ? "Use 0 for a minimum that doesn't apply. " : ""}
          Lots whose note starts &ldquo;Res.&rdquo; aren&apos;t checked, and frontage runs along a road or a reserved access lot. What&apos;s short shows on the Check step as a warning.
        </p>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium text-ink">Title</legend>
        {field("Plan number", s.planNumber, "planNumber", (d, v) => void (d.sheet.planNumber = v), 40)}
        {field("Land called", s.landName, "landName", (d, v) => void (d.sheet.landName = v), 120)}
        <div className="grid grid-cols-2 gap-3">
          {field("Alias", s.alias, "alias", (d, v) => void (d.sheet.alias = v), 160, { hint: "Several joined by “and”." })}
          {field("Now called and known as", s.nowKnownAs, "nowKnownAs", (d, v) => void (d.sheet.nowKnownAs = v), 120)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <span className="flex flex-wrap items-center gap-2">
              <label htmlFor="sheet-operation" className={LABEL_CLASSES}>
                The survey
              </label>
              <CheckMark doc={doc} field="sheet.operation" update={update} readOnly={readOnly} />
            </span>
            <select id="sheet-operation" value={s.operation} disabled={readOnly} onChange={(e) => update((d) => (void (d.sheet.operation = e.target.value as SurveyDocument["sheet"]["operation"]), touched(d, "sheet.operation")))} className={inputClasses()}>
              <option value="resurvey">Resurvey of the existing boundaries</option>
              <option value="subdivision">Resurvey and sub division</option>
              <option value="amalgamation">Resurvey and amalgamation</option>
              <option value="custom">My own wording</option>
            </select>
          </div>
          {field(s.operation === "amalgamation" ? "Of lots" : "Of lot", s.parentLots, "parentLots", (d, v) => void (d.sheet.parentLots = v), 60)}
        </div>
        {s.operation === "custom" ? field("After “being”", s.customClause, "customClause", (d, v) => void (d.sheet.customClause = v), 800, { long: true }) : null}
        <div className="grid grid-cols-2 gap-3">
          {field("Depicted in Plan No.", s.previousPlan.number, "previousPlan.number", (d, v) => void (d.sheet.previousPlan.number = v), 40)}
          {field("Dated", s.previousPlan.date, "previousPlan.date", (d, v) => void (d.sheet.previousPlan.date = v), 20, { type: "date" })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {check("It's my own earlier plan (“my Plan No.”)", s.previousPlan.mine, (d, v) => (void (d.sheet.previousPlan.mine = v), touched(d, "sheet.previousPlan.mine")))}
          <CheckMark doc={doc} field="sheet.previousPlan.mine" update={update} readOnly={readOnly} />
        </div>
        {s.previousPlan.mine && !doc.provenance["sheet.previousPlan.by"] ? null : (
          <div className="grid grid-cols-2 gap-3">
            {field("Made by", s.previousPlan.by, "previousPlan.by", (d, v) => void (d.sheet.previousPlan.by = v), 80)}
            {field("Their designation", s.previousPlan.byDesignation, "previousPlan.byDesignation", (d, v) => void (d.sheet.previousPlan.byDesignation = v), 60)}
          </div>
        )}
        {field("Filed of record in (optional)", s.previousPlan.filing, "previousPlan.filing", (d, v) => void (d.sheet.previousPlan.filing = v), 160, { hint: "A court and case number, when the plan was filed." })}
        <div className="grid grid-cols-2 gap-3">
          {field("Village", s.village, "village", (d, v) => void (d.sheet.village = v), 60)}
          {field("Pattu", s.pattu, "pattu", (d, v) => void (d.sheet.pattu = v), 60, { hint: "As written, ending in “Pattu”." })}
          {field("Korale", s.korale, "korale", (d, v) => void (d.sheet.korale = v), 60, { hint: "As written, ending in “Korale”." })}
          {field("District", s.district, "district", (d, v) => void (d.sheet.district = v), 60)}
          {field("Province", s.province, "province", (d, v) => void (d.sheet.province = v), 60)}
          {field("GN division (optional)", s.gnDivision, "gnDivision", (d, v) => void (d.sheet.gnDivision = v), 60)}
        </div>
        <div className="rounded-sm bg-canvas-2 p-3 text-sm leading-relaxed text-ink-2 ring-1 ring-line">
          <span className="font-medium text-ink">PLAN</span> {sentence}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-ink">Bounded as follows</legend>
        <p className="text-sm text-ink-3">What adjoins each side of the entire land, as you found it. Farbaek never makes these up.</p>
        {field("North by", s.boundaries.north, "boundaries.north", (d, v) => void (d.sheet.boundaries.north = v), 200)}
        {field("East by", s.boundaries.east, "boundaries.east", (d, v) => void (d.sheet.boundaries.east = v), 200)}
        {field("South by", s.boundaries.south, "boundaries.south", (d, v) => void (d.sheet.boundaries.south = v), 200)}
        {field("West by", s.boundaries.west, "boundaries.west", (d, v) => void (d.sheet.boundaries.west = v), 200)}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-ink">Dates and statements</legend>
        <div className="grid grid-cols-2 gap-3">
          {field("Surveyed on", s.surveyDate, "surveyDate", (d, v) => void (d.sheet.surveyDate = v), 20, { type: "date" })}
          {field("Partitioned on", s.partitionDate, "partitionDate", (d, v) => void (d.sheet.partitionDate = v), 20, { type: "date" })}
          {field("Signed on", s.planDate, "planDate", (d, v) => void (d.sheet.planDate = v), 20, { type: "date" })}
        </div>
        {field("Statement", s.statement, "statement", (d, v) => void (d.sheet.statement = v), 200, { hint: "Printed bottom left, as surveyors write how the boundaries were found." })}
        {field("Stated extent (from the deed or an earlier plan)", s.statedExtent, "statedExtent", (d, v) => void (d.sheet.statedExtent = v), 80, { hint: "Kept apart from the computed extent, in the schedule overleaf." })}
        <div className="grid gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <label htmlFor="sheet-notes" className={LABEL_CLASSES}>
              Notes on the plan
            </label>
            <CheckMark doc={doc} field="notes" update={update} readOnly={readOnly} />
          </span>
          <textarea id="sheet-notes" value={doc.notes.join("\n")} rows={3} maxLength={3000} disabled={readOnly} onChange={(e) => update((d) => (void (d.notes = e.target.value.split("\n").map((x) => x.slice(0, 300)).filter((x, i, a) => x.trim() || i < a.length - 1).slice(0, 10)), touched(d, "notes")), "notes")} className={textareaClasses()} />
          <span className="text-sm text-ink-3">One per line, printed as “Note:- …” under the Reference.</span>
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

const KIND_LABELS: Record<CodeKind, string> = { mark: "Mark at a point", line: "Line through points", outline: "Closed outline", symbol: "Symbol" };
const STYLE_LABELS: Record<LineStyle, string> = { solid: "Solid", dashed: "Dashed", ticked: "Ticked" };

/** The code library: what each field code means and how it's drawn. */
function CodesPanel({ doc, update, readOnly }: { doc: SurveyDocument; update: Update; readOnly: boolean }) {
  const reviewed = doc.provenance["codes"]?.reviewed === true;
  return (
    <div className="grid gap-4 rounded-md bg-surface p-4 ring-1 ring-line">
      <p className="text-sm text-ink-2">Codes your instrument records with each point. The Reference on the plan lists only the codes it uses. The starting list is common Sri Lankan usage, not an official one.</p>
      <ul className="grid gap-3">
        {doc.codes.map((c, i) => (
          <li key={i} className="grid gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-end gap-2">
              <label className="grid gap-1">
                <span className="text-xs text-ink-3">Code</span>
                <input value={c.code} maxLength={12} disabled={readOnly} onChange={(e) => update((d) => void (d.codes[i]!.code = e.target.value), `cc${i}`)} className={inputClasses()} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-ink-3">Meaning</span>
                <input value={c.meaning} maxLength={60} disabled={readOnly} onChange={(e) => update((d) => void (d.codes[i]!.meaning = e.target.value), `cm${i}`)} className={inputClasses()} />
              </label>
              <button type="button" aria-label={`Remove ${c.code || "this code"}`} disabled={readOnly} onClick={() => update((d) => void d.codes.splice(i, 1))} className={buttonClasses("ghost", "sm", "size-11 px-0")}>
                <TrashIcon size={16} weight="bold" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-xs text-ink-3">Drawn as</span>
                <select value={c.kind} disabled={readOnly} onChange={(e) => update((d) => void (d.codes[i]!.kind = e.target.value as CodeKind))} className={inputClasses()}>
                  {CODE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-ink-3">Line</span>
                <select value={c.line} disabled={readOnly || c.kind === "mark" || c.kind === "symbol"} onChange={(e) => update((d) => void (d.codes[i]!.line = e.target.value as LineStyle))} className={inputClasses()}>
                  {LINE_STYLES.map((k) => (
                    <option key={k} value={k}>
                      {STYLE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input type="checkbox" checked={c.legend} disabled={readOnly} onChange={(e) => update((d) => void (d.codes[i]!.legend = e.target.checked))} className="size-5 accent-[var(--color-accent)]" />
              In the Reference when used
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={readOnly || doc.codes.length >= 80} onClick={() => update((d) => void d.codes.push({ code: "X", meaning: "Describe it", kind: "mark", line: "solid", legend: true }))} className={buttonClasses("secondary", "sm")}>
          <PlusIcon size={16} weight="bold" aria-hidden />
          Add a code
        </button>
        <button type="button" disabled={readOnly} onClick={() => update((d) => void (d.codes = commonCodes()))} className={buttonClasses("ghost", "sm")}>
          Reset to the common list
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        {reviewed ? (
          <StatusBadge status="done" label="Checked by you" />
        ) : (
          <button type="button" disabled={readOnly} onClick={() => update((d) => void (d.provenance["codes"] = { source: "engine", reviewed: true }))} className={buttonClasses("primary", "sm")}>
            <CheckCircleIcon size={16} weight="bold" aria-hidden />
            I&apos;ve checked these codes
          </button>
        )}
      </div>
    </div>
  );
}

/** A minimum typed as text and committed only while it reads as a number of zero or more, so a half-typed "1." isn't lost. */
function MinimumField({ label, value, disabled, onCommit }: { label: string; value: number; disabled: boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  // Undo or another change from outside: show the stored value again.
  if (value !== seen) {
    setSeen(value);
    if (Number(text) !== value) setText(String(value));
  }
  return (
    <label className="grid gap-1.5">
      <span className={LABEL_CLASSES}>{label}</span>
      <input
        value={text}
        inputMode="decimal"
        disabled={disabled}
        onChange={(e) => {
          const t = e.target.value.slice(0, 12);
          setText(t);
          const v = Number(t);
          if (t.trim() !== "" && Number.isFinite(v) && v >= 0) onCommit(v);
        }}
        className={inputClasses()}
      />
    </label>
  );
}
