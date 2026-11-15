/**
 * Composes a plan sheet: the drawing at an exact scale, the title and
 * information, the north point, and an overleaf schedule. Two layouts
 * (ADR 0203): the classic Sri Lankan sheet (`classic.ts`) and the panel
 * layout below, with the information in a side or bottom panel and the
 * bearings and distances on the face.
 *
 * Pure and deterministic: the same inputs always give the same sheet.
 * Geometry is never moved to fit text (survey skill, rule 7); text that doesn't
 * fit is reported as a finding instead.
 */
import { BEARING_CONVENTION, formatDms, toDms } from "../angles";
import { codeOf, codesAreCommonList, lookupCode } from "../codes";
import type { CrsRecord } from "../crs";
import { PAPER_SIZES, lotName, usedPointIds, type PaperSize, type SurveyDocument } from "../document";
import { bounds } from "../geometry";
import type { PlanLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import type { Finding } from "../qc";
import { arpClassic, hectares } from "../formats";
import { fmt, fromSquareMetres, formatArp, toArp } from "../units";
import { SURVEY_ENGINE_VERSION } from "../version";
import { composeClassic } from "./classic";
import { Placer, atPage, textQuad, drawAdjoining, drawCheckLine, drawCorners, drawFeatures, drawLoosePoints, drawLotLabels, drawLots, drawRoads, drawScaleBar, drawSimpleNorth, overlappingLabels, suggestScale, type DrawCtx } from "./draw";
import { textWidth, wrap, type SceneColor, type SceneItem, type SceneText, type SheetPage, type Viewport } from "./scene";
import type { SheetTemplate } from "./template";

export { fmt } from "../units";
export { overlappingLabels, suggestScale } from "./draw";

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
  lots: PlanLots;
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
  /** The paper the sheet was laid out on (resolved when the setting is "auto"). */
  paper: PaperSize;
  findings: Finding[];
}

/** Devanagari to Sinhala, U+0900 to U+0DFF: scripts the embedded fonts can't draw. */
const INDIC = /[ऀ-෿]/;

export const BLANK = "..........................";
export const orBlank = (s: string) => (s.trim() ? s.trim() : BLANK);

