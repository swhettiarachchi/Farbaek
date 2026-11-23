/**
 * Field sketches (stage 223, ADR 0234). A photo of the surveyor's hand-drawn sketch is read by an AI model into readings, each exactly
 * as written: point numbers, distances, bearings and labels. A sketch is evidence, never a source of coordinates: nothing here moves,
 * adds or draws a point. Tested code then checks every distance and bearing that names two surveyed points against those points'
 * coordinates, every time the plan is shown, and a reading that disagrees becomes a finding for the surveyor, who either corrects the
 * survey or keeps it as surveyed.
 *
 * Vision models misread handwriting in ways that look plausible, and what they say about their own confidence isn't reliable (the
 * research behind stage 222), so no reading is trusted for being read: only its agreement with the instrument's data counts.
 */
import { z } from "zod";
import { bearingFromDeltas, formatDms, parseBearing, toDms } from "../angles";
import type { CrsRecord } from "../crs";
import { gridScaleFactor } from "../scale";
import { hasInvisible } from "../import/delimited";
import type { SurveyPoint } from "../parcel";
import type { Finding } from "../qc";

export const SKETCH_KINDS = ["point", "distance", "bearing", "feature", "adjoining", "road", "note"] as const;
export type SketchKind = (typeof SKETCH_KINDS)[number];

/** Six photos at most, each shrunk in the browser to about 0.2 to 0.6 MB; the total stays under the 6 MB a form may carry. */
export const SKETCH_LIMITS = { photos: 6, readings: 300, photoBytes: 1_800_000, totalBytes: 5_500_000 } as const;

/** What the model returns. Every value is text as written: there is no place for a computed, converted or estimated number. */
export const SketchOutputSchema = z.object({
  readings: z.array(
    z.object({
      image: z.number().describe("Which photo the reading is on, counting from 0 in the order given"),
      kind: z.enum(SKETCH_KINDS).describe("point: a point number written on the sketch. distance and bearing: a measurement written along a line between two points. feature: a drawn object's label such as fence, wall, drain, building, tree or well. adjoining: who or what owns or lies beyond a boundary, such as Land of A. Perera. road: a road or path's name or width as written. note: any other written note."),
      text: z.string().describe("Exactly as written, with its units and symbols, unchanged: 12.45, 41'6\", 123°45'20\", N 45°30' E, Masonry wall"),
      from: z.string().describe("For a distance or bearing: the point number written at one end of its line, or empty if there isn't one"),
      to: z.string().describe("For a distance or bearing: the point number written at the other end, or empty"),
      near: z.string().describe("For anything else: the point number written nearest to it, or empty"),
    }),
  ),
  unreadable: z.array(z.string()).describe("Short notes on writing you could see but not read for certain, such as 'the distance between 4 and 5'"),
});
export type SketchOutput = z.infer<typeof SketchOutputSchema>;

const short = (max: number) => z.string().max(max);

export const sketchReadingSchema = z.object({
  id: z.string().regex(/^r\d{1,3}$/),
  /** The photo's file name, as uploaded: the photo itself isn't kept. */
  file: short(200),
  kind: z.enum(SKETCH_KINDS),
  text: short(120).pipe(z.string().min(1)),
  from: short(32),
  to: short(32),
  near: short(32),
});
export type SketchReading = z.infer<typeof sketchReadingSchema>;

/** What was read from a project's sketches, kept with the plan's version. */
export const sketchRecordSchema = z.object({
  model: short(80),
  readAt: short(40),
  files: z.array(short(200)).max(SKETCH_LIMITS.photos),
  readings: z.array(sketchReadingSchema).max(SKETCH_LIMITS.readings),
  unreadable: z.array(short(200)).max(20),
});
export type SketchRecord = z.infer<typeof sketchRecordSchema>;

const clean = (s: string | null | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * A photo's file name, safe to show and to send: control characters go, and a name with invisible characters (a right-to-left
 * override can make "gpj.exe" read as "exe.jpg") is replaced by "Sketch n" rather than shown.
 */
export function sketchFileName(name: string, n: number): string {
  const visible = clean(
    [...name]
      .filter((c) => {
        const k = c.charCodeAt(0);
        return k >= 32 && k !== 127;
      })
      .join(""),
    200,
  );
  return visible && !hasInvisible(visible) ? visible : `Sketch ${n + 1}`;
}

