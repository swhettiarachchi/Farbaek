/**
 * Composes a plan sheet: the drawing at an exact scale, the title and
 * information panels, the north point and scale bar, and an overleaf schedule.
 * Pure and deterministic: the same inputs always give the same sheet.
 * Geometry is never moved to fit text (survey skill, rule 7); text that doesn't
 * fit is reported as a finding instead.
 */
import { BEARING_CONVENTION, formatDms, toDms } from "../angles";
import type { CrsRecord } from "../crs";
import { PAPER_SIZES, STANDARD_SCALES, legendIsBriefExamples, type LayerId, type SurveyDocument } from "../document";
import { bounds, type Point } from "../geometry";
import type { ParcelResult, SurveyPoint } from "../parcel";
import type { Finding } from "../qc";
import { fromSquareMetres, formatArp, roundTo, toArp } from "../units";
import { SURVEY_ENGINE_VERSION } from "../version";
import { textWidth, toPage, wrap, type SceneColor, type SceneItem, type SceneLayer, type SheetPage, type Viewport } from "./scene";
import type { SheetTemplate } from "./template";

export interface SurveyorDetails {
  name: string;
  designation: string;
  registration: string;
  address: string;
  contact: string;
}

export interface ComposeInput {
  template: SheetTemplate;
  document: SurveyDocument;
  points: readonly SurveyPoint[];
  parcel: ParcelResult | null;
  crs: CrsRecord | null;
  /** "Confirmed by A. Perera on 2026-11-15", or null when nobody has confirmed the CRS. */
  crsConfirmation: string | null;
  surveyor: SurveyorDetails | null;
  /** Set when this exact version was approved by its surveyor. */
  approval: { by: string; at: string } | null;
}

export interface ComposedSheet {
  pages: SheetPage[];
  viewport: Viewport | null;
  /** The scale used, and the one Farbaek would suggest. */
  scale: number | null;
  suggestedScale: number | null;
  findings: Finding[];
}

/**
 * Numbers with thousands separators and fixed decimals, written the same
 * everywhere, rounded half away from zero like areas and angles (units.ts):
 * 1.005 m is "1.01", where toFixed alone gives "1.00".
 */