/** The model points the plan shows. */
export function drawnPoints(doc: SurveyDocument, byId: Map<string, SurveyPoint>): SurveyPoint[] {
  return [...usedPointIds(doc)].map((id) => byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
}

/** The plan's entire area: the outline's own area when the lots join cleanly, otherwise the sum of the lots it could compute. */
export function entireAreaM2(lots: PlanLots): number | null {
  if (lots.lots.length === 0) return null;
  return lots.outlineAreaM2 ?? (lots.sumAreaM2 > 0 ? lots.sumAreaM2 : null);
}

/** Findings that apply to every layout: crowded labels, scripts the fonts can't draw. */
export function commonFindings(pages: SheetPage[], drawing: SceneItem[], scale: number | null, findings: Finding[], frame: { inner: [number, number, number, number]; ctx: DrawCtx | null } | null = null): void {
  if (frame) {
    // Nothing may run past the sheet's border: what's cut off on paper is missing from a legal document.
    const [x0, y0, x1, y1] = frame.inner;
    const off = pages[0]!.items.filter((i): i is SceneText => i.kind === "text").filter((t) => textQuad(t).some(([x, y]) => x < x0 - 0.2 || x > x1 + 0.2 || y < y0 - 0.2 || y > y1 + 0.2));
    const outside = [...new Set([...(frame.ctx?.outside ?? []), ...off.map((t) => t.text)])];
    if (outside.length > 0) {
      findings.push({ code: "TEXT_OFF_SHEET", severity: "error", message: "Some text runs past the sheet's border, so it would be cut off.", target: { kind: "sheet" }, detail: outside.slice(0, 4).map((t) => `"${t.slice(0, 40)}"`).join(", "), action: "Shorten it, choose a larger sheet or scale, or drag the label inside the border.", blocks: ["export"] });
    }
    if (frame.ctx && frame.ctx.cramped.length > 0) {
      findings.push({ code: "LOT_LABEL_CRAMPED", severity: "warning", message: `The label of lot ${frame.ctx.cramped.join(", lot ")} is bigger than the lot${scale ? ` at 1:${scale}` : ""}.`, target: { kind: "sheet" }, action: "It's written at the lot's widest point. Check it reads clearly, or choose a larger scale.", blocks: [] });
    }
  }
  const crowded = overlappingLabels(drawing);
  if (crowded.length > 0) {
    findings.push({
      code: "LABELS_OVERLAP",
      severity: "warning",
      message: `${crowded.length === 1 ? "A label overlaps" : `${crowded.length} labels overlap`} another label or a point${scale ? ` at 1:${scale}` : ""}.`,
      target: { kind: "sheet" },
      detail: crowded.slice(0, 6).map((p) => `"${p[0]}" and "${p[1]}"`).join(", ") + (crowded.length > 6 ? ", and more" : ""),
      action: "Drag one of them clear in the editor, or choose a larger scale. Nothing is moved for you.",
      blocks: [],
    });
  }
  // The sheet's fonts (Geist) have Latin letters only: Sinhala, Tamil or other South Asian text would print as empty boxes.
  const unprintable = pages.flatMap((p) => p.items).find((i) => i.kind === "text" && INDIC.test(i.text));
  if (unprintable && unprintable.kind === "text") {
    findings.push({ code: "TEXT_SCRIPT_NOT_SUPPORTED", severity: "error", message: "Sinhala and Tamil text can't be printed on the sheet yet: it would come out as empty boxes.", target: { kind: "sheet" }, detail: `For example "${unprintable.text.slice(0, 40)}".`, action: "Write the sheet's fields in English for now. Sinhala and Tamil on the sheet come in a later stage.", blocks: ["export"] });
  }
}

export function composeSheet(input: ComposeInput): ComposedSheet {
  return input.document.settings.template === "classic" ? composeClassic(input) : composePanel(input);
}

export class Column {
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

/**
 * The legend: the codes the plan shows, as the library defines them: marks at
 * lot corners, lines and outlines drawn, and loose marks and symbols within
 * the drawing (an electric post on a road verge).
 */
export function usedCodes(doc: SurveyDocument, lots: PlanLots, points: readonly SurveyPoint[] = []): { code: string; meaning: string }[] {
  const codes = new Set<string>();
  for (const r of lots.lots) for (const v of r.parcel?.vertices ?? []) if (codeOf(v.code)) codes.add(codeOf(v.code));
  for (const f of doc.features) if (f.code.trim()) codes.add(f.code.trim());
  const box = bounds(drawnPoints(doc, new Map(points.map((p) => [p.id, p]))));
  for (const p of points) {
    const e = lookupCode(doc.codes, codeOf(p.code));
    if (!box || !e || (e.kind !== "mark" && e.kind !== "symbol")) continue;
    if (p.e >= box.minE && p.e <= box.maxE && p.n >= box.minN && p.n <= box.maxN) codes.add(e.code);
  }
  const out: { code: string; meaning: string }[] = [];
  for (const c of codes) {
    const e = lookupCode(doc.codes, c);
    if (e && !e.legend) continue;
    out.push({ code: e?.code ?? c, meaning: e?.meaning ?? "" });
  }
  // In the library's order, unknown codes last.
  const order = (c: string) => {
    const i = doc.codes.findIndex((e) => e.code === c);
    return i < 0 ? 999 : i;
  };
  return out.sort((a, b) => order(a.code) - order(b.code));
}

/** A drawing context on a page. */
export function drawCtx(out: SceneItem[], v: Viewport, input: ComposeInput, sizes: DrawCtx["sizes"], lines: DrawCtx["lines"], slant: number, bounds: DrawCtx["bounds"] = null): DrawCtx {
  return { out, v, doc: input.document, byId: new Map(input.points.map((p) => [p.id, p])), sizes, lines, slant, placer: new Placer(), bounds, cramped: [], outside: [] };
}

function composePanel(input: ComposeInput): ComposedSheet {
  const { template: t, document: doc } = input;
  const findings: Finding[] = [];
  const paper: PaperSize = doc.settings.paper === "auto" ? "A3" : doc.settings.paper;
  const [pa, pb] = PAPER_SIZES[paper];
  const landscape = doc.settings.orientation === "landscape";
  const { w, h } = landscape ? { w: pb, h: pa } : { w: pa, h: pb };
  const m = t.margin[paper];
  const front: SceneItem[] = [];

  front.push({ kind: "path", points: [[m, m], [w - m, m], [w - m, h - m], [m, h - m]], closed: true, width: t.lines.frame, color: "ink", layer: "SHEET" });

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

  const byId = new Map(input.points.map((p) => [p.id, p]));
  const b = bounds(drawnPoints(doc, byId));
  let drawingCtx: DrawCtx | null = null;
  let viewport: Viewport | null = null;
  let suggested: number | null = null;
  let scale: number | null = null;
  const drawing: SceneItem[] = [];
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
      const ctx = drawCtx(drawing, viewport, input, { label: t.text.label, small: t.text.small, lotLabel: t.text.body * 1.35, body: t.text.body, heading: t.text.heading }, { boundary: t.lines.boundary, feature: t.lines.feature, thin: t.lines.thin }, doc.settings.slant ? 12 : 0, [vp.x - 4, vp.y - 4, vp.x + vp.w + 4, vp.y + vp.h + 4]);
      drawingCtx = ctx;
      const first = input.lots.lots.find((r) => r.parcel && r.parcel.vertices.length >= 3)?.parcel ?? null;
      drawRoads(ctx, doc.roads);
      drawFeatures(ctx, first ? atPage(ctx, first.labelAt) : null);
      drawLots(ctx, input.lots, { legLabels: doc.settings.faceDimensions, highlight: doc.sheet.extractOf || null, secondDecimals: doc.settings.secondDecimals, distanceDecimals: doc.settings.distanceDecimals });
      drawCorners(ctx, input.lots, { numbers: true, circles: true });
      drawLoosePoints(ctx, input.points, input.lots);
      drawLotLabels(ctx, input.lots, { extentUnder: input.lots.lots.length === 1 ? (a) => formatArp(toArp(a, doc.settings.perchDecimals)) : null, highlight: doc.sheet.extractOf || null });
      drawAdjoining(ctx, doc.adjoining, input.lots);
      drawSimpleNorth(ctx, viewport.x + viewport.w - 10, viewport.y + 12, input.crs?.kind === "local");
      drawScaleBar(ctx, viewport.x + 4, viewport.y + viewport.h - 6, true);
      if (viewport.w >= 104) drawCheckLine(ctx, viewport.x + 2, viewport.y + 6);
      front.push(...drawing);
    }
  }

  const crsLine = !input.crs
    ? "Coordinate system: not set."
    : input.crs.kind === "local"
      ? `Coordinates: ${input.crs.name}.${input.crsConfirmation ? ` ${input.crsConfirmation}.` : ""}`
      : `${t.captions.grid}: ${input.crs.name}${input.crs.epsg ? ` (EPSG:${input.crs.epsg})` : ""}. ${input.crsConfirmation ? `${input.crsConfirmation}.` : "Not confirmed by a person."}`;
  const notes = [
    crsLine,
    `${BEARING_CONVENTION} Distances are horizontal grid distances in metres.`,
    scale ? `Scale 1:${fmt(scale, 0)} on ${paper}. Print at 100% (actual size): fitting to the page changes the scale.` : "",
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
  if (doc.settings.overleaf) pages.push(...overleafPages(input, { w, h, m, text: t.text, frame: t.lines.frame, thin: t.lines.thin, planCaption: t.captions.planNumber }));
  commonFindings(pages, drawing, scale, findings, { inner: [m, m, w - m, h - m], ctx: drawingCtx });
  return { pages, viewport, scale, suggestedScale: suggested, paper, findings };
}

type Panel = (c: Column) => void;

function buildPanels(input: ComposeInput, notes: string[]): Panel[] {
  const { template: t, document: doc } = input;
  const cap = t.captions;
  const s = doc.sheet;
  const T = t.text;
  const panels: Panel[] = [];
  const area = entireAreaM2(input.lots);
  const lots = doc.lots.map(lotName).filter(Boolean);

  panels.push((c) => {
    c.text(`${cap.planNumber} ${orBlank(s.planNumber)}`, T.title, { weight: "bold", anchor: "middle", gap: 1 });
    if (lots.length) c.text(`${lots.length === 1 ? cap.lot : "Lots"} ${lots.join(", ")}`, T.heading, { weight: "bold", anchor: "middle", gap: 0.6 });
    c.text(`${cap.planOf} ${orBlank(s.landName)}`, T.body, { anchor: "middle" });
    const where = [s.village.trim(), s.pattu.trim(), s.korale.trim(), s.gnDivision.trim() && `${s.gnDivision.trim()} GN Division`, s.dsDivision.trim() && `${s.dsDivision.trim()} DS Division`, s.district.trim() && `${s.district.trim()} District`, s.province.trim() && `${s.province.trim()} Province`].filter(Boolean).join(", ");
    c.text(`${cap.situatedAt} ${where || BLANK}`, T.body, { anchor: "middle", gap: 0.6 });
    if (!input.approval) c.text("DRAFT. Not certified: the plan is certified only by the licensed surveyor's signature on the printed sheet.", T.small, { color: "red", anchor: "middle" });
    c.rule(t.lines.panel);
  });

  panels.push((c) => {
    c.text(cap.extent, T.heading, { weight: "bold" });
    if (area !== null) {
      c.text(formatArp(toArp(area, doc.settings.perchDecimals)), T.title * 0.86, { weight: "bold" });
      c.text(`${fmt(fromSquareMetres(area, "ha"), 4)} ha, ${fmt(area, 2)} m²`, T.body);
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
    const used = usedCodes(doc, input.lots, input.points);
    if (used.length === 0) c.text("No codes used yet.", T.body, { color: "muted" });
    for (const e of used) c.text(`${e.code}  ${e.meaning || "(not in the code library)"}`, T.body);
    if (codesAreCommonList(doc.codes) && used.length > 0) c.text("Common usage, not yet reviewed by the surveyor.", T.small, { color: "red" });
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

export interface OverleafStyle {
  w: number;
  h: number;
  m: number;
  text: { heading: number; body: number; tableBody: number; small: number };
  frame: number;
  thin: number;
  planCaption: string;
  /** Degrees of lean for the sheet's lettering, or 0. */
  slant?: number;
  /** Shown under the plan number on every overleaf page, e.g. "DRAFT …". */
  banner?: { text: string; color: SceneColor } | null;
  /** Extra lines after the areas: the grid, the bearing convention, the engine. */
  notes?: string[];
  /** Extents written as on the classic sheet's face: hectares to 5 decimals and "0 A. 2 R. 04.60 P.". */
  classicExtent?: boolean;
}

/**
 * The boundaries schedule overleaf: for each lot its legs (from, to, bearing,
 * distance) and area, the coordinates of every corner used, and the entire
 * land's extent. Pages break as needed, repeating each table's header.
 */
export function overleafPages(input: ComposeInput, st: OverleafStyle): SheetPage[] {
  const { document: doc } = input;
  // The same figures in the same words as the front page, so the two never read differently.
  const extentWords = (a: number) =>
    st.classicExtent ? `${hectares(a)} Hectares ( ${arpClassic(toArp(a, doc.settings.perchDecimals))} )` : `${fmt(fromSquareMetres(a, "ha"), 6)} ha, ${formatArp(toArp(a, doc.settings.perchDecimals))}`;
  const usable = input.lots.lots.filter((r) => r.parcel && r.parcel.vertices.length >= 3);
  if (usable.length === 0) return [];
  const { w, h, m } = st;
  const T = st.text;
  const rowH = T.tableBody * 1.55;
  const pages: SheetPage[] = [];
  let items: SceneItem[] = [];
  let y = 0;
  const top = m + 6;
  const bottom = h - m - 8;
  const left = m + 6;
  const right = w - m - 6;
  const span = right - left;
  const slant = st.slant ? { slant: st.slant } : {};
  const header = () => {
    items.push({ kind: "path", points: [[m, m], [w - m, m], [w - m, h - m], [m, h - m]], closed: true, width: st.frame, color: "ink", layer: "SHEET" });
    items.push({ kind: "text", x: left, y: top + T.heading, text: `${st.planCaption} ${orBlank(doc.sheet.planNumber)}`, size: T.heading, weight: "bold", font: "sans", anchor: "start", rotate: 0, color: "ink", layer: "TITLE", ...slant });
    items.push({ kind: "text", x: right, y: top + T.heading, text: "Boundaries schedule", size: T.heading, weight: "regular", font: "sans", anchor: "end", rotate: 0, color: "muted", layer: "TITLE", ...slant });
    y = top + T.heading + 3;
    if (st.banner) {
      y += T.small * 1.4;
      items.push({ kind: "text", x: left, y, text: st.banner.text, size: T.small, weight: "regular", font: "sans", anchor: "start", rotate: 0, color: st.banner.color, layer: "TITLE" });
    }
    y += 3;
  };
  const newPage = () => {
    if (items.length) pages.push({ widthMm: w, heightMm: h, role: "overleaf", items });
    items = [];
    header();
  };
  const heading = (s: string) => {
    if (y + rowH * 3 > bottom) newPage();
    y += T.heading * 1.4;
    items.push({ kind: "text", x: left, y, text: s, size: T.heading, weight: "bold", font: "sans", anchor: "start", rotate: 0, color: "ink", layer: "TITLE", ...slant });
    y += 2;
  };
  const table = (cols: { title: string; x: number; anchor: "start" | "end" }[], rows: string[][]) => {
    const head = () => {
      y += rowH;
      for (const col of cols) items.push({ kind: "text", x: col.x, y, text: col.title, size: T.tableBody, weight: "bold", font: "sans", anchor: col.anchor, rotate: 0, color: "ink", layer: "TITLE" });
      items.push({ kind: "path", points: [[left, y + 1], [right, y + 1]], closed: false, width: st.thin, color: "ink", layer: "SHEET" });
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
  const paragraph = (l: string) => {
    for (const part of wrap(l, T.body, span)) {
      if (y + rowH > bottom) newPage();
      y += T.body * 1.4;
      items.push({ kind: "text", x: left, y, text: part, size: T.body, weight: "regular", font: "sans", anchor: "start", rotate: 0, color: "ink", layer: "TITLE" });
    }
  };

  newPage();
  for (const r of usable) {
    const p = r.parcel!;
    heading(`Lot ${lotName(r.lot)}${r.lot.note.trim() ? ` (${r.lot.note.trim()})` : ""}`);
    table(
      [
        { title: "From", x: left, anchor: "start" },
        { title: "To", x: left + span * 0.2, anchor: "start" },
        { title: "Bearing", x: left + span * 0.66, anchor: "end" },
        { title: "Distance (m)", x: right, anchor: "end" },
      ],
      p.legs.map((l) => [l.from.pointId, l.to.pointId, l.bearing === null ? "" : formatDms(toDms(l.bearing, doc.settings.secondDecimals)), fmt(l.distance, doc.settings.distanceDecimals)]),
    );
    paragraph(`Area ${fmt(p.areaM2, 3)} m², ${extentWords(p.areaM2)}. Perimeter ${fmt(p.perimeterM, 3)} m.`);
  }

  const seen = new Set<string>();
  const corners = usable.flatMap((r) => r.parcel!.vertices).filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
  heading("Coordinates of the corners");
  table(
    [
      { title: "Point", x: left, anchor: "start" },
      { title: "Easting (m)", x: left + span * 0.42, anchor: "end" },
      { title: "Northing (m)", x: left + span * 0.66, anchor: "end" },
      { title: "Elevation (m)", x: left + span * 0.84, anchor: "end" },
      { title: "Code", x: right, anchor: "end" },
    ],
    corners.map((p) => [p.pointId, fmt(p.e, 3), fmt(p.n, 3), p.z === null ? "" : fmt(p.z, 3), p.code ?? ""]),
  );

  heading("Extent");
  const total = entireAreaM2(input.lots);
  if (total !== null) paragraph(`Entire land: ${fmt(total, 3)} m², ${extentWords(total)}, by the coordinate method on grid coordinates.`);
  paragraph("1 perch = 25.29285264 m² (from the international yard); 40 perches = 1 rood; 4 roods = 1 acre.");
  if (doc.sheet.statedExtent.trim()) paragraph(`Stated extent (as given, not computed): ${doc.sheet.statedExtent.trim()}.`);
  for (const n of st.notes ?? [BEARING_CONVENTION, `Computed by ${SURVEY_ENGINE_VERSION}.`]) paragraph(n);
  pages.push({ widthMm: w, heightMm: h, role: "overleaf", items });
  return pages;
}