/**
 * The model's answer, made safe to keep: readings on a photo that wasn't sent, of an unknown kind, empty, or carrying invisible
 * characters (which could make two point numbers look alike) are dropped. Nothing is reworded.
 */
export function acceptSketch(output: SketchOutput, given: readonly string[], model: string, now: Date): SketchRecord {
  const files = given.slice(0, SKETCH_LIMITS.photos).map((f, n) => sketchFileName(f, n));
  const readings: SketchReading[] = [];
  for (const r of output.readings) {
    if (readings.length >= SKETCH_LIMITS.readings) break;
    if (!Number.isInteger(r.image) || r.image < 0 || r.image >= files.length) continue;
    if (!(SKETCH_KINDS as readonly string[]).includes(r.kind)) continue;
    const text = clean(r.text, 120);
    const [from, to, near] = [clean(r.from, 32), clean(r.to, 32), clean(r.near, 32)];
    if (!text || [text, from, to, near].some(hasInvisible)) continue;
    readings.push({ id: `r${readings.length + 1}`, file: files[r.image]!, kind: r.kind, text, from, to, near });
  }
  return {
    model: clean(model, 80),
    readAt: now.toISOString(),
    files,
    readings,
    unreadable: output.unreadable.map((u) => clean(u, 200)).filter((u) => u && !hasInvisible(u)).slice(0, 20),
  };
}

/** A distance as written: its value, its unit, and how many decimals it was written to. Metres and feet only. */
export function parseWrittenDistance(text: string): { value: number; unit: "m" | "ft"; decimals: number } | null {
  const t = text.replace(/[·∙]/g, ".").replace(/\s+/g, "").toLowerCase();
  const m = /^(\d+(?:\.(\d+))?)(m|mtrs?|metres?|meters?|ft|feet|'|′)?$/.exec(t);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = m[3] && /^(ft|feet|'|′)$/.test(m[3]) ? "ft" : "m";
  return { value, unit, decimals: m[2]?.length ?? 0 };
}

/** Half of the last unit a bearing was written to, in degrees: 30" written to the second is ±0.5", 45' to the minute ±30". */
function bearingHalfUnit(text: string): number {
  const groups = text.match(/\d+(?:\.\d+)?/g) ?? [];
  const last = groups[groups.length - 1] ?? "0";
  const decimals = last.includes(".") ? last.split(".")[1]!.length : 0;
  const unit = groups.length >= 3 ? 1 / 3600 : groups.length === 2 ? 1 / 60 : 1;
  return (unit * 10 ** -decimals) / 2;
}

/**
 * Grid distance divided by this gives the ground distance, roughly: the projection's scale where the line is, and the height of the
 * land (`gridScaleFactor`, shared with the reduction of observations). Used here only to accept a taped distance that differs from
 * the grid distance by the grid's own scale; nothing is converted.
 */
export function groundFactor(crs: CrsRecord, e: number, heightM: number | null): number {
  return gridScaleFactor(crs, e, heightM);
}

/**
 * How far a written measurement may be from the coordinates and still be the ordinary difference between field work and the computed
 * figure (a tape's sag and slope, centring, figures rounded by hand): 2 cm plus 1 in 5,000 of the line, and 30 seconds of arc.
 * Farbaek's own default, not a legal tolerance, until a surveyor sets their own (AutoSurvey part 3). Such a difference is still
 * shown with its size; it just doesn't hold the plan.
 */
export const SKETCH_TOLERANCE = { metres: 0.02, ratio: 1 / 5_000, arcSeconds: 30 } as const;

export type ReadingStatus = "agrees" | "close" | "differs" | "unmatched" | "not_checked";

export interface ReadingCheck {
  reading: SketchReading;
  status: ReadingStatus;
  /** What the check found, in a sentence. */
  detail: string;
}