export function fmt(n: number, decimals: number): string {
  const r = roundTo(Math.abs(n), decimals);
  const [whole, frac] = r.toFixed(decimals).split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 && r !== 0 ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

/** Devanagari to Sinhala, U+0900 to U+0DFF: scripts the embedded fonts can't draw. */
const INDIC = /[ऀ-෿]/;

const BLANK = "..........................";
const orBlank = (s: string) => (s.trim() ? s.trim() : BLANK);

function pageSize(doc: SurveyDocument): { w: number; h: number } {
  const [a, b] = PAPER_SIZES[doc.settings.paper];
  return doc.settings.orientation === "landscape" ? { w: b, h: a } : { w: a, h: b };
}

/** The model points the plan shows: the boundary and the features. */
function drawnPoints(doc: SurveyDocument, byId: Map<string, SurveyPoint>): SurveyPoint[] {
  const ids = new Set([...doc.boundary, ...doc.features.flatMap((f) => f.points)]);
  return [...ids].map((id) => byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
}

/** The largest standard scale (smallest denominator) at which the extent fits the viewport with room for labels. */
export function suggestScale(extentE: number, extentN: number, viewportW: number, viewportH: number): number | null {
  const need = Math.max((Math.max(extentE, 0.001) * 1000) / (viewportW * 0.8), (Math.max(extentN, 0.001) * 1000) / (viewportH * 0.8));
  return STANDARD_SCALES.find((s) => s >= need) ?? null;
}

/** A round scale-bar length in metres, between 40 and 100 mm on paper where possible. */
function scaleBarMetres(scale: number): number {
  const target = (50 * scale) / 1000;
  const pow = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((m) => m * pow).filter((m) => m <= target * 1.6).pop() ?? pow;
}

class Column {
  y: number;
  readonly items: SceneItem[] = [];
  overflow = false;
  constructor(
    readonly x: number,
    top: number,
    readonly w: number,
    readonly bottom: number,
  ) {
    this.y = top;
  }
  fits(h: number): boolean {
    return this.y + h <= this.bottom;
  }
  text(t: string, size: number, opts: Partial<{ weight: "regular" | "bold"; font: "sans" | "mono"; color: SceneColor; anchor: "start" | "middle"; indent: number; gap: number }> = {}): void {
    const indent = opts.indent ?? 0;
    const lines = wrap(t, size, this.w - indent - 2, opts.font ?? "sans");
    // A word too long to wrap (a plan number with no spaces) would run past the panel's edge: that's overflow too.
    if (lines.some((line) => textWidth(line, size, opts.font ?? "sans") > this.w - indent - 1)) this.overflow = true;
    for (const line of lines) {
      const lh = size * 1.32;
      if (!this.fits(lh)) {
        this.overflow = true;
        return;
      }
      this.y += lh;
      const x = opts.anchor === "middle" ? this.x + this.w / 2 : this.x + 1 + indent;
      this.items.push({ kind: "text", x, y: this.y - size * 0.28, text: line, size, weight: opts.weight ?? "regular", font: opts.font ?? "sans", anchor: opts.anchor ?? "start", rotate: 0, color: opts.color ?? "ink", layer: "TITLE" });
    }
    this.y += opts.gap ?? 0;
  }
  rule(width: number): void {
    if (!this.fits(2)) {
      this.overflow = true;
      return;
    }
    this.y += 1.6;
    this.items.push({ kind: "path", points: [[this.x, this.y], [this.x + this.w, this.y]], closed: false, width, color: "ink", layer: "SHEET" });
    this.y += 1.6;
  }
  box(h: number, caption: string, size: number, width: number, boxW = this.w - 2): void {
    if (!this.fits(h + size * 1.6)) {
      this.overflow = true;
      return;
    }
    const x = this.x + 1;
    const top = this.y + 0.8;
    this.items.push({ kind: "path", points: [[x, top], [x + boxW, top], [x + boxW, top + h], [x, top + h]], closed: true, width, color: "ink", layer: "SHEET" });
    this.items.push({ kind: "text", x: x + 1.5, y: top + h - 1.5, text: caption, size, weight: "regular", font: "sans", anchor: "start", rotate: 0, color: "muted", layer: "SHEET" });
    this.y = top + h + 0.8;
  }
}

export function composeSheet(input: ComposeInput): ComposedSheet {
  const { template: t, document: doc } = input;
  const findings: Finding[] = [];
  const { w, h } = pageSize(doc);
  const m = t.margin[doc.settings.paper];
  const front: SceneItem[] = [];
  const landscape = doc.settings.orientation === "landscape";

  // Frame.
  front.push({ kind: "path", points: [[m, m], [w - m, m], [w - m, h - m], [m, h - m]], closed: true, width: t.lines.frame, color: "ink", layer: "SHEET" });

  // Panel area and drawing viewport.
  let vp: { x: number; y: number; w: number; h: number };
  const columns: Column[] = [];
  if (landscape) {
    const pw = Math.min(t.panel.landscapeMax, Math.max(t.panel.landscapeMin, w * t.panel.landscapeShare));
    const x0 = w - m - pw;
    front.push({ kind: "path", points: [[x0, m], [x0, h - m]], closed: false, width: t.lines.panel, color: "ink", layer: "SHEET" });
    columns.push(new Column(x0 + 2, m + 2, pw - 4, h - m - 2));
    vp = { x: m + 6, y: m + 6, w: x0 - m - 12, h: h - 2 * m - 12 };
  } else {
    const bh = Math.min(t.panel.portraitMax, Math.max(t.panel.portraitMin, h * t.panel.portraitShare));
    const y0 = h - m - bh;
    const mid = w / 2;
    front.push({ kind: "path", points: [[m, y0], [w - m, y0]], closed: false, width: t.lines.panel, color: "ink", layer: "SHEET" });
    front.push({ kind: "path", points: [[mid, y0], [mid, h - m]], closed: false, width: t.lines.panel, color: "ink", layer: "SHEET" });
    columns.push(new Column(m + 2, y0 + 2, mid - m - 4, h - m - 2), new Column(mid + 2, y0 + 2, w - m - mid - 4, h - m - 2));
    vp = { x: m + 6, y: m + 6, w: w - 2 * m - 12, h: y0 - m - 12 };
  }

  // The drawing.
  const byId = new Map(input.points.map((p) => [p.id, p]));
  const shown = drawnPoints(doc, byId);
  const b = bounds(shown);
  let viewport: Viewport | null = null;
  let suggested: number | null = null;
  let scale: number | null = null;
  if (b) {
    suggested = suggestScale(b.maxE - b.minE, b.maxN - b.minN, vp.w, vp.h);
    scale = doc.settings.scale ?? suggested;
    if (scale === null) {
      findings.push({ code: "SCALE_TOO_LARGE_AREA", severity: "error", message: "The drawing is too large for any standard scale on this sheet.", target: { kind: "sheet" }, action: "Choose a larger sheet.", blocks: ["export"] });
    } else {
      viewport = { ...vp, scale, centreE: (b.minE + b.maxE) / 2, centreN: (b.minN + b.maxN) / 2 };
      const kmm = 1000 / scale;
      if ((b.maxE - b.minE) * kmm > vp.w || (b.maxN - b.minN) * kmm > vp.h) {
        findings.push({ code: "DRAWING_OFF_SHEET", severity: "error", message: `At 1:${scale} the drawing doesn't fit the sheet.`, target: { kind: "sheet" }, detail: `It needs ${fmt((b.maxE - b.minE) * kmm, 0)} × ${fmt((b.maxN - b.minN) * kmm, 0)} mm; the drawing area is ${fmt(vp.w, 0)} × ${fmt(vp.h, 0)} mm.`, action: suggested ? `Use 1:${suggested}, or a larger sheet.` : "Use a larger sheet.", blocks: ["export"] });
      }
      const before = front.length;
      drawModel(front, viewport, input, findings);
      const crowded = overlappingLabels(front.slice(before));
      if (crowded.length > 0) {
        findings.push({
          code: "LABELS_OVERLAP",
          severity: "warning",
          message: `${crowded.length === 1 ? "A label overlaps" : `${crowded.length} labels overlap`} another label or a point at 1:${scale}.`,
          target: { kind: "sheet" },
          detail: crowded.slice(0, 6).map((p) => `"${p[0]}" and "${p[1]}"`).join(", ") + (crowded.length > 6 ? ", and more" : ""),
          action: "Drag one of them clear in the editor, or choose a larger scale. Nothing is moved for you.",
          blocks: [],
        });
      }
    }
  }

  // Panels.
  const crsLine = !input.crs
    ? "Coordinate system: not set."
    : input.crs.kind === "local"
      ? `Coordinates: ${input.crs.name}.${input.crsConfirmation ? ` ${input.crsConfirmation}.` : ""}`
      : `${t.captions.grid}: ${input.crs.name}${input.crs.epsg ? ` (EPSG:${input.crs.epsg})` : ""}. ${input.crsConfirmation ? `${input.crsConfirmation}.` : "Not confirmed by a person."}`;
  const notes = [
    crsLine,
    `${BEARING_CONVENTION} Distances are horizontal grid distances in metres.`,
    scale ? `Scale 1:${fmt(scale, 0)} on ${doc.settings.paper}. Print at 100% (actual size): fitting to the page changes the scale.` : "",
    `Prepared with Farbaek Survey Studio (${SURVEY_ENGINE_VERSION}).`,
  ].filter(Boolean);

  const panels = buildPanels(input, notes);
  if (landscape) {
    for (const p of panels) p(columns[0]!);
  } else {
    const split = Math.ceil(panels.length / 2);
    panels.slice(0, split).forEach((p) => p(columns[0]!));
    panels.slice(split).forEach((p) => p(columns[1]!));
  }
  for (const c of columns) front.push(...c.items);
  if (columns.some((c) => c.overflow)) {
    findings.push({ code: "TEXT_OVERFLOW", severity: "error", message: "The sheet's text doesn't all fit in its panel.", target: { kind: "sheet" }, action: "Choose a larger sheet or landscape, or shorten the longest fields.", blocks: ["export"] });
  }

  const pages: SheetPage[] = [{ widthMm: w, heightMm: h, role: "front", items: front }];
  if (doc.settings.overleaf && input.parcel) pages.push(...overleafPages(input, w, h, m));
  // The sheet's fonts (Geist) have Latin letters only: Sinhala, Tamil or other South Asian text would print as empty boxes.
  const unprintable = pages.flatMap((p) => p.items).find((i) => i.kind === "text" && INDIC.test(i.text));
  if (unprintable && unprintable.kind === "text") {
    findings.push({ code: "TEXT_SCRIPT_NOT_SUPPORTED", severity: "error", message: "Sinhala and Tamil text can't be printed on the sheet yet: it would come out as empty boxes.", target: { kind: "sheet" }, detail: `For example "${unprintable.text.slice(0, 40)}".`, action: "Write the sheet's fields in English for now. Sinhala and Tamil on the sheet come in a later stage.", blocks: ["export"] });
  }
  return { pages, viewport, scale, suggestedScale: suggested, findings };
}

function drawModel(out: SceneItem[], v: Viewport, input: ComposeInput, findings: Finding[]): void {
  const { template: t, document: doc, parcel } = input;
  const visible = (l: LayerId) => doc.layers[l]?.visible !== false;
  const at = (p: Point) => toPage(v, p.e, p.n);
  const offset = (entity: string): [number, number] => {
    const o = doc.labelOffsets[entity];
    return o ? [o.dx, o.dy] : [0, 0];
  };
  const byId = new Map(input.points.map((p) => [p.id, p]));
  const label = (layer: SceneLayer, entity: string, x: number, y: number, text: string, size: number, rotate = 0, extra: Partial<{ weight: "regular" | "bold"; anchor: "start" | "middle" | "end"; font: "sans" | "mono"; color: SceneColor }> = {}) => {
    const [dx, dy] = offset(entity);
    out.push({ kind: "text", x: x + dx, y: y + dy, text, size, rotate, weight: extra.weight ?? "regular", anchor: extra.anchor ?? "middle", font: extra.font ?? "sans", color: extra.color ?? "ink", layer, entity });
  };
  const centre = parcel && parcel.vertices.length >= 3 ? at(parcel.labelAt) : null;

  // Features under the boundary. A closed feature (a building) is labelled in
  // its middle; a line (a wall, fence or drain) beside its longest segment, on
  // the side toward the lot, so a wall along a boundary leg never covers that
  // leg's bearing, which sits outside.
  for (const f of doc.features) {
    if (!visible(f.layer)) continue;
    const pts = f.points.map((id) => byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
    if (pts.length < 2) continue;
    const dash = f.layer === "FENCES" ? [1.6, 0.8] : f.layer === "DRAINS" ? [3, 1] : undefined;
    const page = pts.map(at);
    out.push({ kind: "path", points: page, closed: f.closed, width: t.lines.feature, color: "ink", dash, layer: f.layer, entity: `feature:${f.id}` });
    if (!f.code.trim()) continue;
    const size = t.text.label;
    if (f.closed && page.length >= 3) {
      const mx = page.reduce((s, p) => s + p[0], 0) / page.length;
      const my = page.reduce((s, p) => s + p[1], 0) / page.length;
      label(f.layer, `feature:${f.id}`, mx, my + size * 0.35, f.code, size);
    } else {
      let k = 0;
      for (let i = 1; i < page.length - 1; i++) if (Math.hypot(page[i + 1]![0] - page[i]![0], page[i + 1]![1] - page[i]![1]) > Math.hypot(page[k + 1]![0] - page[k]![0], page[k + 1]![1] - page[k]![1])) k = i;
      const [x1, y1] = page[k]!;
      const [x2, y2] = page[k + 1]!;
      const side: [number, number] = centre ? [centre[0] - (x1 + x2) / 2, centre[1] - (y1 + y2) / 2] : [0, -1];
      const p = besideSegment(x1, y1, x2, y2, side, size);
      label(f.layer, `feature:${f.id}`, p.x, p.y, f.code, size, p.theta);
    }
  }

  if (!parcel || parcel.vertices.length < 2) return;
  const ring = parcel.vertices.map(at);
  const [cx, cy] = at(parcel.labelAt);
  const ringArea = ring.reduce((s, [x, y], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    return s + (x - ring[0]![0]) * (y2 - ring[0]![1]) - (x2 - ring[0]![0]) * (y - ring[0]![1]);
  }, 0);
  if (visible("BOUNDARY")) out.push({ kind: "path", points: ring, closed: parcel.vertices.length >= 3, width: t.lines.boundary, color: "ink", layer: "BOUNDARY", entity: "boundary" });

  // Leg labels: bearing and distance, parallel to the leg, outside the parcel, upright.
  if (visible("DIMENSIONS")) {
    parcel.legs.forEach((leg, i) => {
      if (leg.bearing === null) return;
      const [x1, y1] = at(leg.from);
      const [x2, y2] = at(leg.to);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const size = t.text.label;
      // Outside is decided by the ring's direction, not the centroid, so it holds for concave lots too:
      // with a positive page-space area the inside is to the left of each leg.
      const outside: [number, number] = ringArea > 0 ? [y2 - y1, -(x2 - x1)] : [-(y2 - y1), x2 - x1];
      const p = besideSegment(x1, y1, x2, y2, ringArea === 0 ? [(x1 + x2) / 2 - cx, (y1 + y2) / 2 - cy] : outside, size);
      const text = `${formatDms(toDms(leg.bearing, doc.settings.secondDecimals))}  ${fmt(leg.distance, doc.settings.distanceDecimals)}`;
      label("DIMENSIONS", `leg:${i}`, p.x, p.y, text, size, p.theta);
      if (textWidth(text, size) > len * 1.05) {
        findings.push({ code: "LABEL_LONGER_THAN_LEG", severity: "information", message: `The label for ${leg.from.pointId}–${leg.to.pointId} is longer than the leg at this scale.`, target: { kind: "leg", id: String(i) }, action: "Move the label in the editor, or use a larger scale. The geometry is never changed to make room.", blocks: [] });
      }
    });
  }

  // Boundary points, their numbers and their mark codes.
  parcel.vertices.forEach((p) => {
    const [x, y] = at(p);
    if (visible("POINTS")) out.push({ kind: "circle", cx: x, cy: y, r: 0.7, width: t.lines.thin, color: "ink", fill: "paper", layer: "POINTS", entity: `pt:${p.id}` });
    let dx = x - cx;
    let dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const size = t.text.label;
    const small = t.text.small;
    if (visible("POINT_NUMBERS")) label("POINT_NUMBERS", `pt:${p.id}`, x + dx * 2.8, y + dy * 2.8 + size * 0.35, p.pointId, size, 0, { weight: "bold" });
    // The mark code goes one line further out than the number: above it where
    // the point faces up or down the page, below it where it faces sideways
    // (the number then sits clear of the point already), never over the point.
    if (visible("BOUNDARY_MARKS") && p.code && p.code.trim()) {
      const [mx, my] = Math.abs(dy) > 0.5 ? [x + dx * (2.8 + 2.7), y + dy * (2.8 + 2.7) + small * 0.35] : [x + dx * 2.8, y + dy * 2.8 + size * 0.35 + small * 1.25];
      label("BOUNDARY_MARKS", `mark:${p.id}`, mx, my, p.code.trim(), small, 0, { color: "muted" });
    }
  });

  // Lot name and extent at the centroid.
  if (visible("LOT_TEXT") && parcel.vertices.length >= 3 && parcel.crossings.length === 0) {
    const lot = doc.sheet.lot.trim();
    const size = t.text.body * 1.35;
    if (lot) label("LOT_TEXT", "lot", cx, cy - size * 0.2, `${input.template.captions.lot} ${lot}`, size, 0, { weight: "bold" });
    label("LOT_TEXT", "lot-extent", cx, cy + size * (lot ? 1.1 : 0.4), formatArp(toArp(parcel.areaM2, doc.settings.perchDecimals)), t.text.body);
  }

  // North point, top right of the drawing.
  const nx0 = v.x + v.w - 10;
  const ny0 = v.y + 12;
  out.push({ kind: "path", points: [[nx0, ny0 - 8], [nx0 + 3.2, ny0 + 4], [nx0, ny0 + 1.6], [nx0 - 3.2, ny0 + 4]], closed: true, width: t.lines.thin, color: "ink", fill: "ink", layer: "TITLE", entity: "north" });
  out.push({ kind: "text", x: nx0, y: ny0 - 9.5, text: "N", size: t.text.heading * 1.2, weight: "bold", font: "sans", anchor: "middle", rotate: 0, color: "ink", layer: "TITLE", entity: "north" });
  out.push({ kind: "text", x: nx0, y: ny0 + 8, text: input.crs?.kind === "local" ? "Site grid north" : "Grid north", size: t.text.small, weight: "regular", font: "sans", anchor: "middle", rotate: 0, color: "muted", layer: "TITLE", entity: "north" });

  // Scale bar, bottom left of the drawing.
  const metres = scaleBarMetres(v.scale);
  const k = 1000 / v.scale;
  const sx = v.x + 4;
  const sy = v.y + v.h - 6;
  const seg = (metres * k) / 4;
  for (let i = 0; i < 4; i++) {
    out.push({ kind: "path", points: [[sx + i * seg, sy], [sx + (i + 1) * seg, sy], [sx + (i + 1) * seg, sy + 1.6], [sx + i * seg, sy + 1.6]], closed: true, width: t.lines.thin, color: "ink", fill: i % 2 === 0 ? "ink" : "paper", layer: "TITLE", entity: "scalebar" });
  }
  const tick = (x: number, s: string) => out.push({ kind: "text", x, y: sy - 1.2, text: s, size: t.text.small, weight: "regular", font: "sans", anchor: "middle", rotate: 0, color: "ink", layer: "TITLE", entity: "scalebar" });
  tick(sx, "0");
  // Half of 5 m is 2.5 m, never "3": the tick shows as many decimals as the half needs.
  const half = metres / 2;
  tick(sx + 2 * seg, fmt(half, Number.isInteger(half) ? 0 : Number.isInteger(roundTo(half * 10, 6)) ? 1 : 2));
  tick(sx + 4 * seg, `${fmt(metres, 0)} m`);
  out.push({ kind: "text", x: sx, y: sy + 5.6, text: `Scale 1:${fmt(v.scale, 0)}`, size: t.text.body, weight: "bold", font: "sans", anchor: "start", rotate: 0, color: "ink", layer: "TITLE", entity: "scalebar" });

  // A 100 mm check line, top left: a ruler on the printed sheet shows at once whether the printer kept the scale.
  if (v.w >= 104) {
    const cx0 = v.x + 2;
    const cy0 = v.y + 6;
    out.push({ kind: "path", points: [[cx0, cy0], [cx0 + 100, cy0]], closed: false, width: t.lines.thin, color: "ink", layer: "TITLE", entity: "checkline" });
    for (const x of [cx0, cx0 + 100]) out.push({ kind: "path", points: [[x, cy0 - 1.2], [x, cy0 + 1.2]], closed: false, width: t.lines.thin, color: "ink", layer: "TITLE", entity: "checkline" });
    out.push({ kind: "text", x: cx0 + 50, y: cy0 - 1.5, text: "100 mm when printed at actual size", size: t.text.small, weight: "regular", font: "sans", anchor: "middle", rotate: 0, color: "muted", layer: "TITLE", entity: "checkline" });
  }
}

type Panel = (c: Column) => void;

function buildPanels(input: ComposeInput, notes: string[]): Panel[] {
  const { template: t, document: doc, parcel } = input;
  const cap = t.captions;
  const s = doc.sheet;
  const T = t.text;
  const panels: Panel[] = [];

  panels.push((c) => {
    c.text(`${cap.planNumber} ${orBlank(s.planNumber)}`, T.title, { weight: "bold", anchor: "middle", gap: 1 });
    if (s.lot.trim()) c.text(`${cap.lot} ${s.lot.trim()}`, T.heading, { weight: "bold", anchor: "middle", gap: 0.6 });
    c.text(`${cap.planOf} ${orBlank(s.landName)}`, T.body, { anchor: "middle" });
    const where = [s.village.trim(), s.gnDivision.trim() && `${s.gnDivision.trim()} GN Division`, s.dsDivision.trim() && `${s.dsDivision.trim()} DS Division`, s.district.trim() && `${s.district.trim()} District`, s.province.trim() && `${s.province.trim()} Province`].filter(Boolean).join(", ");
    c.text(`${cap.situatedAt} ${where || BLANK}`, T.body, { anchor: "middle", gap: 0.6 });
    if (!input.approval) c.text("DRAFT. Not certified: the plan is certified only by the licensed surveyor's signature on the printed sheet.", T.small, { color: "red", anchor: "middle" });
    c.rule(t.lines.panel);
  });

  panels.push((c) => {
    c.text(cap.extent, T.heading, { weight: "bold" });
    if (parcel && parcel.vertices.length >= 3 && parcel.crossings.length === 0) {
      const a = parcel.areaM2;
      c.text(formatArp(toArp(a, doc.settings.perchDecimals)), T.title * 0.86, { weight: "bold" });
      c.text(`${fmt(fromSquareMetres(a, "ha"), 4)} ha, ${fmt(a, 2)} m²`, T.body);
      c.text(`${cap.computedArea} (coordinate method).`, T.small, { color: "muted" });
    } else {
      c.text("Not computed: the boundary isn't complete.", T.body, { color: "muted" });
    }
    if (s.statedExtent.trim()) c.text(`${cap.statedExtent}: ${s.statedExtent.trim()}`, T.body);
    c.rule(t.lines.panel);
  });

  panels.push((c) => {
    c.text(cap.boundaries, T.heading, { weight: "bold" });
    c.text(`${cap.north}: ${orBlank(s.boundaries.north)}`, T.body);
    c.text(`${cap.east}: ${orBlank(s.boundaries.east)}`, T.body);
    c.text(`${cap.south}: ${orBlank(s.boundaries.south)}`, T.body);
    c.text(`${cap.west}: ${orBlank(s.boundaries.west)}`, T.body);
    c.rule(t.lines.panel);
  });

  panels.push((c) => {
    c.text(cap.legend, T.heading, { weight: "bold" });
    for (const e of s.legend) c.text(`${e.code}  ${e.meaning}`, T.body);
    if (legendIsBriefExamples(s.legend)) c.text("Starting examples, not yet reviewed by the surveyor.", T.small, { color: "red" });
    c.rule(t.lines.panel);
  });

  panels.push((c) => {
    c.text(cap.survey, T.heading, { weight: "bold" });
    c.text(`${cap.surveyedOn}: ${orBlank(s.surveyDate)}`, T.body);
    c.text(`${cap.planDate}: ${orBlank(s.planDate)}`, T.body);
    c.text(`${cap.previousPlans}: ${orBlank(s.previousPlans)}`, T.body);
    if (s.remarks.trim()) c.text(`${cap.remarks}: ${s.remarks.trim()}`, T.body);
    c.rule(t.lines.panel);
  });

  panels.push((c) => {
    c.text(cap.surveyor, T.heading, { weight: "bold" });
    const p = input.surveyor;
    if (p) {
      c.text(p.name, T.body, { weight: "bold" });
      if (p.designation.trim()) c.text(p.designation, T.body);
      if (p.registration.trim()) c.text(`Registration: ${p.registration}`, T.body);
      if (p.address.trim()) c.text(p.address, T.small);
      if (p.contact.trim()) c.text(p.contact, T.small);
    } else c.text("Not chosen yet.", T.body, { color: "muted" });
    c.box(15, cap.signature, T.small, t.lines.thin);
    c.box(18, cap.seal, T.small, t.lines.thin, 30);
    c.rule(t.lines.panel);
  });

  if (doc.settings.permitBox) {
    panels.push((c) => {
      c.box(50, cap.permit, T.small, t.lines.thin, 75);
    });
  }

  panels.push((c) => {
    for (const n of notes) c.text(n, T.small, { color: "muted" });
  });
  return panels;
}

function overleafPages(input: ComposeInput, w: number, h: number, m: number): SheetPage[] {
  const { template: t, document: doc, parcel } = input;
  if (!parcel) return [];
  const T = t.text;
  const rowH = T.tableBody * 1.55;
  const pages: SheetPage[] = [];
  let items: SceneItem[] = [];
  let y = 0;
  const top = m + 6;
  const bottom = h - m - 8;
  const left = m + 6;
  const right = w - m - 6;
  const header = () => {
    items.push({ kind: "path", points: [[m, m], [w - m, m], [w - m, h - m], [m, h - m]], closed: true, width: t.lines.frame, color: "ink", layer: "SHEET" });
    items.push({ kind: "text", x: left, y: top + T.heading, text: `${t.captions.planNumber} ${orBlank(doc.sheet.planNumber)}`, size: T.heading, weight: "bold", font: "sans", anchor: "start", rotate: 0, color: "ink", layer: "TITLE" });
    items.push({ kind: "text", x: right, y: top + T.heading, text: t.captions.overleaf, size: T.heading, weight: "regular", font: "sans", anchor: "end", rotate: 0, color: "muted", layer: "TITLE" });
    y = top + T.heading + 6;
  };
  const newPage = () => {
    if (items.length) pages.push({ widthMm: w, heightMm: h, role: "overleaf", items });
    items = [];
    header();
  };
  const heading = (s: string) => {
    if (y + rowH * 3 > bottom) newPage();
    y += T.heading * 1.4;
    items.push({ kind: "text", x: left, y, text: s, size: T.heading, weight: "bold", font: "sans", anchor: "start", rotate: 0, color: "ink", layer: "TITLE" });
    y += 2;
  };
  const table = (cols: { title: string; x: number; anchor: "start" | "end" }[], rows: string[][]) => {
    const head = () => {
      y += rowH;
      for (const col of cols) items.push({ kind: "text", x: col.x, y, text: col.title, size: T.tableBody, weight: "bold", font: "sans", anchor: col.anchor, rotate: 0, color: "ink", layer: "TITLE" });
      items.push({ kind: "path", points: [[left, y + 1], [right, y + 1]], closed: false, width: t.lines.thin, color: "ink", layer: "SHEET" });
    };
    head();
    for (const r of rows) {
      if (y + rowH > bottom) {
        newPage();
        head();
      }
      y += rowH;
      r.forEach((cell, i) => items.push({ kind: "text", x: cols[i]!.x, y, text: cell, size: T.tableBody, weight: "regular", font: i === 0 ? "sans" : "mono", anchor: cols[i]!.anchor, rotate: 0, color: "ink", layer: "TITLE" }));
    }
    y += 2;
  };

  newPage();
  const span = right - left;
  heading(t.captions.coordinates);
  table(
    [
      { title: "Point", x: left, anchor: "start" },
      { title: "Easting (m)", x: left + span * 0.42, anchor: "end" },
      { title: "Northing (m)", x: left + span * 0.66, anchor: "end" },
      { title: "Elevation (m)", x: left + span * 0.84, anchor: "end" },
      { title: "Code", x: right, anchor: "end" },
    ],
    parcel.vertices.map((p) => [p.pointId, fmt(p.e, 3), fmt(p.n, 3), p.z === null ? "" : fmt(p.z, 3), p.code ?? ""]),
  );
  heading(t.captions.legs);
  table(
    [
      { title: "From", x: left, anchor: "start" },
      { title: "To", x: left + span * 0.2, anchor: "start" },
      { title: "Bearing", x: left + span * 0.66, anchor: "end" },
      { title: "Distance (m)", x: right, anchor: "end" },
    ],
    parcel.legs.map((l) => [l.from.pointId, l.to.pointId, l.bearing === null ? "" : formatDms(toDms(l.bearing, doc.settings.secondDecimals)), fmt(l.distance, doc.settings.distanceDecimals)]),
  );
  heading(t.captions.areaComputation);
  const a = parcel.areaM2;
  const lines = [
    `Area by the coordinate method on grid coordinates: ${fmt(a, 3)} m², ${fmt(fromSquareMetres(a, "ha"), 6)} ha, ${formatArp(toArp(a, doc.settings.perchDecimals))}.`,
    `Perimeter ${fmt(parcel.perimeterM, 3)} m over ${parcel.legs.length} legs.`,
    "1 perch = 25.29285264 m² (from the international yard); 40 perches = 1 rood; 4 roods = 1 acre.",
    doc.sheet.statedExtent.trim() ? `${t.captions.statedExtent} (as given, not computed): ${doc.sheet.statedExtent.trim()}.` : "",
    `${BEARING_CONVENTION}`,
    `Computed by ${parcel.engine}.`,
  ].filter(Boolean);
  for (const l of lines) {
    for (const part of wrap(l, T.body, span)) {
      if (y + rowH > bottom) newPage();
      y += T.body * 1.4;
      items.push({ kind: "text", x: left, y, text: part, size: T.body, weight: "regular", font: "sans", anchor: "start", rotate: 0, color: "ink", layer: "TITLE" });
    }
  }
  pages.push({ widthMm: w, heightMm: h, role: "overleaf", items });
  return pages;
}

/**
 * Where a label parallel to a segment goes: at its middle, turned to read
 * upright, on the side `side` points to, with its nearer edge 1.1 mm clear of
 * the line whichever way up the text is.
 */
function besideSegment(x1: number, y1: number, x2: number, y2: number, side: [number, number], size: number): { x: number; y: number; theta: number } {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  let theta = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  if (theta > 90) theta -= 180;
  if (theta < -90) theta += 180;
  let nx = -(y2 - y1) / len;
  let ny = (x2 - x1) / len;
  if (nx * side[0] + ny * side[1] < 0) {
    nx = -nx;
    ny = -ny;
  }
  const rad = (theta * Math.PI) / 180;
  const outIsUp = nx * Math.sin(rad) - ny * Math.cos(rad) > 0;
  const gap = outIsUp ? 1.1 : 1.1 + size * 0.72;
  return { x: (x1 + x2) / 2 + nx * gap, y: (y1 + y2) / 2 + ny * gap, theta };
}

type Quad = [number, number][];

/** A text's outline on the page: its estimated width, cap height and descent, turned with it. */
function textQuad(t: Extract<SceneItem, { kind: "text" }>): Quad {
  const w = textWidth(t.text, t.size, t.font);
  const u0 = t.anchor === "middle" ? -w / 2 : t.anchor === "end" ? -w : 0;
  const rad = (t.rotate * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const inset = 0.15;
  const corners: [number, number][] = [
    [u0 + inset, -t.size * 0.72 + inset],
    [u0 + w - inset, -t.size * 0.72 + inset],
    [u0 + w - inset, t.size * 0.2 - inset],
    [u0 + inset, t.size * 0.2 - inset],
  ];
  return corners.map(([u, v]) => [t.x + u * c - v * s, t.y + u * s + v * c]);
}

/** Separating axis test for two convex quadrilaterals. */
function quadsOverlap(a: Quad, b: Quad): boolean {
  for (const q of [a, b]) {
    for (let i = 0; i < q.length; i++) {
      const [x1, y1] = q[i]!;
      const [x2, y2] = q[(i + 1) % q.length]!;
      const ax = -(y2 - y1);
      const ay = x2 - x1;
      const pa = a.map(([x, y]) => x * ax + y * ay);
      const pb = b.map(([x, y]) => x * ax + y * ay);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

/**
 * Pairs of drawing labels that cover each other, or cover a boundary point,
 * by their estimated outlines. Only reported: a person moves labels, the
 * composer never does (the survey skill's rule 7).
 */
export function overlappingLabels(items: SceneItem[]): [string, string][] {
  const texts = items.filter((i): i is Extract<SceneItem, { kind: "text" }> => i.kind === "text" && i.layer !== "TITLE" && i.layer !== "SHEET");
  const shapes: { name: string; quad: Quad }[] = texts.map((t) => ({ name: t.text, quad: textQuad(t) }));
  for (const c of items) {
    if (c.kind !== "circle" || c.layer !== "POINTS") continue;
    const r = c.r;
    shapes.push({ name: "a point", quad: [[c.cx - r, c.cy - r], [c.cx + r, c.cy - r], [c.cx + r, c.cy + r], [c.cx - r, c.cy + r]] });
  }
  const out: [string, string][] = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      if (quadsOverlap(shapes[i]!.quad, shapes[j]!.quad)) out.push([shapes[i]!.name, shapes[j]!.name]);
    }
  }
  return out;
}
