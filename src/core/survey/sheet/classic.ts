/**
 * The classic Sri Lankan plan sheet (stage 191, ADR 0203), laid out as
 * practising surveyors' plans are (docs/survey/REFERENCE_PLANS_ANALYSIS.md):
 * surveyor top left, plan number top right, the needle north arrow, the
 * drawing with marks, roads and adjoining lands, the Reference legend bottom
 * left, then "Scale:-", "PLAN", the title sentence, district and province,
 * the bounded-as-follows lines, the extent in hectares and acres-roods-perches,
 * the dates, the statement and the signature block. Bearings, distances and
 * coordinates go overleaf.
 *
 * Paper and scale are chosen automatically unless the surveyor fixed them:
 * 1:500 first, on A4 then A3, then the next standard scale; A2 only when
 * nothing smaller fits.
 */
import { BEARING_CONVENTION } from "../angles";
import { codesAreCommonList } from "../codes";
import { lotName, PAPER_SIZES, type PaperSize } from "../document";
import { titleSentence, regionLine, type Run } from "../description";
import { deedExtentFace } from "../deed-extent";
import { arpClassic, dotDate, hectares } from "../formats";
import { bounds } from "../geometry";
import type { Finding } from "../qc";
import { fmt, toArp } from "../units";
import { SURVEY_ENGINE_VERSION } from "../version";
import { BLANK, commonFindings, drawCtx, drawnExtent, entireAreaM2, overleafPages, plotStamp, usedCodes, type ComposeInput, type ComposedSheet } from "./compose";
import { atPage, drawAdjoining, drawCheckLine, drawCorners, drawFeatures, drawLoosePoints, drawLotLabels, drawLots, drawNeedleNorth, drawRoads, quadsOverlap, textQuad, type DrawCtx } from "./draw";
import { advanceWidth, textWidth, wrap, type SceneColor, type SceneItem, type SceneText, type SheetPage, type Viewport } from "./scene";
import { SRI_LANKA_CLASSIC_V1 as T } from "./template";

const PREFERRED_SCALES = [500, 1000, 1250, 2000, 2500, 4000, 5000, 10000] as const;

interface Frame {
  paper: PaperSize;
  w: number;
  h: number;
  m: number;
  /** Frame inner box. */
  x0: number;
  y0: number;
  fw: number;
  fh: number;
  size: { region: number; heading: number; planNumber: number; lotLabel: number; description: number; body: number; label: number; small: number };
}

function frameFor(paper: PaperSize, landscape: boolean): Frame {
  const [a, b] = PAPER_SIZES[paper];
  const [w, h] = landscape ? [b, a] : [a, b];
  const m = T.margin[paper];
  const fh = h - 2 * m;
  const size = Object.fromEntries(Object.entries(T.text).map(([k, v]) => [k, Math.round(v * fh * 100) / 100])) as Frame["size"];
  return { paper, w, h, m, x0: m, y0: m, fw: w - 2 * m, fh, size };
}

