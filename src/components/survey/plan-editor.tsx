"use client";

import {
  ArrowArcLeftIcon,
  ArrowArcRightIcon,
  ArrowsInIcon,
  ArrowsOutIcon,
  CornersInIcon,
  XIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  FloppyDiskIcon,
  LineSegmentsIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  SelectionPlusIcon,
  WarningCircleIcon,
} from "@/components/icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { unknownCodes } from "@/core/survey/codehints";
import { LAYER_IDS, type LayerId, type SurveyDocument } from "@/core/survey/document";
import { GRAMMAR } from "@/core/survey/grammar";
import type { SurveyPoint } from "@/core/survey/parcel";
import { fmt, type SurveyorDetails } from "@/core/survey/sheet/compose";
import { toPage, type SceneItem, type SceneText, type SheetPage } from "@/core/survey/sheet/scene";
import { refreshCorners } from "@/core/survey/construct";
import { buildPlan } from "@/core/survey/view";
import { LAYER_NAMES } from "@/core/survey/assistant/describe";
import { applyOps, revertPatch, type Applied, type Patch } from "@/core/survey/assistant/apply";
import type { PlanOp } from "@/core/survey/assistant/ops";
import type { StepId } from "@/core/survey/assistant/reader";
import { entityBounds, viewAround } from "@/core/survey/sheet/entities";
import { drawingView, pinchView, scaleIn, sheetPoint, type Box, type View } from "@/core/survey/sheet/view-math";
import { saveSurveyDrawingAction } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";
import { AssistantDock, type EditorBridge } from "./assistant/assistant-dock";
import { handoffKey } from "./assistant/handoff";
import { CodesPanel, SheetFields, describeSelection, type SurveyorOption } from "./plan-panels";
import { SheetSvg } from "./sheet-svg";
import { alignTo, type Guides } from "./align-guides";
import { setPlanUnsaved } from "./unsaved-plan";
import { DrawLineBar, SelectionEditor, cannotFinish, nextDrawing, type Drawing } from "./selection-editor";
import { AddDimension } from "./dimension-editor";
import { FindPoint } from "./point-editor";
import { remapRuns } from "@/core/survey/lotcurves";

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
  /** What the assistant's AI costs, in a sentence (ADR 0212). */
  assistantAiCost?: string | null;
}