const metres = (m: number) => `${m.toFixed(3)} m`;
/** A difference of angle, unpadded: 0°10′00″, not 000°10′00″. */
const angleText = (deg: number) => {
  const d = toDms(deg);
  return `${d.degrees}°${String(d.minutes).padStart(2, "0")}′${String(Math.floor(d.seconds)).padStart(2, "0")}″`;
};
const angleGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** One reading checked against the surveyed points, as the plan is shown. */
export function checkReading(r: SketchReading, byNumber: ReadonlyMap<string, SurveyPoint>, crs: CrsRecord): ReadingCheck {
  if (r.kind === "point") {
    return byNumber.has(r.text) ? { reading: r, status: "agrees", detail: `Point ${r.text} is in the survey files.` } : { reading: r, status: "unmatched", detail: `Point ${r.text} is on ${r.file} but not in the survey files.` };
  }
  if (r.kind !== "distance" && r.kind !== "bearing") {
    if (r.near && !byNumber.has(r.near)) return { reading: r, status: "unmatched", detail: `"${r.text}" is written beside point ${r.near} on ${r.file}, and point ${r.near} isn't in the survey files.` };
    return { reading: r, status: "not_checked", detail: "Read for the plan's labels. A label isn't checked against coordinates." };
  }
  if (!r.from || !r.to) return { reading: r, status: "not_checked", detail: "It isn't written between two point numbers on the sketch, so it can't be checked." };
  const a = byNumber.get(r.from);
  const b = byNumber.get(r.to);
  const missing = [a ? null : r.from, b ? null : r.to].filter(Boolean);
  if (!a || !b) return { reading: r, status: "unmatched", detail: `It's written between points ${r.from} and ${r.to}, and ${missing.length === 2 ? `neither is` : `point ${missing[0]} isn't`} in the survey files.` };
  const dE = b.e - a.e;
  const dN = b.n - a.n;
  const grid = Math.hypot(dE, dN);
  // A line from a point to itself, or between two numbers at the same place, has nothing to measure: most likely a misreading.
  if (r.from === r.to || grid < 0.001) return { reading: r, status: "not_checked", detail: r.from === r.to ? `It's written from point ${r.from} to itself, so it can't be checked.` : `Points ${r.from} and ${r.to} are at the same place, so there's no line to check.` };
  if (r.kind === "distance") {
    const d = parseWrittenDistance(r.text);
    if (!d) return { reading: r, status: "not_checked", detail: `"${r.text}" couldn't be read as a distance in metres or feet, so it isn't checked.` };
    const toM = d.unit === "ft" ? 0.3048 : 1;
    const written = d.value * toM;
    const half = 0.5 * 10 ** -d.decimals * toM;
    const ground = grid / groundFactor(crs, (a.e + b.e) / 2, a.z !== null && b.z !== null ? (a.z + b.z) / 2 : null);
    const lo = Math.min(grid, ground) - half;
    const hi = Math.max(grid, ground) + half;
    if (written >= lo && written <= hi) return { reading: r, status: "agrees", detail: `${r.text} between ${r.from} and ${r.to} agrees with the coordinates (${metres(grid)} on the grid) as written.` };
    // Measured from the grid distance the sentence gives, so the figures in it add up.
    const gap = Math.abs(written - grid);
    const said = `The sketch says ${r.text} between ${r.from} and ${r.to}; the coordinates give ${metres(grid)} on the grid, ${metres(gap)} apart${d.unit === "ft" ? ` (${r.text} is ${metres(written)})` : ""}`;
    const field = SKETCH_TOLERANCE.metres + grid * SKETCH_TOLERANCE.ratio;
    if (written >= lo - field && written <= hi + field) return { reading: r, status: "close", detail: `${said}: within the usual measuring difference of ${metres(field)} for this line.` };
    return { reading: r, status: "differs", detail: `${said}.` };
  }
  const p = parseBearing(r.text);
  const forward = bearingFromDeltas(dE, dN);
  if (!p) return { reading: r, status: "not_checked", detail: `"${r.text}" couldn't be read as a bearing, so it isn't checked.` };
  if (forward === null) return { reading: r, status: "not_checked", detail: `Points ${r.from} and ${r.to} are at the same place, so there's no bearing to check.` };
  const half = bearingHalfUnit(r.text);
  const back = (forward + 180) % 360;
  if (angleGap(p.degrees, forward) <= half) return { reading: r, status: "agrees", detail: `${r.text} from ${r.from} to ${r.to} agrees with the coordinates as written.` };
  if (angleGap(p.degrees, back) <= half) return { reading: r, status: "agrees", detail: `${r.text} agrees with the coordinates as the bearing from ${r.to} to ${r.from}.` };
  const off = Math.min(angleGap(p.degrees, forward), angleGap(p.degrees, back));
  const said = `The sketch says ${r.text} between ${r.from} and ${r.to}; the coordinates give ${formatDms(toDms(forward))} from ${r.from} to ${r.to}, ${angleText(off)} apart`;
  if (off <= half + SKETCH_TOLERANCE.arcSeconds / 3600) return { reading: r, status: "close", detail: `${said}: within the usual measuring difference of ${SKETCH_TOLERANCE.arcSeconds}″.` };
  return { reading: r, status: "differs", detail: `${said}.` };
}

/** Every reading checked, in the order read. */
export function checkSketch(sketch: SketchRecord, points: readonly SurveyPoint[], crs: CrsRecord): ReadingCheck[] {
  const byNumber = new Map(points.map((p) => [p.pointId, p] as const));
  return sketch.readings.map((r) => checkReading(r, byNumber, crs));
}

/** Who read the sketches, as people know them. */
export function readerName(model: string): string {
  if (/^claude/i.test(model)) return "Claude";
  if (/^gpt|^o\d/i.test(model)) return "ChatGPT's model";
  return "the AI";
}

/**
 * The findings the sketches add to the plan's checks. A measurement that disagrees with the coordinates waits for the surveyor
 * (who keeps it as surveyed, or corrects the survey); a point number missing from the data is a warning; the rest is information.
 * With no confirmed coordinate system there is nothing to compare, so only the summary shows.
 */
export function sketchFindings(sketch: SketchRecord | null, points: readonly SurveyPoint[], crs: CrsRecord | null, kept: ReadonlySet<string>): Finding[] {
  if (!sketch || sketch.readings.length === 0) return [];
  const out: Finding[] = [];
  const checks = crs ? checkSketch(sketch, points, crs) : [];
  const agree = checks.filter((c) => c.status === "agrees").length;
  const close = checks.filter((c) => c.status === "close").length;
  const measured = sketch.readings.filter((r) => r.kind === "distance" || r.kind === "bearing").length;
  const compared = `${agree} ${agree === 1 ? "agrees" : "agree"} with the coordinates${close > 0 ? `, and ${close} ${close === 1 ? "is" : "are"} within the usual measuring difference` : ""}`;
  out.push({
    code: "SKETCH_READ",
    severity: "information",
    message: `${sketch.readings.length} ${sketch.readings.length === 1 ? "thing was" : "things were"} read from ${sketch.files.length} ${sketch.files.length === 1 ? "sketch" : "sketches"} by ${readerName(sketch.model)}${crs ? `: ${compared}` : ""}.`,
    target: { kind: "project" },
    detail: `${measured} ${measured === 1 ? "is a measurement" : "are measurements"}. Sketches only check the plan: nothing was drawn or moved from them.${sketch.unreadable.length > 0 ? ` Couldn't be read for certain: ${sketch.unreadable.slice(0, 4).join("; ")}.` : ""}`,
    action: "Nothing to do unless something below needs you.",
    blocks: [],
  });
  for (const c of checks) {
    if (c.status === "differs") {
      const key = `sketch:${c.reading.id}`;
      if (kept.has(key)) out.push({ code: "SKETCH_DIFFERS_KEPT", severity: "information", message: `Kept as surveyed: ${c.detail}`, target: { kind: "project" }, action: "Nothing to do, unless you want to check it again.", blocks: [], keep: { key, kept: true } });
      else
        out.push({
          code: "SKETCH_DIFFERS",
          severity: "professional_review",
          message: c.detail,
          target: { kind: "project" },
          detail: `Read from ${c.reading.file}. Check the sketch and your field notes: the reading may be wrong, or a point may have been observed or numbered wrongly. Nothing has been changed.`,
          action: "If the coordinates are right, keep it as surveyed. If the sketch is right, observe the point again and import it under a new number.",
          blocks: ["approval"],
          keep: { key, kept: false },
        });
    } else if (c.status === "unmatched") {
      out.push({ code: "SKETCH_POINT_UNKNOWN", severity: "warning", message: c.detail, target: { kind: "project" }, action: "Check the number on the sketch, or import the file that has the point.", blocks: [] });
    }
  }
  return out;
}