/** Words with styles, wrapped and centred; lot suffixes raised. Returns the lines as scene text and the height used. */
function centredRuns(runs: Run[], cx: number, top: number, width: number, size: number, slant: number, lineGap = 1.42): { items: SceneText[]; height: number; tooWide: boolean } {
  type Tok = { text: string; style: Run["style"] };
  const toks: Tok[] = runs.flatMap((r) => (r.style === "sup" ? [{ text: r.text, style: r.style }] : r.text.split(/(\s+)/).filter(Boolean).map((t) => ({ text: t, style: r.style }))));
  const sizeOf = (t: Tok) => (t.style === "sup" ? size * 0.62 : size);
  // Wrapping uses the safe width; placing pieces one after another uses the font's own advance, so nothing drifts apart.
  const widthOf = (t: Tok) => textWidth(t.text, sizeOf(t));
  const advanceOf = (t: Tok) => advanceWidth(t.text, sizeOf(t));
  const lines: Tok[][] = [];
  let line: Tok[] = [];
  let lw = 0;
  let tooWide = false;
  for (const t of toks) {
    const tw = widthOf(t);
    if (/^\s+$/.test(t.text) && line.length === 0) continue;
    if (lw + tw > width && line.length > 0 && !/^\s+$/.test(t.text)) {
      while (line.length && /^\s+$/.test(line[line.length - 1]!.text)) line.pop();
      lines.push(line);
      line = [];
      lw = 0;
    }
    if (/^\s+$/.test(t.text) && line.length === 0) continue;
    line.push(t);
    lw += tw;
    if (tw > width) tooWide = true;
  }
  while (line.length && /^\s+$/.test(line[line.length - 1]!.text)) line.pop();
  if (line.length) lines.push(line);
  const items: SceneText[] = [];
  let y = top;
  for (const l of lines) {
    y += size * lineGap;
    const total = l.reduce((s, t) => s + advanceOf(t), 0);
    let x = cx - total / 2;
    // Join neighbouring words of one style into one text item.
    let i = 0;
    while (i < l.length) {
      const style = l[i]!.style;
      let s = "";
      while (i < l.length && l[i]!.style === style && (style !== "sup" || s === "")) s += l[i++]!.text;
      const sz = style === "sup" ? size * 0.62 : size;
      items.push({ kind: "text", x, y: style === "sup" ? y - size * 0.42 : y, text: s, size: sz, weight: style === "name" ? "bold" : "regular", font: "sans", anchor: "start", rotate: 0, color: "ink", layer: "TITLE", ...(slant ? { slant } : {}) });
      x += advanceWidth(s, sz);
    }
  }
  return { items, height: y - top + size * 0.35, tooWide };
}