type Tab = "sheet" | "codes" | "layers" | "selection";

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
  // The plan as it stands now, for the assistant's changes, which can arrive after the render that sent them.
  const docRef = useRef(doc);
  // Where the history stands, moved at once by the assistant's undo and redo, so "undo, undo" in one turn sees the first.
  const historyAt = useRef({ index: history.index, length: history.stack.length });
  const pageRef = useRef<SheetPage | null>(null);
  useLayoutEffect(() => {
    docRef.current = doc;
    historyAt.current = { index: history.index, length: history.stack.length };
  });
  const dirty = history.index !== history.saved;
  const [baseVersion, setBaseVersion] = useState(props.baseVersion);
  const [tab, setTab] = useState<Tab>("sheet");
  const [selected, setSelected] = useState<string | null>(null);
  // Items picked in order (shift, ctrl or cmd plus a tap, or "Select several" on phones), for "these points".
  const [picked, setPicked] = useState<string[]>([]);
  const [several, setSeveral] = useState(false);
  // Drawing a line (stage 253, ADR 0261): the surveyed points tapped, in order, and what the line is. Null when not drawing.
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  /** From the Selected tab, under the sheet on a phone, the bar it opens above the sheet is brought into view once it's there. */
  const revealDraw = useRef(false);
  const drawRef = useCallback((el: HTMLDivElement | null) => {
    if (!el || !revealDraw.current) return;
    revealDraw.current = false;
    el.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);
  const startDrawing = (reveal: boolean) => {
    setSeveral(false);
    setPicked([]);
    revealDraw.current = reveal;
    setDrawing({ points: [], layer: "WALLS", code: "MW", closed: false });
  };
  const [message, setMessage] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  // The assistant's change while it waits for Apply, shown on the sheet, and what the last turn changed, marked until the next.
  const [previewOps, setPreviewOps] = useState<PlanOp[] | null>(null);
  const [marks, setMarks] = useState<string[]>([]);
  const preview = useMemo(() => (previewOps ? applyOps(doc, previewOps, props.points) : null), [doc, previewOps, props.points]);
  // The codes on the points the library doesn't know, for the Codes tab's suggestions (ADR 0246): worked out only while it's open.
  const unknown = useMemo(() => (tab === "codes" ? unknownCodes(props.points, doc.codes, GRAMMAR[doc.grammar ?? "farbaek"]) : []), [tab, props.points, doc.codes, doc.grammar]);
  const shown = preview?.ok ? preview.doc : doc;
  // The line being drawn marks its points, so what's been tapped shows on the sheet.
  const markSet = useMemo(() => new Set(preview?.ok ? preview.touched : drawing ? drawing.points.map((id) => `pt:${id}`) : marks), [preview, marks, drawing]);

  // An approved, unedited version shows the surveyor's details as they approved them, as the PDF does.
  const plan = useMemo(
    () => buildPlan({ points: props.points, document: shown, crsId: props.crsId, crsConfirmation: props.crsConfirmation, surveyor: !dirty && props.approval && props.approvedSurveyor ? props.approvedSurveyor : (props.surveyors.find((s) => s.userId === doc.surveyorUserId) ?? null), approval: dirty ? null : props.approval, version: dirty ? undefined : baseVersion }),
    [shown, doc.surveyorUserId, props.points, props.crsId, props.crsConfirmation, props.surveyors, props.approval, props.approvedSurveyor, dirty, baseVersion],
  );
  // A plan over several sheets (ADR 0275) is edited one sheet at a time, each with its own part of the drawing and viewport.
  const fronts = useMemo(() => plan.sheet.pages.filter((p) => p.role === "front"), [plan]);
  const [sheetAt, setSheetAt] = useState(0);
  const sheetIndex = Math.min(sheetAt, Math.max(0, fronts.length - 1));
  const page = useMemo(() => fronts[sheetIndex] ?? plan.sheet.pages[0]!, [fronts, sheetIndex, plan]);

  // ---- Dragging a lot's corner or a line's point onto another surveyed point (stage 260, ADR 0268) -----------------------------------
  // The selected lot's or line's points have handles; one dragged snaps to the nearest surveyed point under it, and nothing else moves.
  const [vertexDrag, setVertexDrag] = useState<{ index: number; x: number; y: number; snap: { id: string; x: number; y: number } | null } | null>(null);
  const snapRef = useRef<{ id: string; x: number; y: number } | null>(null);
  // The guides a dragged word or label lines up on (stage 297), across and down the sheet; none while nothing is dragged.
  const [guides, setGuides] = useState<Guides | null>(null);
  // Worked out on its own, not read off `page`, which the pointer handlers keep in a ref.
  const viewport = useMemo(() => plan.sheet.pages.filter((p) => p.role === "front")[sheetIndex]?.viewport ?? plan.sheet.viewport, [plan, sheetIndex]);
  const vertexOwner = useMemo(() => {
    if (!selected || props.readOnly || drawing) return null;
    const id = selected.slice(selected.indexOf(":") + 1);
    if (selected.startsWith("lot:")) {
      const l = doc.lots.find((x) => x.id === id);
      return l && !doc.layers.BOUNDARY?.locked ? { owner: "lot" as const, id, points: l.points } : null;
    }
    if (selected.startsWith("feature:")) {
      const f = doc.features.find((x) => x.id === id);
      return f && !doc.layers[f.layer]?.locked ? { owner: "feature" as const, id, points: f.points } : null;
    }
    return null;
  }, [selected, props.readOnly, drawing, doc.lots, doc.features, doc.layers]);
  const pointsById = useMemo(() => new Map(props.points.map((p) => [p.id, p])), [props.points]);
  const handles = useMemo(() => {
    if (!vertexOwner || !viewport) return [];
    const out: { key: string; x: number; y: number; active?: boolean }[] = [];
    vertexOwner.points.forEach((pid, i) => {
      const p = pointsById.get(pid);
      if (!p) return;
      const [x, y] = toPage(viewport, p.e, p.n);
      out.push(vertexDrag?.index === i ? { key: `${vertexOwner.owner}:${vertexOwner.id}:${i}`, x: vertexDrag.x, y: vertexDrag.y, active: true } : { key: `${vertexOwner.owner}:${vertexOwner.id}:${i}`, x, y });
    });
    if (vertexDrag?.snap) out.push({ key: "snap", x: vertexDrag.snap.x, y: vertexDrag.snap.y, active: true });
    return out;
  }, [vertexOwner, viewport, pointsById, vertexDrag]);
  useLayoutEffect(() => {
    pageRef.current = page;
  });
  const fullView: View = [0, 0, page.widthMm, page.heightMm];
  const [view, setView] = useState<View>(fullView);
  // A phone or a narrow tablet: the whole sheet's text is too small to read there, so the sheet opens on the drawing (stage 196).
  const [narrow, setNarrow] = useState(false);
  const viewKey = `${page.widthMm}x${page.heightMm}`;
  const [lastKey, setLastKey] = useState(viewKey);
  if (lastKey !== viewKey) {
    // The sheet changed size (paper or orientation): show the new sheet the way it opens.
    setLastKey(viewKey);
    setView(narrow ? drawingView(page) : [0, 0, page.widthMm, page.heightMm]);
  }
  // Drawing full screen on a phone: the sheet and its tools only, the page and the tab bar out of the way.
  const [full, setFull] = useState(false);

  /** Applies an edit. Edits with the same key within 1.5 s (typing in one field) become one undo step. */
  const update = useCallback(
    (change: (d: SurveyDocument) => void, key?: string) => {
      if (props.readOnly) return;
      setHistory((h) => {
        let next = clone(h.stack[h.index]!);
        change(next);
        // A line's points changed (dragged, typed, closed or opened): its constructed corners are worked out again between their new
        // neighbours, or taken out, and ones no line uses go (ADR 0270).
        if (next.constructed) next = refreshCorners(next, props.points).plan;
        const now = Date.now();
        const merge = key && h.coalesce && h.coalesce.key === key && now - h.coalesce.at < 1500 && h.index > h.saved;
        const base = h.stack.slice(0, merge ? h.index : h.index + 1);
        const stack = [...base, next];
        return { stack, index: stack.length - 1, saved: h.saved > stack.length - 1 ? -1 : h.saved, coalesce: key ? { key, at: now } : null };
      });
      setMessage(null);
    },
    [props.readOnly, props.points],
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

  // One-press answers elsewhere on the page wait while the plan has unsaved edits, so saving them never throws the edits away.
  useEffect(() => {
    setPlanUnsaved(dirty && !props.readOnly);
    return () => setPlanUnsaved(false);
  }, [dirty, props.readOnly]);

  // Leaving with unsaved edits asks first: closing the page, and following a link in the app (a step, the tab bar, the sidebar).
  useEffect(() => {
    if (!dirty || props.readOnly) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const leave = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, window.location.href);
      if (to.origin !== window.location.origin || (to.pathname === window.location.pathname && to.search === window.location.search)) return;
      if (!window.confirm("The plan has changes that aren't saved. Leave without saving them?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave, true);
    };
  }, [dirty, props.readOnly]);

  // Full screen holds the page still behind it, and Esc leaves it.
  useEffect(() => {
    if (!full) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", esc);
    return () => {
      root.style.overflow = before;
      window.removeEventListener("keydown", esc);
    };
  }, [full]);

  // ---- Pan, zoom and dragging -------------------------------------------------
  const svgWrap = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | { kind: "pan"; startX: number; startY: number; view: View; moved: boolean; entity: string | null }
    | { kind: "label"; entity: string; startX: number; startY: number; base: { dx: number; dy: number }; slot: number | undefined; moved: boolean; x0: number; y0: number }
    | { kind: "vertex"; owner: "lot" | "feature"; id: string; index: number; startX: number; startY: number; moved: boolean }
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
  const pinch = useRef<{ from: [[number, number], [number, number]]; view: View } | null>(null);

  /** The sheet's box on the screen. */
  const boxOf = useCallback((): Box => {
    const r = svgWrap.current?.getBoundingClientRect();
    return r ? { left: r.left, top: r.top, width: r.width || 1, height: r.height || 1 } : { left: 0, top: 0, width: 1, height: 1 };
  }, []);
  /** Screen pixels per sheet millimetre at the current view. */
  const pxPerMm = useCallback(() => scaleIn(view, boxOf()), [view, boxOf]);

  // How wide the editor is, and on first sight on a narrow one, the drawing rather than the whole sheet.
  const opened = useRef(false);
  useEffect(() => {
    const el = svgWrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      if (w <= 0) return;
      setNarrow(w < 640);
      if (!opened.current) {
        opened.current = true;
        if (w < 640 && pageRef.current) setView(drawingView(pageRef.current));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  const toSheet = useCallback((clientX: number, clientY: number): [number, number] => sheetPoint(view, boxOf(), clientX, clientY), [view, boxOf]);

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

  // Stable while the layers and the right to edit stay the same, so the memoised drawing keeps its move cursors without redrawing.
  const layers = doc.layers;
  const canDrag = useCallback(
    // The title block's words (plan number, surveyor, title, notes) are laid out by the sheet, which never applies a dragged offset to
    // them: offered for dragging, they showed a move cursor and didn't move. They're tapped to select and edited in the Sheet panel.
    (item: SceneItem) => !props.readOnly && item.kind === "text" && Boolean(item.entity) && item.layer !== "SHEET" && item.layer !== "TITLE" && !layers[item.layer as LayerId]?.locked && item.entity !== "north" && item.entity !== "scalebar" && item.entity !== "checkline",
    [props.readOnly, layers],
  );

  /**
   * Every pointer starts here, on the sheet or on something drawn on it, so a second finger always pinches, wherever it lands
   * (stage 196). A label moves under a mouse at once; under a finger only once it's selected, so a finger on a label pans the sheet.
   */
  const begin = (e: ReactPointerEvent<Element>, item: SceneItem | null) => {
    capture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { from: [[a!.x, a!.y], [b!.x, b!.y]], view };
      drag.current = null;
      return;
    }
    if (!drawing && item?.entity && canDrag(item) && (e.pointerType === "mouse" || selected === item.entity)) {
      const base = doc.labelOffsets[item.entity] ?? { dx: 0, dy: 0 };
      // The place the label is drawn at (ADR 0242): the offset is measured from it, so the label stays where it's dropped.
      const slot = base.slot ?? (item.kind === "text" ? item.slot : undefined);
      // Where it's drawn as the drag starts, on the sheet: what lines up with the other words is measured from here (stage 297).
      const [x0, y0] = item.kind === "text" ? [item.x, item.y] : [0, 0];
      drag.current = { kind: "label", entity: item.entity, startX: e.clientX, startY: e.clientY, base, slot, moved: false, x0, y0 };
    } else {
      drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, view, moved: false, entity: item?.entity ?? null };
    }
  };
  const onEntityDown = (item: SceneItem, e: ReactPointerEvent<SVGElement>) => {
    if (!item.entity || e.button !== 0) return;
    // Taken here, so the sheet doesn't take it again.
    e.stopPropagation();
    begin(e, item);
  };
  // The drawing is memoised (SheetSvg), so it gets one handler for good, which calls the newest.
  const entityDown = useRef(onEntityDown);
  useLayoutEffect(() => {
    entityDown.current = onEntityDown;
  });
  const onEntityPointerDown = useCallback((item: SceneItem, e: ReactPointerEvent<SVGElement>) => entityDown.current(item, e), []);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => begin(e, null);
  const onHandleDown = (key: string, e: ReactPointerEvent<SVGElement>) => {
    if (e.button !== 0 || !vertexOwner) return;
    // Taken here, so the sheet doesn't take it again.
    e.stopPropagation();
    const index = Number(key.slice(key.lastIndexOf(":") + 1));
    const h = handles.find((x) => x.key === key);
    if (!Number.isInteger(index) || !h) return;
    capture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = { kind: "vertex", owner: vertexOwner.owner, id: vertexOwner.id, index, startX: e.clientX, startY: e.clientY, moved: false };
    snapRef.current = null;
    setVertexDrag({ index, x: h.x, y: h.y, snap: null });
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setView(pinchView(pinch.current.view, boxOf(), pinch.current.from, [[a!.x, a!.y], [b!.x, b!.y]], { minWidth: 8, maxWidth: page.widthMm * 1.2 }));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const k = pxPerMm();
    const dx = (e.clientX - d.startX) / k;
    const dy = (e.clientY - d.startY) / k;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 3) d.moved = true;
    if (d.kind === "vertex") {
      if (!d.moved || !viewport) return;
      // The surveyed point nearest the finger or the cursor, within 16 screen pixels: where the corner would go.
      const [x, y] = toSheet(e.clientX, e.clientY);
      const reach = 16 / pxPerMm();
      let snap: { id: string; x: number; y: number } | null = null;
      let best = reach;
      for (const p of props.points) {
        const [px, py] = toPage(viewport, p.e, p.n);
        const dd = Math.hypot(px - x, py - y);
        if (dd <= best) [best, snap] = [dd, { id: p.id, x: px, y: py }];
      }
      snapRef.current = snap;
      setVertexDrag({ index: d.index, x, y, snap });
    } else if (d.kind === "pan") {
      if (d.moved) setView([d.view[0] - dx, d.view[1] - dy, d.view[2], d.view[3]]);
    } else if (d.moved) {
      // Lined up with another word or label on the page when it comes within 6 screen pixels of one, across or down, with a guide where
      // (stage 297). Only where it's drawn changes, never anything measured.
      const others = page.items.flatMap((it) => (it.kind === "text" && it.entity && it.entity !== d.entity ? [{ x: it.x, y: it.y }] : []));
      const lined = alignTo({ x: d.x0 + dx, y: d.y0 + dy }, others, 6 / k);
      setGuides(lined.guides.x === null && lined.guides.y === null ? null : lined.guides);
      const [ax, ay] = [lined.x - d.x0, lined.y - d.y0];
      const next = { dx: Math.max(-200, Math.min(200, d.base.dx + ax)), dy: Math.max(-200, Math.min(200, d.base.dy + ay)), ...(d.slot !== undefined ? { slot: d.slot } : {}) };
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
    setGuides(null);
    if (d?.kind === "vertex") {
      setVertexDrag(null);
      if (d.moved) dropVertex(d, snapRef.current);
      snapRef.current = null;
      return;
    }
    if (!d || d.moved) return;
    // A tap without movement selects what was tapped, or clears the selection. With shift, ctrl or cmd, or "Select several", it adds
    // the item to the picked ones, in order, or takes it out again.
    const entity = d.kind === "label" ? d.entity : d.entity;
    // Drawing a line: a tapped point (its mark, number or corner) is the line's next point; anything else is left alone.
    if (drawing) {
      const point = entity && /^(pt|mark|corner):/.test(entity) ? entity.slice(entity.indexOf(":") + 1) : null;
      if (point && props.points.some((p) => p.id === point)) setDrawing((x) => (x ? nextDrawing(x, point) : x));
      return;
    }
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
      if (drawing) setDrawing(null);
      else {
        setSelected(null);
        setPicked([]);
      }
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
  // An assistant's nudge is measured from the place the label is drawn at now, as a drag is (ADR 0242).
  const slotOf = (entity: string) => page.items.find((i): i is SceneText => i.kind === "text" && i.entity === entity && i.slot !== undefined)?.slot;
  function withSlots<T extends PlanOp[] | null>(ops: T): T {
    return (ops ? ops.map((op) => (op.kind === "label" && op.slot === undefined ? { ...op, slot: slotOf(op.entity) } : op)) : ops) as T;
  }
  const bridge: EditorBridge = {
    projectId: props.projectId,
    doc,
    points: props.points,
    plan,
    selection: picked.length ? picked : selected ? [selected] : [],
    readOnly: props.readOnly,
    aiOff: props.assistantAiOff ?? null,
    aiCost: props.assistantAiCost ?? null,
    approved: Boolean(props.approval),
    dirty,
    setPreview: (ops) => setPreviewOps(withSlots(ops)),
    apply: (ops): Applied => {
      if (props.readOnly) return { ok: false, error: props.readOnly };
      const r = applyOps(docRef.current, withSlots(ops), props.points);
      if (r.ok) {
        docRef.current = r.doc;
        pushDocument(r.doc);
        setMessage(null);
      }
      return r;
    },
    revert: (patch: Patch) => {
      if (props.readOnly) return { ok: false, changedSince: [] };
      const r = revertPatch(docRef.current, patch);
      if (r.ok) {
        docRef.current = r.doc;
        pushDocument(r.doc);
      }
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
    // Whether there was a step to take: the assistant says so either way.
    history: (action) => {
      const h = historyAt.current;
      const can = action === "undo" ? h.index > 0 : h.index < h.length - 1;
      if (can) {
        historyAt.current = { ...h, index: h.index + (action === "undo" ? -1 : 1) };
        (action === "undo" ? undo : redo)();
      }
      return can;
    },
    setMarks,
    save: () => save(),
    openDivide: (op) => handOver({ kind: "divide", op }, "boundary"),
    openEntry: (op) => handOver({ kind: "entry", op }, "import"),
    goto: go,
  };

  /** A corner or a line's point dropped: onto a surveyed point it becomes that point; anywhere else, nothing changes, and that's said. */
  const dropVertex = (d: { owner: "lot" | "feature"; id: string; index: number }, snap: { id: string } | null) => {
    const list = d.owner === "lot" ? doc.lots.find((l) => l.id === d.id)?.points : doc.features.find((f) => f.id === d.id)?.points;
    if (!list) return;
    const from = list[d.index]!;
    const name = (id: string) => pointsById.get(id)?.pointId ?? "?";
    const what = d.owner === "lot" ? "Corner" : "Point";
    if (!snap) return setMessage({ tone: "error", text: `${what} ${name(from)} wasn't moved: drop it on a surveyed point.` });
    if (snap.id === from) return;
    const n = list.length;
    const closed = d.owner === "lot" || doc.features.find((f) => f.id === d.id)?.closed === true;
    // The surveyed points on either side, looking past constructed corners (ADR 0270), which stand between the two.
    const corners = new Set((doc.constructed ?? []).map((c) => c.id));
    const nearest = (step: 1 | -1) => {
      for (let k = 1; k < n; k++) {
        const j = d.index + step * k;
        if (!closed && (j < 0 || j >= n)) return undefined;
        const pid = list[((j % n) + n) % n]!;
        if (!corners.has(pid)) return pid;
      }
      return undefined;
    };
    if ([nearest(1), nearest(-1)].includes(snap.id)) return setMessage({ tone: "error", text: `${name(snap.id)} is already next to it: nothing was changed.` });
    const change = (doc2: SurveyDocument) => {
      if (d.owner === "lot") {
        const lot = doc2.lots.find((l) => l.id === d.id)!;
        // A curve through the old corner was drawn through it (ADR 0276): it's taken off, as a line's curves are, and drawn straight.
        const moved = [...lot.points];
        moved[d.index] = snap.id;
        const curves = remapRuns(lot.points, moved, lot.arcs);
        if (curves.runs.length > 0) lot.arcs = curves.runs;
        else delete lot.arcs;
        lot.points[d.index] = snap.id;
        // Words beside a side through the old corner stay beside the same side, now through the new one.
        for (const a of doc2.adjoining) if (a.lot === d.id) [a.from, a.to] = [a.from === from ? snap.id : a.from, a.to === from ? snap.id : a.to];
      } else {
        const f = doc2.features.find((x) => x.id === d.id)!;
        f.points[d.index] = snap.id;
        // Curves were drawn through the old points.
        delete f.arcs;
      }
      const key = `${d.owner}:${d.id}`;
      if (doc2.provenance[key]) doc2.provenance[key] = { ...doc2.provenance[key]!, reviewed: true };
    };
    update(change);
    // A square corner beside the point is worked out again from its new neighbour, or taken out when nothing squares it: said.
    const tried = clone(doc);
    change(tried);
    const gone = tried.constructed ? refreshCorners(tried, props.points).removed : [];
    const cornerNote = gone.length > 0 ? ` The square corner beside it was taken out: nothing squares it there now.` : "";
    setMessage({ tone: "done", text: `${what} ${name(from)} is now ${name(snap.id)}${d.owner === "lot" ? ": the area, the legs and the checks are worked out again" : ""}.${cornerNote}` });
  };

  const panelsRef = useRef<HTMLDivElement>(null);
  /** From the selection card to its details, under the sheet (leaving full screen first). */
  const showDetails = () => {
    setFull(false);
    setTab("selection");
    window.requestAnimationFrame(() => panelsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };
  const status = props.readOnly ? null : saving ? "Saving…" : dirty ? "Unsaved changes" : `Version ${baseVersion}`;

  const toolbar = (
    // Sticky under the phone's header, so Save and whether the plan is saved stay in reach while the panels below are edited.
    <div
      role="toolbar"
      aria-label="Plan tools"
      className={`z-20 flex flex-wrap items-center gap-2 ${full ? "" : "sticky top-14 -mx-4 bg-canvas/90 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:rounded-full lg:px-0"}`}
    >
      <ToolButton label="Undo" onClick={undo} disabled={history.index === 0} icon={<ArrowArcLeftIcon size={16} weight="bold" aria-hidden />} />
      <ToolButton label="Redo" onClick={redo} disabled={history.index >= history.stack.length - 1} icon={<ArrowArcRightIcon size={16} weight="bold" aria-hidden />} />
      <span className="mx-0.5 h-6 w-px bg-line sm:mx-1" aria-hidden />
      {/* Fingers pinch to zoom, so on a touch screen the zoom buttons step aside for the rest. */}
      <span className="contents pointer-coarse:hidden">
        <ToolButton label="Zoom out" onClick={() => zoomAt(0.8)} icon={<MagnifyingGlassMinusIcon size={16} weight="bold" aria-hidden />} />
        <ToolButton label="Zoom in" onClick={() => zoomAt(1.25)} icon={<MagnifyingGlassPlusIcon size={16} weight="bold" aria-hidden />} />
      </span>
      <ToolButton label="Whole sheet" onClick={() => setView(fullView)} icon={<ArrowsInIcon size={16} weight="bold" aria-hidden />} />
      <button type="button" aria-pressed={several} aria-label="Select several" title="Select several: tap points in order. Shift, Ctrl or Cmd and a click do the same." onClick={() => setSeveral((v) => !v)} className={buttonClasses(several ? "primary" : "secondary", "icon")}>
        <SelectionPlusIcon size={16} weight="bold" aria-hidden />
      </button>
      {/* A phone's toolbar has no room for it: there, "Draw a line" is on the Selected tab. */}
      {props.readOnly ? null : (
        <span className="contents max-sm:hidden">
          <button type="button" aria-pressed={drawing !== null} aria-label="Draw a line" title="Draw a line: tap surveyed points in order, then Finish." onClick={() => (drawing ? setDrawing(null) : startDrawing(false))} className={buttonClasses(drawing ? "primary" : "secondary", "icon")}>
            <LineSegmentsIcon size={16} weight="bold" aria-hidden />
          </button>
        </span>
      )}
      <span className="contents lg:hidden">
        <ToolButton label={full ? "Leave full screen" : "Draw full screen"} onClick={() => setFull((f) => !f)} icon={full ? <CornersInIcon size={16} weight="bold" aria-hidden /> : <ArrowsOutIcon size={16} weight="bold" aria-hidden />} />
      </span>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {props.readOnly ? (
          // The whole reason for a screen reader and a wider screen; on a phone, the short of it.
          <span className="min-w-0 truncate text-label text-ink-3" title={props.readOnly}>
            <span aria-hidden className="sm:hidden">
              Not saved here
            </span>
            <span className="max-sm:sr-only">{props.readOnly}</span>
          </span>
        ) : (
          <>
            <span className="min-w-0 truncate text-label text-ink-3 max-[25em]:sr-only" aria-live="polite">
              {status}
            </span>
            <button type="button" onClick={() => save()} disabled={!dirty || saving} aria-label="Save version" className={buttonClasses("primary", "sm", "shrink-0")}>
              <FloppyDiskIcon size={16} weight="bold" aria-hidden />
              <span aria-hidden className="sm:hidden">
                Save
              </span>
              <span aria-hidden className="max-sm:hidden">
                Save version
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );

  const canvas = (
    <div className={full ? "relative min-h-0 flex-1" : "relative"}>
      <div
        ref={svgWrap}
        tabIndex={0}
        role="application"
        data-plan-canvas="true"
        aria-label="Plan sheet. Drag to move around, scroll or pinch to zoom, drag a label to move it (on a touch screen, tap it first). Plus and minus zoom, 0 shows the whole sheet, arrow keys move."
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className={`relative touch-none select-none overflow-hidden rounded-lg bg-canvas-2 ring-1 ring-line focus-visible:outline-2 focus-visible:outline-accent ${full ? "h-full" : "h-[min(58svh,34rem)] min-h-[15rem] lg:h-[70svh]"}`}
      >
        <SheetSvg page={page} viewBox={view} hidden={hidden} selected={selected} picked={picked} marks={markSet} draggable={canDrag} onEntityPointerDown={onEntityPointerDown} handles={handles} onHandlePointerDown={onHandleDown} guides={guides} hitTargets label={`Plan sheet${page.sheet ? ` ${page.sheet.n} of ${page.sheet.of}` : ""}, ${plan.sheet.paper} ${shown.settings.orientation}, scale 1:${plan.sheet.scale ?? "not set"}${preview?.ok ? ", showing the assistant's change before it's applied" : ""}`} className="h-full w-full" />
        {/* Which sheet of several is shown (ADR 0275): one press for each. */}
        {fronts.length > 1 ? (
          <div role="group" aria-label="Sheets" className="absolute bottom-2 right-2 flex max-w-[calc(100%-1rem)] flex-wrap justify-end gap-1.5 sm:bottom-3 sm:right-3">
            {fronts.map((p, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={i === sheetIndex}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setSheetAt(i)}
                className={`tap inline-flex min-h-10 items-center rounded-full border px-3.5 text-label font-medium shadow-e1 transition-colors duration-150 ${i === sheetIndex ? "border-accent bg-surface text-ink ring-1 ring-accent" : "border-line bg-surface/95 text-ink-2 hover:border-accent/60 hover:text-ink"}`}
              >
                Sheet {p.sheet?.n ?? i + 1}
              </button>
            ))}
          </div>
        ) : null}
        {/* One place over the sheet for what it says about itself: the change being looked at, or on a narrow screen what was tapped. */}
        <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-col items-start gap-2 sm:inset-x-3 sm:top-3">
          {preview?.ok ? <span className="rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink shadow-e1 ring-1 ring-line">Showing the change before it&apos;s applied</span> : null}
          {narrow && selection && !preview?.ok ? (
            <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-md bg-surface/95 py-1.5 pl-3 pr-1.5 shadow-e2 ring-1 ring-line">
              <span className="min-w-0">
                <span className="block truncate text-label font-medium text-ink">{selection.title}</span>
                {selection.rows[0] ? (
                  <span className="block truncate text-xs text-ink-3">
                    {selection.rows[0][0]}: <span className="font-mono tabular text-ink-2">{selection.rows[0][1]}</span>
                  </span>
                ) : null}
              </span>
              <button type="button" onClick={showDetails} className={buttonClasses("secondary", "sm", "shrink-0 px-3")}>
                Details
              </button>
              <button type="button" aria-label="Clear the selection" onClick={() => (setSelected(null), setPicked([]))} className={buttonClasses("ghost", "icon", "shrink-0")}>
                <XIcon size={14} weight="bold" aria-hidden />
              </button>
            </div>
          ) : null}
          {several ? <span className="rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink shadow-e1 ring-1 ring-line">{picked.length > 1 ? `${picked.length} picked, in order. Tap again to take one out.` : "Tap points in order to pick them."}</span> : null}
        </div>
      </div>
      {props.assistantAiOff !== undefined ? <AssistantDock bridge={bridge} /> : null}
    </div>
  );

  const panels = (
    <div ref={panelsRef} className="@container grid scroll-mt-28 content-start gap-3 lg:scroll-mt-16">
      <div role="tablist" aria-label="Plan panels" className="inline-flex w-full rounded-full bg-canvas-2 p-1 ring-1 ring-line">
        {(["sheet", "codes", "layers", "selection"] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`tap min-h-10 flex-1 rounded-full px-2 text-label font-medium transition-colors duration-150 sm:px-3 sm:text-sm ${tab === t ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}>
            {t === "sheet" ? "Sheet" : t === "codes" ? "Codes" : t === "layers" ? "Layers" : "Selected"}
          </button>
        ))}
      </div>

      {tab === "layers" ? (
        <ul className="grid gap-x-2 gap-y-0.5 rounded-md bg-surface p-1.5 ring-1 ring-line @sm:grid-cols-2">
          {/* The north point, scale bar, check line and title block always print, so they're never hidden here either. */}
          {LAYER_IDS.filter((l) => l !== "TITLE").map((l) => {
            const st = doc.layers[l] ?? { visible: true, locked: false };
            return (
              <li key={l} className="flex items-center gap-0.5">
                <span className="min-w-0 flex-1 truncate px-2 text-sm text-ink">{LAYER_NAMES[l]}</span>
                <button type="button" aria-pressed={st.visible} aria-label={`${st.visible ? "Hide" : "Show"} ${LAYER_NAMES[l]}`} disabled={Boolean(props.readOnly)} onClick={() => update((d) => void (d.layers[l] = { ...st, visible: !st.visible }))} className={buttonClasses("ghost", "icon")}>
                  {st.visible ? <EyeIcon size={16} weight="bold" aria-hidden /> : <EyeSlashIcon size={16} weight="bold" aria-hidden />}
                </button>
                <button type="button" aria-pressed={st.locked} aria-label={`${st.locked ? "Unlock" : "Lock"} ${LAYER_NAMES[l]}`} disabled={Boolean(props.readOnly)} onClick={() => update((d) => void (d.layers[l] = { ...st, locked: !st.locked }))} className={buttonClasses("ghost", "icon")}>
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
                  <div key={k} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
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
              {selected ? <SelectionEditor key={selected} entity={selected} doc={doc} points={props.points} update={update} readOnly={Boolean(props.readOnly)} onEditSheet={() => setTab("sheet")} onRemoved={() => setSelected(null)} /> : null}
            </>
          ) : selected ? (
            <SelectionEditor key={selected} entity={selected} doc={doc} points={props.points} update={update} readOnly={Boolean(props.readOnly)} onEditSheet={() => setTab("sheet")} onRemoved={() => setSelected(null)} />
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-ink-2">Tap a line, point, lot or label on the sheet to see where its figures come from and change what can be changed. On a touch screen, tap a label before dragging it.</p>
              <FindPoint points={props.points} onFound={(id) => (setPicked([]), setSelected(`pt:${id}`))} />
              <AddDimension doc={doc} points={props.points} update={update} readOnly={Boolean(props.readOnly)} onAdded={(id) => (setPicked([]), setSelected(`dim:${id}`))} />
              {props.readOnly || drawing ? null : (
                <button type="button" onClick={() => startDrawing(true)} className={buttonClasses("secondary", "sm", "w-fit")}>
                  <LineSegmentsIcon size={16} weight="bold" aria-hidden /> Draw a line
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}

      {tab === "sheet" ? <SheetFields doc={doc} update={update} readOnly={Boolean(props.readOnly)} surveyors={props.surveyors} suggested={plan.sheet.suggestedScale} paper={plan.sheet.paper} /> : null}
      {tab === "codes" ? <CodesPanel doc={doc} update={update} readOnly={Boolean(props.readOnly)} unknown={unknown} /> : null}
    </div>
  );

  const finishLine = () => {
    if (!drawing || drawing.points.length < 2 || cannotFinish(drawing, docRef.current)) return;
    const line = drawing;
    const closed = line.closed && line.points.length >= 3;
    update((d) => void d.features.push({ id: `f-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, layer: line.layer, code: line.code.trim().slice(0, 12), closed, points: line.points }));
    setDrawing(null);
    setMessage({ tone: "done", text: `${closed ? "Outline" : "Line"} drawn through ${line.points.map((id) => props.points.find((p) => p.id === id)?.pointId ?? "?").join(", ")}.` });
  };
  const drawBar = drawing ? (
    <div ref={drawRef} className="scroll-mt-28 lg:scroll-mt-16">
      <DrawLineBar drawing={drawing} setDrawing={(change) => setDrawing((x) => (x ? change(x) : x))} doc={doc} points={props.points} onFinish={finishLine} onCancel={() => setDrawing(null)} />
    </div>
  ) : null;

  const note = message ? (
    <p role={message.tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 text-sm ${message.tone === "error" ? "text-failed" : "text-ink-2"}`}>
      {message.tone === "error" ? <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> : <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />}
      {message.text}
    </p>
  ) : null;

  if (full) {
    // Full screen: the tools, any message and the sheet, over everything, with the assistant at the bottom (no tab bar to sit above).
    return (
      <div className="fixed inset-0 z-50 flex flex-col gap-2 bg-canvas px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] [--tab-bar:0px]">
        {toolbar}
        {drawBar}
        {note}
        {canvas}
      </div>
    );
  }

  return (
    // The panel sits beside the sheet only when the editor itself has room for both (a container query), not at a fixed screen size.
    <div className={`@container grid gap-3 ${props.assistantAiOff !== undefined ? "pb-[calc(var(--assist-bar,10rem)+2rem)] lg:pb-0" : ""}`}>
      {toolbar}
      {drawBar}
      {note}
      <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-3 @4xl:sticky @4xl:top-16 @4xl:self-start">
          {canvas}
          <p className="text-sm text-ink-3">
            {plan.sheet.scale ? `Scale 1:${fmt(plan.sheet.scale, 0)}${shown.settings.scale === null ? " (automatic)" : ""} on ${plan.sheet.paper} ${shown.settings.orientation}.` : "Set the lots to see the plan at scale."}{" "}
            {blocking.length > 0 ? `${blocking.length} ${blocking.length === 1 ? "check stops" : "checks stop"} export: see the Check step.` : "Labels move on paper only: no coordinate changes."}
          </p>
        </div>
        {panels}
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, icon, disabled = false }: { label: string; onClick: () => void; icon: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={buttonClasses("secondary", "icon")}>
      {icon}
    </button>
  );
}
