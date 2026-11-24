/**
 * DXF export as AutoCAD R12 (AC1009) ASCII, the most widely readable DXF
 * (ADR 0200; research notes: R12 needs no handles or object dictionaries,
 * so the widest range of readers open it).
 *
 * Model space holds the real grid coordinates in metres: easting as X,
 * northing as Y. R12 has no units header variable, so the units and the
 * coordinate system are written into the drawing as a note on the TEXT layer.
 * Text heights are paper millimetres at the plan's scale, in metres.
 *
 * Text is ASCII: "%%d" is the degree sign every DXF reader understands, and
 * any other non-ASCII character is written as a \U+XXXX escape.
 */
import { formatDms, toDms } from "../angles";
import { bulges, densify } from "../arcs";
import { curveOfLeg, densifyRing, ringBulges } from "../lotcurves";
import { codeOf, lookupCode } from "../codes";
import type { CrsRecord } from "../crs";
import { legIndex, type LayerId, type SurveyDocument } from "../document";
import type { PlanLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import { roadCentreline } from "../roads";
import { RUN_ON_MM } from "../sheet/draw";
import { fmt, formatArp, roundTo, toArp } from "../units";
import { SURVEY_ENGINE_VERSION } from "../version";

/** AutoCAD colour index and line type per layer. */
const LAYER_STYLE: Record<LayerId, { color: number; ltype: "CONTINUOUS" | "DASHED" }> = {
  BOUNDARY: { color: 7, ltype: "CONTINUOUS" },
  POINTS: { color: 1, ltype: "CONTINUOUS" },
  POINT_NUMBERS: { color: 7, ltype: "CONTINUOUS" },
  DIMENSIONS: { color: 5, ltype: "CONTINUOUS" },
  LOT_TEXT: { color: 7, ltype: "CONTINUOUS" },
  BOUNDARY_MARKS: { color: 8, ltype: "CONTINUOUS" },
  BUILDINGS: { color: 7, ltype: "CONTINUOUS" },
  WALLS: { color: 7, ltype: "CONTINUOUS" },
  FENCES: { color: 3, ltype: "DASHED" },
  DRAINS: { color: 4, ltype: "DASHED" },
  ROADS: { color: 7, ltype: "CONTINUOUS" },
  UTILITIES: { color: 6, ltype: "CONTINUOUS" },
  ADJOINING: { color: 8, ltype: "CONTINUOUS" },
  TEXT: { color: 7, ltype: "CONTINUOUS" },
  TITLE: { color: 7, ltype: "CONTINUOUS" },
};

export interface DxfInput {
  document: SurveyDocument;
  points: readonly SurveyPoint[];
  lots: PlanLots;
  crs: CrsRecord | null;
  /** The plan's scale denominator, for text heights. */
  scale: number;
  projectName: string;
  /** One line saying whether the plan is a draft or approved, and whether the grid was confirmed. Written into the drawing, so it survives a renamed file. */
  status: string;
}

/** ASCII-only DXF text: degree signs as %%d, primes as ' and ", anything else non-ASCII as \U+XXXX. */
export function dxfText(s: string): string {
  return s
    .replace(/°/g, "%%d")
    .replace(/[′]/g, "'")
    .replace(/[″]/g, '"')
    .replace(/[\r\n]+/g, " ")
    .replace(/[^\x20-\x7e]/gu, (ch) => `\\U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
}

const num = (v: number, d = 4) => (Object.is(v, -0) ? 0 : v).toFixed(d);

class Writer {
  private readonly out: string[] = [];
  pair(code: number, value: string | number): void {
    this.out.push(String(code), typeof value === "number" ? String(value) : value);
  }
  toString(): string {
    return `${this.out.join("\r\n")}\r\n`;
  }
}

export function writeDxf(input: DxfInput): string {
  const { document: doc } = input;
  const byId = new Map(input.points.map((p) => [p.id, p]));
  const h = (paperMm: number) => (paperMm * input.scale) / 1000;
  const entities: ((w: Writer) => void)[] = [];
  const all: { e: number; n: number }[] = [];

  const text = (layer: LayerId, x: number, y: number, s: string, height: number, rotation = 0, centred = true) => {
    entities.push((w) => {
      w.pair(0, "TEXT");
      w.pair(8, layer);
      w.pair(10, num(x));
      w.pair(20, num(y));
      w.pair(30, "0.0");
      w.pair(40, num(height, 3));
      w.pair(1, dxfText(s));
      if (rotation) w.pair(50, num(rotation, 4));
      if (centred) {
        w.pair(72, 1);
        w.pair(11, num(x));
        w.pair(21, num(y));
        w.pair(31, "0.0");
      }
    });
  };
  const polyline = (layer: LayerId, pts: readonly { e: number; n: number }[], closed: boolean, bulge: readonly number[] = [], dashed = false) => {
    all.push(...pts);
    entities.push((w) => {
      w.pair(0, "POLYLINE");
      w.pair(8, layer);
      // A line drawn dashed whatever its layer (stage 254): its own line type, over the layer's.
      if (dashed) w.pair(6, "DASHED");
      w.pair(66, 1);
      w.pair(10, "0.0");
      w.pair(20, "0.0");
      w.pair(30, "0.0");
      w.pair(70, closed ? 1 : 0);
      pts.forEach((p, i) => {
        w.pair(0, "VERTEX");
        w.pair(8, layer);
        w.pair(10, num(p.e));
        w.pair(20, num(p.n));
        w.pair(30, "0.0");
        // A curve to the next vertex (ADR 0247): tan of a quarter of its angle, positive anticlockwise.
        if (bulge[i]) w.pair(42, num(bulge[i]!, 9));
      });
      w.pair(0, "SEQEND");
      w.pair(8, layer);
    });
  };

  for (const f of doc.features) {
    const pts = f.points.map((id) => byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
    const curves = pts.length === f.points.length ? f.arcs : undefined;
    if (pts.length >= 2) polyline(f.layer, pts, f.closed, bulges(pts, curves), f.dashed === true);
    // Carrying on past an end (stage 261): the same stub the sheet draws, its length on paper turned into ground units at the plan's scale.
    if (!f.closed && f.runsOn && pts.length >= 2) {
      const on = (RUN_ON_MM * input.scale) / 1000;
      const stub = (from: { e: number; n: number }, to: { e: number; n: number }) => {
        const len = Math.hypot(to.e - from.e, to.n - from.n) || 1;
        polyline(f.layer, [to, { e: to.e + ((to.e - from.e) / len) * on, n: to.n + ((to.n - from.n) / len) * on }], false, [], f.dashed === true);
      };
      // Along the line as drawn at its ends (a curve's end runs along its tangent, as the sheet draws it).
      const ends = densify(pts, curves, 0.002);
      if (f.runsOn === "start" || f.runsOn === "both") stub(ends[1]!, ends[0]!);
      if (f.runsOn === "end" || f.runsOn === "both") stub(ends.at(-2)!, ends.at(-1)!);
    }
    // The extent takes a curve's bulge; the code is written on the line itself, at the middle of the first segment as drawn.
    const drawnLine = densify(pts, curves, 0.05);
    if (curves) all.push(...drawnLine);
    if (pts.length >= 2 && f.code.trim()) {
      const end = curves ? drawnLine.findIndex((q) => q.e === pts[1]!.e && q.n === pts[1]!.n) : 1;
      const mid = drawnLine[Math.max(0, Math.floor((end > 0 ? end : 1) / 2))]!;
      const at = curves && end > 1 ? mid : { e: (pts[0]!.e + pts[1]!.e) / 2, n: (pts[0]!.n + pts[1]!.n) / 2 };
      text(f.layer, at.e, at.n, f.code.trim(), h(2.2));
    }
  }

  // Every lot's boundary, its corners (once each), leg labels and its label with the raised part as its own text.
  const cornerSeen = new Set<string>();
  const legSeen = new Set<string>();
  for (const r of input.lots.lots) {
    const parcel = r.parcel;
    if (!parcel || parcel.vertices.length < 2) continue;
    // A lot's curves (ADR 0276) as bulges on their legs, the arcs exactly as the plan's area takes them; their reach in the extent.
    const closed = parcel.vertices.length >= 3;
    polyline("BOUNDARY", parcel.vertices, closed, closed ? ringBulges(parcel.vertices, parcel.curves) : []);
    if (parcel.curves.length > 0) all.push(...densifyRing(parcel.vertices, parcel.curves, 0.05));
    for (const p of parcel.vertices) {
      if (cornerSeen.has(p.id)) continue;
      cornerSeen.add(p.id);
      entities.push((w) => {
        w.pair(0, "POINT");
        w.pair(8, "POINTS");
        w.pair(10, num(p.e));
        w.pair(20, num(p.n));
        w.pair(30, num(p.z ?? 0));
      });
      text("POINT_NUMBERS", p.e + h(2), p.n + h(2), p.pointId, h(2.2), 0, false);
      if (p.code && p.code.trim()) text("BOUNDARY_MARKS", p.e + h(2), p.n - h(1.5), p.code.trim(), h(1.9), 0, false);
    }
    parcel.legs.forEach((leg0, i) => {
      // A curve (ADR 0276) is labelled once, along its chord: the chord's bearing and distance, its radius and its length along the arc.
      const cv = curveOfLeg(parcel.curves, i, parcel.vertices.length);
      if (cv && !cv.first) return;
      const leg = cv ? { from: leg0.from, to: parcel.vertices[cv.curve.to % parcel.vertices.length]!, bearing: cv.curve.chordBearing, distance: cv.curve.chordDistance } : leg0;
      if (leg.bearing === null) return;
      // A leg two lots share is labelled once, by the first lot that has it.
      const legKey = leg.from.id < leg.to.id ? `${leg.from.id}|${leg.to.id}` : `${leg.to.id}|${leg.from.id}`;
      if (legSeen.has(legKey)) return;
      legSeen.add(legKey);
      let angle = (Math.atan2(leg.to.n - leg.from.n, leg.to.e - leg.from.e) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      const dd = doc.settings.distanceDecimals;
      const label = `${formatDms(toDms(leg.bearing, doc.settings.secondDecimals))} ${roundTo(leg.distance, dd).toFixed(dd)}${cv ? ` (R ${roundTo(cv.curve.radius, dd).toFixed(dd)}, arc ${roundTo(cv.curve.arcLength, dd).toFixed(dd)})` : ""}`;
      // On the lot's own side of the leg, so where one lot's corner rests on another's leg the two labels don't overlap.
      const len = Math.hypot(leg.to.e - leg.from.e, leg.to.n - leg.from.n) || 1;
      const inward = parcel.clockwise ? 1 : -1;
      const ox = ((leg.to.n - leg.from.n) / len) * h(1.8) * inward;
      const oy = (-(leg.to.e - leg.from.e) / len) * h(1.8) * inward;
      text("DIMENSIONS", (leg.from.e + leg.to.e) / 2 + ox, (leg.from.n + leg.to.n) / 2 + oy, label, h(2.2), angle);
    });
    // The lot letters left off the drawing (stage 259) are left off the DXF too, as the sheet shows it.
    if (parcel.vertices.length >= 3 && parcel.crossings.length === 0 && r.lot.label.trim() && doc.settings.noLotLetters !== true) {
      const { label, sup } = r.lot;
      text("LOT_TEXT", parcel.labelAt.e, parcel.labelAt.n + h(2), `Lot ${label}`, h(3.2));
      if (sup) text("LOT_TEXT", parcel.labelAt.e + h(3.2) * 0.62 * (`Lot ${label}`.length / 2 + 0.6), parcel.labelAt.n + h(2) + h(3.2) * 0.42, sup, h(2), 0, false);
      text("LOT_TEXT", parcel.labelAt.e, parcel.labelAt.n - h(2), formatArp(toArp(parcel.areaM2, doc.settings.perchDecimals)), h(2.4));
    }
  }

  // Marks and symbols at points that aren't lot corners, as the sheet draws them (drawLoosePoints): the point, and the code's mark, or
  // the symbol's meaning ("Well"). A symbol the plan gives a point (from the sketch, ADR 0249) comes before the point's own code.
  for (const p of input.points) {
    if (cornerSeen.has(p.id)) continue;
    const given = (doc.symbols ?? []).find((x) => x.point === p.id)?.code;
    const entry = lookupCode(doc.codes, given ?? codeOf(p.code));
    if (!entry || (entry.kind !== "mark" && entry.kind !== "symbol")) continue;
    entities.push((w) => {
      w.pair(0, "POINT");
      w.pair(8, "POINTS");
      w.pair(10, num(p.e));
      w.pair(20, num(p.n));
      w.pair(30, num(p.z ?? 0));
    });
    all.push(p);
    text("BOUNDARY_MARKS", p.e + h(2), p.n - h(1.5), entry.kind === "symbol" ? entry.meaning : entry.code, h(1.9), 0, false);
  }

  // Words the surveyor wrote on the plan (stage 255): on the Text layer, at the point or the middle of the line, turned to read along it.
  for (const t of doc.texts ?? []) {
    const a = byId.get(t.at);
    if (!a) continue;
    const b = t.along ? byId.get(t.along) : undefined;
    const at = b ? { e: (a.e + b.e) / 2, n: (a.n + b.n) / 2 } : a;
    let turn = b ? (Math.atan2(b.n - a.n, b.e - a.e) * 180) / Math.PI : 0;
    // Read left to right: a line drawn leftwards is lettered from its other end.
    if (turn > 90) turn -= 180;
    if (turn <= -90) turn += 180;
    all.push(at);
    text("TEXT", at.e, at.n, t.text, h(2.2) * (t.size ?? 1), t.turn !== undefined ? -t.turn : turn);
  }

  // The surveyor's dimension lines (stage 265, ADR 0273): the line, its extension lines and its distance from the coordinates, at
  // the sheet's offset turned into ground units at the plan's scale.
  for (const d of doc.dimensions ?? []) {
    const a = byId.get(d.from);
    const b = byId.get(d.to);
    if (!a || !b) continue;
    const len = Math.hypot(b.e - a.e, b.n - a.n);
    if (len < 0.005) continue;
    const [lx, ly] = [-(b.n - a.n) / len, (b.e - a.e) / len];
    const o = h(d.offset);
    const [a2, b2] = [{ e: a.e + lx * o, n: a.n + ly * o }, { e: b.e + lx * o, n: b.n + ly * o }];
    polyline("DIMENSIONS", [a, a2], false);
    polyline("DIMENSIONS", [b, b2], false);
    polyline("DIMENSIONS", [a2, b2], false);
    let turn = (Math.atan2(b.n - a.n, b.e - a.e) * 180) / Math.PI;
    if (turn > 90) turn -= 180;
    if (turn <= -90) turn += 180;
    // The text stands on its baseline: where its tops face the line, it goes a text's height further out, so it never crosses it.
    const away = Math.sign(d.offset || 1);
    const rad = (turn * Math.PI) / 180;
    const facesOut = (-Math.sin(rad) * lx + Math.cos(rad) * ly) * away >= 0;
    const out = (facesOut ? h(1.2) : h(1.2) + h(1.9)) * away;
    text("DIMENSIONS", (a2.e + b2.e) / 2 + lx * out, (a2.n + b2.n) / 2 + ly * out, fmt(len, doc.settings.distanceDecimals), h(1.9), turn);
  }

  // Roads: both edges, the name on the middle line.
  for (const road of doc.roads) {
    const a = road.edgeA.map((id) => byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
    const b = road.edgeB.map((id) => byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
    if (a.length >= 2) polyline("ROADS", a, false);
    if (b.length >= 2) polyline("ROADS", b, false);
    const c = roadCentreline(a, b);
    if (road.name.trim() && c.length >= 2) {
      const mid = c[Math.floor((c.length - 1) / 2)]!;
      const next = c[Math.floor((c.length - 1) / 2) + 1] ?? c[0]!;
      let angle = (Math.atan2(next.n - mid.n, next.e - mid.e) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      text("ROADS", (mid.e + next.e) / 2, (mid.n + next.n) / 2, road.name.trim(), h(2.2), angle);
    }
  }

  // Adjoining-land labels, beside the middle of their leg (only where the lot still has that leg).
  for (const adj of doc.adjoining) {
    const found = input.lots.lots.find((r) => r.lot.id === adj.lot);
    const parcel = found?.parcel;
    if (!found || !parcel || parcel.vertices.length < 3) continue;
    const k = legIndex(found.lot, adj.from, adj.to);
    if (k < 0) continue;
    const a = parcel.vertices[k]!;
    const b = parcel.vertices[(k + 1) % parcel.vertices.length]!;
    const len = Math.hypot(b.e - a.e, b.n - a.n) || 1;
    // Outside the lot: to the left of each leg on a clockwise ring, to the right on an anticlockwise one.
    const sign = parcel.clockwise ? -1 : 1;
    text("ADJOINING", (a.e + b.e) / 2 + ((b.n - a.n) / len) * h(8) * sign, (a.n + b.n) / 2 - ((b.e - a.e) / len) * h(8) * sign, adj.text, h(1.9));
  }

  // Extents, and a note under the drawing saying what the numbers are.
  const es = all.map((p) => p.e);
  const ns = all.map((p) => p.n);
  const ext = all.length ? { minE: Math.min(...es), maxE: Math.max(...es), minN: Math.min(...ns), maxN: Math.max(...ns) } : { minE: 0, maxE: 0, minN: 0, maxN: 0 };
  const crsNote = input.crs ? `${input.crs.name}${input.crs.epsg ? ` (EPSG:${input.crs.epsg})` : ""}` : "coordinate system not set";
  const notes = [
    `${input.projectName}. Units: metres. X = easting, Y = northing, ${crsNote}.`,
    `Bearings: whole-circle from grid north. Text sized for 1:${input.scale}. ${SURVEY_ENGINE_VERSION}.`,
    input.status,
  ];
  notes.forEach((n, i) => text("TEXT", ext.minE, ext.minN - h(8) - i * h(3.5), n, h(2), 0, false));

  const w = new Writer();
  w.pair(0, "SECTION");
  w.pair(2, "HEADER");
  w.pair(9, "$ACADVER");
  w.pair(1, "AC1009");
  w.pair(9, "$INSBASE");
  w.pair(10, "0.0");
  w.pair(20, "0.0");
  w.pair(30, "0.0");
  w.pair(9, "$EXTMIN");
  w.pair(10, num(ext.minE));
  w.pair(20, num(ext.minN - h(16)));
  w.pair(30, "0.0");
  w.pair(9, "$EXTMAX");
  w.pair(10, num(ext.maxE));
  w.pair(20, num(ext.maxN));
  w.pair(30, "0.0");
  w.pair(0, "ENDSEC");

  w.pair(0, "SECTION");
  w.pair(2, "TABLES");
  w.pair(0, "TABLE");
  w.pair(2, "LTYPE");
  w.pair(70, 2);
  w.pair(0, "LTYPE");
  w.pair(2, "CONTINUOUS");
  w.pair(70, 0);
  w.pair(3, "Solid line");
  w.pair(72, 65);
  w.pair(73, 0);
  w.pair(40, "0.0");
  w.pair(0, "LTYPE");
  w.pair(2, "DASHED");
  w.pair(70, 0);
  w.pair(3, "Dashed");
  w.pair(72, 65);
  w.pair(73, 2);
  w.pair(40, num(h(2.4), 4));
  w.pair(49, num(h(1.6), 4));
  w.pair(49, num(-h(0.8), 4));
  w.pair(0, "ENDTAB");
  w.pair(0, "TABLE");
  w.pair(2, "LAYER");
  const layers = Object.keys(LAYER_STYLE) as LayerId[];
  w.pair(70, layers.length + 1);
  w.pair(0, "LAYER");
  w.pair(2, "0");
  w.pair(70, 0);
  w.pair(62, 7);
  w.pair(6, "CONTINUOUS");
  for (const l of layers) {
    const visible = doc.layers[l]?.visible !== false;
    w.pair(0, "LAYER");
    w.pair(2, l);
    w.pair(70, 0);
    // A negative colour number is how DXF marks a layer that is off.
    w.pair(62, visible ? LAYER_STYLE[l].color : -LAYER_STYLE[l].color);
    w.pair(6, LAYER_STYLE[l].ltype);
  }
  w.pair(0, "ENDTAB");
  w.pair(0, "TABLE");
  w.pair(2, "STYLE");
  w.pair(70, 1);
  w.pair(0, "STYLE");
  w.pair(2, "STANDARD");
  w.pair(70, 0);
  w.pair(40, "0.0");
  w.pair(41, "1.0");
  w.pair(50, "0.0");
  w.pair(71, 0);
  w.pair(42, num(h(2.2), 3));
  w.pair(3, "txt");
  w.pair(4, "");
  w.pair(0, "ENDTAB");
  w.pair(0, "ENDSEC");

  w.pair(0, "SECTION");
  w.pair(2, "ENTITIES");
  for (const e of entities) e(w);
  w.pair(0, "ENDSEC");
  w.pair(0, "EOF");
  return w.toString();
}