function addressLines(address: string): string[] {
  const byLine = address.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine.slice(0, 4);
  return address.split(/,\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
}

export function composeClassic(input: ComposeInput): ComposedSheet {
  const { document: doc } = input;
  const s = doc.sheet;
  const cap = T.captions;
  const findings: Finding[] = [];
  const slant = doc.settings.slant ? T.slant : 0;
  const landscape = doc.settings.orientation === "landscape";
  const extract = s.extractOf ? (doc.lots.find((l) => l.id === s.extractOf) ?? null) : null;
  const byId = new Map(input.points.map((p) => [p.id, p]));
  const b = bounds(drawnExtent(doc, byId));
  const used = usedCodes(doc, input.lots, input.points);

  // --- Layout for one paper: bands top to bottom, measured from the content.
  const plan = (f: Frame) => {
    const z = f.size;
    const left = f.x0 + f.fw * 0.03;
    const right = f.x0 + f.fw * 0.97;
    const items: SceneItem[] = [];
    const t = (x: number, y: number, value: string, size: number, opts: Partial<{ anchor: SceneText["anchor"]; weight: SceneText["weight"]; color: SceneColor; upright: boolean; entity: string }> = {}): SceneText => {
      const it: SceneText = { kind: "text", x, y, text: value, size, weight: opts.weight ?? "regular", font: "sans", anchor: opts.anchor ?? "start", rotate: 0, color: opts.color ?? "ink", layer: "TITLE", ...(slant && !opts.upright ? { slant } : {}), ...(opts.entity ? { entity: opts.entity } : {}) };
      items.push(it);
      return it;
    };
    let tooWide = false;

    // Header: surveyor top left, plan number top right, the draft notice between them.
    const sv = input.surveyor;
    let hy = f.y0 + f.fh * 0.012;
    const surveyorLines = sv ? [sv.name, sv.designation, ...addressLines(sv.address)].filter((x) => x.trim()) : [];
    if (surveyorLines.length === 0) {
      hy += z.body * 1.35;
      t(left, hy, "Surveyor not chosen yet", z.body, { color: "muted" });
    }
    surveyorLines.forEach((line, i) => {
      hy += z.body * 1.35;
      t(left, hy, line, z.body, { weight: i === 0 ? "bold" : "regular", entity: "surveyor" });
      if (textWidth(line, z.body) > f.fw * 0.42) tooWide = true;
    });
    const pnY = f.y0 + f.fh * 0.012 + z.planNumber * 1.3;
    t(right - f.fw * 0.05, pnY, `${cap.planNumber}${s.planNumber.trim() || BLANK}`, z.planNumber, { anchor: "end", entity: "plan-number" });
    if (textWidth(`${cap.planNumber}${s.planNumber.trim()}`, z.planNumber) > f.fw * 0.45) tooWide = true;
    let headerBottom = Math.max(hy, pnY) + z.body * 0.8;
    if (extract) {
      t(right - f.fw * 0.05, pnY + z.planNumber * 1.25, `${cap.extractOf} ${lotName(extract)}`, z.body * 1.15, { anchor: "end", color: "red" });
      headerBottom = Math.max(headerBottom, pnY + z.planNumber * 1.25 + z.body * 0.8);
    }
    if (!input.approval) {
      const draft = wrap(input.blockOut ? cap.blockOutNotice : "DRAFT. Not certified: the plan is certified only by the licensed surveyor's signature on the printed sheet.", z.small, f.fw * 0.3);
      let dy = f.y0 + f.fh * 0.012;
      for (const l of draft) {
        dy += z.small * 1.3;
        t(f.x0 + f.fw * 0.5, dy, l, z.small, { anchor: "middle", color: "red", upright: true });
      }
      headerBottom = Math.max(headerBottom, dy + z.small);
    }

    // Footer, built upwards from the frame's bottom.
    let y = f.y0 + f.fh - f.fh * 0.012;
    const footer: SceneItem[] = [];
    const ft = (x: number, yy: number, value: string, size: number, opts: Partial<{ anchor: SceneText["anchor"]; weight: SceneText["weight"]; color: SceneColor; entity: string; upright: boolean }> = {}) =>
      footer.push({ kind: "text", x, y: yy, text: value, size, weight: opts.weight ?? "regular", font: "sans", anchor: opts.anchor ?? "start", rotate: 0, color: opts.color ?? "ink", layer: "TITLE", ...(slant && !opts.upright ? { slant } : {}), ...(opts.entity ? { entity: opts.entity } : {}) });
    // Signature block, bottom right: name, designation, date.
    const sigX = f.x0 + f.fw * 0.68;
    const sigLines = [sv?.name.trim() || BLANK, sv?.designation.trim() || BLANK, s.planDate.trim() ? dotDate(s.planDate) : BLANK];
    const sigTop = y - sigLines.length * z.body * 1.35;
    sigLines.forEach((l, i) => ft(sigX, sigTop + (i + 1) * z.body * 1.35, l, z.body, { entity: "signature" }));
    if (sigLines.some((l) => textWidth(l, z.body) > f.fw * 0.3)) tooWide = true;
    // Statement and the overleaf pointer, bottom left.
    const leftLines = [...wrap(s.statement.trim(), z.body, f.fw * 0.42), "", ...(doc.settings.overleaf ? wrap(cap.overleaf, z.body, f.fw * 0.42) : [])].filter((l, i, a) => l || (i > 0 && i < a.length - 1));
    const leftTop = y - leftLines.length * z.body * 1.35;
    leftLines.forEach((l, i) => l && ft(left, leftTop + (i + 1) * z.body * 1.35, l, z.body));
    y = Math.min(sigTop, leftTop) - z.body * 0.6;
    // Survey dates, centre right, above the signature.
    const surveyed = s.surveyDate.trim();
    const parted = s.partitionDate.trim();
    // A block-out plan isn't surveyed yet, so it has no survey dates.
    const dates = input.blockOut ? [] : surveyed && parted && dotDate(surveyed) === dotDate(parted) ? [`${cap.surveyedAndPartitioned} ${dotDate(surveyed)}`] : [surveyed ? `${cap.surveyedOn} ${dotDate(surveyed)}` : `${cap.surveyedOn} ${BLANK}`, ...(parted ? [`${cap.partitionedOn} ${dotDate(parted)}`] : [])];
    for (let i = dates.length - 1; i >= 0; i--) {
      ft(f.x0 + f.fw * 0.56, y, dates[i]!, z.body, { anchor: "start", entity: "dates" });
      y -= z.body * 1.35;
    }
    // Extent.
    // The deed's extent when the surveyor chose it for the whole plan (ADR 0252), else the extent computed from the survey.
    // One rule (deed-extent.ts) decides it for the face, the schedule and the checks alike.
    const deed = deedExtentFace(doc, input.lots);
    const area = deed.shown ? deed.stated.m2 : extract ? (input.lots.lots.find((r) => r.lot.id === extract.id)?.parcel?.areaM2 ?? null) : entireAreaM2(input.lots);
    const perchDecimals = deed.shown ? deed.perchDecimals : doc.settings.perchDecimals;
    const extentText = area !== null ? `${cap.extent} ${hectares(area)} ${cap.hectares} ( ${arpClassic(toArp(area, perchDecimals))} )` : `${cap.extent} ${BLANK} ${cap.hectares}`;
    y -= z.body * 0.4;
    ft(f.x0 + f.fw * 0.5, y, extentText, z.body, { anchor: "middle", entity: "extent" });
    y -= z.body * 1.8;
    // Bounded as follows, with the ":-" in one column and hanging lines.
    const sides: [string, string][] = [
      [cap.north, s.boundaries.north],
      [cap.east, s.boundaries.east],
      [cap.south, s.boundaries.south],
      [cap.west, s.boundaries.west],
    ];
    const labelW = Math.max(...sides.map(([l]) => textWidth(l, z.body)));
    const colonX = left + f.fw * 0.03 + labelW + z.body * 1.2;
    const textX = colonX + textWidth(`${cap.by} `, z.body) + z.body * 0.6;
    // One row per printed line: the first carries "North by" and ":-", wrapped lines hang under the text.
    const bounded: { x: number; text: string }[][] = sides.flatMap(([label, value]) =>
      wrap(value.trim() || BLANK, z.body, right - textX).map((l, i) =>
        i === 0
          ? [
              { x: left + f.fw * 0.03, text: label },
              { x: colonX, text: cap.by },
              { x: textX, text: l },
            ]
          : [{ x: textX, text: l }],
      ),
    );
    for (let i = bounded.length - 1; i >= 0; i--) {
      for (const piece of bounded[i]!) ft(piece.x, y, piece.text, z.body, { entity: "boundaries" });
      y -= z.body * 1.35;
    }
    ft(left, y, extract ? cap.lotBounded.replace("{lot}", lotName(extract)) : cap.entireBounded, z.body, { entity: "boundaries" });
    y -= z.region * 1.3;
    // District and province, upright capitals.
    ft(f.x0 + f.fw * 0.5, y, regionLine(s.province, "PROVINCE"), z.region, { anchor: "middle", entity: "region", upright: true });
    y -= z.region * 1.25;
    ft(f.x0 + f.fw * 0.5, y, regionLine(s.district, "DISTRICT"), z.region, { anchor: "middle", entity: "region", upright: true });
    y -= z.region * 0.9;
    // The title sentence, centred, measured top-down into the space above.
    const sentence = centredRuns(titleSentence(s, doc.lots, extract), f.x0 + f.fw * 0.5, 0, f.fw * 0.86, z.description, slant);
    if (sentence.tooWide) tooWide = true;
    const sentenceTop = y - sentence.height;
    for (const it of sentence.items) footer.push({ ...it, y: it.y + sentenceTop, entity: "title" });
    y = sentenceTop - z.heading * 0.3;
    ft(f.x0 + f.fw * 0.5, y, input.blockOut ? cap.blockOutHeading : cap.heading, z.heading, { anchor: "middle", weight: "bold", entity: "heading", upright: true });
    y -= z.heading * 1.25;
    const scaleY = y;
    y -= z.body * 1.6;
    const titleTop = y;

    // The drawing band, between the header and the title block, less a strip for the legend and notes.
    const legendRows = used.length > 0 ? used.length + (codesAreCommonList(doc.codes) && !doc.provenance["codes"]?.reviewed ? 1 : 0) : 0;
    const notes = [...doc.notes, ...(input.scheduledLegs ? [input.scheduledLegs.note] : [])].flatMap((n) => wrap(`${cap.note} ${n}`, z.label, f.fw * 0.4));
    const legendH = legendRows > 0 || notes.length ? (legendRows > 0 ? z.label * 2.2 + legendRows * z.label * 1.3 : 0) + notes.length * z.label * 1.3 + z.label : 0;
    const bandTop = headerBottom + f.fh * 0.01;
    const vp = { x: f.x0 + f.fw * 0.05, y: bandTop, w: f.fw * 0.8, h: Math.max(0, titleTop - bandTop - legendH) };
    return { f, items, footer, vp, legendH, legendTop: titleTop - legendH, scaleY, titleTop, tooWide, notes, bandTop };
  };

  // --- Paper and scale.
  const papers: PaperSize[] = doc.settings.paper === "auto" ? ["A4", "A3"] : [doc.settings.paper];
  const fits = (lay: ReturnType<typeof plan>, scale: number) => !b || ((b.maxE - b.minE) * 1000) / scale <= lay.vp.w * 0.9 && ((b.maxN - b.minN) * 1000) / scale <= lay.vp.h * 0.88;
  let chosen: { lay: ReturnType<typeof plan>; scale: number | null } | null = null;
  let suggested: number | null = null;
  const tryScales = doc.settings.scale ? [doc.settings.scale] : [...PREFERRED_SCALES];
  for (const pass of doc.settings.paper === "auto" ? [papers, ["A2" as PaperSize]] : [papers]) {
    for (const scale of tryScales) {
      for (const p of pass) {
        const lay = plan(frameFor(p, landscape));
        if (fits(lay, scale)) {
          chosen = { lay, scale };
          break;
        }
      }
      if (chosen) break;
    }
    if (chosen) break;
  }
  if (b && !doc.settings.scale) {
    for (const scale of PREFERRED_SCALES) {
      if (fits(chosen?.lay ?? plan(frameFor(papers[0]!, landscape)), scale)) {
        suggested = scale;
        break;
      }
    }
  }
  if (!chosen) {
    // Nothing fits: lay out on the largest paper allowed and report it.
    const lay = plan(frameFor(doc.settings.paper === "auto" ? "A2" : doc.settings.paper, landscape));
    chosen = { lay, scale: b ? (doc.settings.scale ?? null) : null };
    if (b) {
      findings.push(
        doc.settings.scale
          ? { code: "DRAWING_OFF_SHEET", severity: "error", message: `At 1:${doc.settings.scale} the drawing doesn't fit the sheet.`, target: { kind: "sheet" }, action: "Choose a smaller scale, a larger sheet, or Automatic.", blocks: ["export"] }
          : { code: "SCALE_TOO_LARGE_AREA", severity: "error", message: "The drawing is too large for any standard scale on this sheet.", target: { kind: "sheet" }, action: "Choose a larger sheet.", blocks: ["export"] },
      );
    }
  }
  const { lay } = chosen;
  const { f } = lay;
  const scale = chosen.scale;
  const z = f.size;
  const front: SceneItem[] = [{ kind: "path", points: [[f.x0, f.y0], [f.x0 + f.fw, f.y0], [f.x0 + f.fw, f.y0 + f.fh], [f.x0, f.y0 + f.fh]], closed: true, width: T.lines.frame, color: "ink", layer: "SHEET" }];
  front.push(...lay.items);

  // --- The drawing.
  const drawing: SceneItem[] = [];
  let viewport: Viewport | null = null;
  let drawingCtx: DrawCtx | null = null;
  const needle = { x: f.x0 + f.fw * 0.92, top: lay.bandTop + f.fh * 0.01, h: f.fh * 0.13 };
  const checkLine = f.fw * 0.5 >= 104 ? { x: f.x0 + f.fw * 0.97 - 100, y: lay.titleTop - z.small * 1.2 } : null;
  if (b && scale) {
    viewport = { ...lay.vp, scale, centreE: (b.minE + b.maxE) / 2, centreN: (b.minN + b.maxN) / 2 };
    // Text in the drawing stays inside the frame and above the Reference and title block.
    const ctx = drawCtx(drawing, viewport, input, { label: z.label, small: z.small, lotLabel: z.lotLabel, body: z.body, heading: z.heading }, { boundary: T.lines.boundary, feature: T.lines.feature, thin: T.lines.thin }, slant, [f.x0 + 1, lay.bandTop, f.x0 + f.fw - 1, lay.vp.y + lay.vp.h]);
    drawingCtx = ctx;
    // The north arrow and the check line are drawn later, outside this context: reserve their room first.
    ctx.placer.add([[needle.x - needle.h * 0.2, needle.top], [needle.x + needle.h * 0.2, needle.top], [needle.x + needle.h * 0.2, needle.top + needle.h], [needle.x - needle.h * 0.2, needle.top + needle.h]]);
    if (checkLine) ctx.placer.add([[checkLine.x, checkLine.y - z.small * 2], [checkLine.x + 100, checkLine.y - z.small * 2], [checkLine.x + 100, checkLine.y + 1], [checkLine.x, checkLine.y + 1]]);
    drawRoads(ctx, doc.roads);
    drawLots(ctx, input.lots, { legLabels: doc.settings.faceDimensions, highlight: extract?.id ?? null, secondDecimals: doc.settings.secondDecimals, distanceDecimals: doc.settings.distanceDecimals, scheduled: input.scheduledLegs?.keys });
    const first = input.lots.lots.find((r) => r.parcel && r.parcel.vertices.length >= 3)?.parcel;
    drawFeatures(ctx, first ? atPage(ctx, first.labelAt) : null);
    drawCorners(ctx, input.lots, { numbers: doc.settings.faceDimensions, circles: true });
    drawLoosePoints(ctx, input.points, input.lots);
    drawLotLabels(ctx, input.lots, { extentUnder: null, highlight: extract?.id ?? null });
    drawAdjoining(ctx, doc.adjoining, input.lots);
    front.push(...drawing);
  }
  // North needle, right of the drawing band.
  {
    const ctx = drawCtx(front, viewport ?? { ...lay.vp, scale: 500, centreE: 0, centreN: 0 }, input, { label: z.label, small: z.small, lotLabel: z.lotLabel, body: z.body, heading: z.heading }, { boundary: T.lines.boundary, feature: T.lines.feature, thin: T.lines.thin }, slant);
    drawNeedleNorth(ctx, needle.x, needle.top, needle.h);
    // The 100 mm check line, in the legend strip's right when there's room.
    if (checkLine) drawCheckLine(ctx, checkLine.x, checkLine.y);
  }

  // Reference legend and notes, bottom left of the drawing band.
  let ly = lay.legendTop + z.label;
  const lx = f.x0 + f.fw * 0.04;
  if (used.length > 0) {
    ly += z.label * 1.3;
    front.push({ kind: "text", x: lx + f.fw * 0.03, y: ly, text: T.captions.reference, size: z.label, weight: "bold", font: "sans", anchor: "start", rotate: 0, color: "ink", layer: "TITLE", ...(slant ? { slant } : {}) });
    const rw = textWidth(T.captions.reference, z.label);
    front.push({ kind: "path", points: [[lx + f.fw * 0.03, ly + z.label * 0.3], [lx + f.fw * 0.03 + rw, ly + z.label * 0.3]], closed: false, width: T.lines.thin, color: "ink", layer: "TITLE" });
    ly += z.label * 0.6;
    const codeW = Math.max(...used.map((u) => textWidth(u.code, z.label)));
    for (const u of used) {
      ly += z.label * 1.3;
      front.push({ kind: "text", x: lx, y: ly, text: u.code, size: z.label, weight: "regular", font: "sans", anchor: "start", rotate: 0, color: "ink", layer: "TITLE", entity: "legend", ...(slant ? { slant } : {}) });
      front.push({ kind: "text", x: lx + codeW + z.label * 2.5, y: ly, text: u.meaning || "(not in the code library)", size: z.label, weight: "regular", font: "sans", anchor: "start", rotate: 0, color: u.meaning ? "ink" : "red", layer: "TITLE", entity: "legend", ...(slant ? { slant } : {}) });
    }
  }
  // The common code list isn't an official one: until the surveyor checks it, the sheet says so.
  if (used.length > 0 && codesAreCommonList(doc.codes) && !doc.provenance["codes"]?.reviewed) {
    ly += z.label * 1.3;
    front.push({ kind: "text", x: lx, y: ly, text: "Codes from the common list, not yet checked by the surveyor.", size: z.small, weight: "regular", font: "sans", anchor: "start", rotate: 0, color: "red", layer: "TITLE", entity: "legend", ...(slant ? { slant } : {}) });
  }
  for (const n of lay.notes) {
    ly += z.label * 1.3;
    front.push({ kind: "text", x: lx, y: ly, text: n, size: z.label, weight: "regular", font: "sans", anchor: "start", rotate: 0, color: "ink", layer: "TITLE", entity: "notes", ...(slant ? { slant } : {}) });
  }

  // Scale line, then the title block.
  front.push({ kind: "text", x: f.x0 + f.fw * 0.5, y: lay.scaleY, text: `${T.captions.scale} ${scale ? `1:${fmt(scale, 0)}` : BLANK}`, size: z.body, weight: "regular", font: "sans", anchor: "middle", rotate: 0, color: "ink", layer: "TITLE", entity: "scale", ...(slant ? { slant } : {}) });
  front.push(...lay.footer);

  if (lay.tooWide) {
    findings.push({ code: "TEXT_OVERFLOW", severity: "error", message: "Some of the sheet's text is wider than the sheet.", target: { kind: "sheet" }, action: "Shorten the longest word or line, or choose a larger sheet.", blocks: ["export"] });
  }
  if (b && lay.vp.h < f.fh * 0.2) {
    findings.push({ code: "TEXT_OVERFLOW", severity: "error", message: "The title block leaves too little room for the drawing.", target: { kind: "sheet" }, action: "Shorten the description or the boundaries, or choose a larger sheet.", blocks: ["export"] });
  }

  const crsLine = !input.crs
    ? "Coordinate system: not set."
    : input.crs.kind === "local"
      ? `Coordinates: ${input.crs.name}.${input.crsConfirmation ? ` ${input.crsConfirmation}.` : ""}`
      : `Grid: ${input.crs.name}${input.crs.epsg ? ` (EPSG:${input.crs.epsg})` : ""}. ${input.crsConfirmation ? `${input.crsConfirmation}.` : "Not confirmed by a person."}`;
  front.push(plotStamp(input, f.w, f.h, f.m, Math.max(1.5, z.small * 0.8)));
  const pages: SheetPage[] = [{ widthMm: f.w, heightMm: f.h, role: "front", items: front }];
  if (doc.settings.overleaf) {
    pages.push(
      ...overleafPages(input, {
        w: f.w,
        h: f.h,
        m: f.m,
        text: { heading: z.body * 1.2, body: z.body, tableBody: z.body, small: z.small },
        classicExtent: true,
        frame: T.lines.frame,
        thin: T.lines.thin,
        planCaption: T.captions.planNumber,
        slant,
        banner: input.approval ? null : { text: input.blockOut ? cap.blockOutNotice : "DRAFT. Not certified: the plan is certified only by the licensed surveyor's signature on the printed sheet.", color: "red" },
        notes: [crsLine, `${BEARING_CONVENTION} Distances are horizontal grid distances in metres.`, scale ? `Scale 1:${fmt(scale, 0)} on ${f.paper}. Print at 100% (actual size): fitting to the page changes the scale.` : "", `Prepared with Farbaek Survey Studio (${SURVEY_ENGINE_VERSION}).`].filter(Boolean),
      }),
    );
  }
  // Drawing text that covers the Reference, the notes or the title block.
  const titleBoxes = front.filter((i): i is SceneText => i.kind === "text" && (i.layer === "TITLE" || i.layer === "SHEET")).map(textQuad);
  const onTitle = drawing.filter((i): i is SceneText => i.kind === "text").filter((t) => titleBoxes.some((q) => quadsOverlap(textQuad(t), q)));
  if (onTitle.length > 0) {
    findings.push({ code: "LABELS_ON_TITLE", severity: "warning", message: `${onTitle.length === 1 ? "A label in the drawing covers" : `${onTitle.length} labels in the drawing cover`} the Reference or the title.`, target: { kind: "sheet" }, detail: onTitle.slice(0, 4).map((t) => `"${t.text.slice(0, 30)}"`).join(", "), action: "Drag it clear in the editor, or choose a larger sheet or scale.", blocks: [] });
  }
  commonFindings(pages, drawing, scale, findings, { inner: [f.x0, f.y0, f.x0 + f.fw, f.y0 + f.fh], ctx: drawingCtx });
  return { pages, viewport, scale, suggestedScale: suggested, paper: f.paper, findings };
}
