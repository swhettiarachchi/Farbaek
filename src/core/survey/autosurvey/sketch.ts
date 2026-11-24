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
import { correctedReadings } from "../sketchintel/corrected";
import { SketchDrawingOutput, acceptDrawing, sketchDrawingSchema, type DrawingAnswer } from "../sketchintel/drawing";
import { bearingFromDeltas, formatDms, parseBearing, toDms } from "../angles";
import type { CrsRecord } from "../crs";
import { gridScaleFactor } from "../scale";
import { hasInvisible } from "../import/delimited";
import type { SurveyPoint } from "../parcel";
import type { Finding } from "../qc";

export const SKETCH_KINDS = ["point", "distance", "bearing", "dimension", "feature", "adjoining", "road", "note"] as const;
export type SketchKind = (typeof SKETCH_KINDS)[number];

/** Six photos at most, each shrunk in the browser to about 0.2 to 0.6 MB; the total stays under the 6 MB a form may carry. */
export const SKETCH_LIMITS = { photos: 6, readings: 300, photoBytes: 1_800_000, totalBytes: 5_500_000 } as const;

/**
 * What the model returns. Every value is text as written: there is no place for a computed, converted or estimated number. The only
 * numbers are which photo a reading is on and where on that photo it's written (stage 245, ADR 0253): a place to find it again, 0 to
 * 1000 across and down the photo as given, never a length, an angle or a coordinate, and never read by anything that draws.
 */
export const SketchOutputSchema = z.object({
  readings: z.array(
    z.object({
      image: z.number().describe("Which photo the reading is on, counting from 0 in the order given"),
      kind: z.enum(SKETCH_KINDS).describe("point: a point number written at a corner or mark. distance and bearing: a measurement written along a line between two numbered points (a side, a tie or a diagonal). dimension: a measurement that isn't between two numbered points, such as a building's size, an offset, or a width other than a road's. feature: a drawn object's label such as fence, wall, drain, building, tree or well. adjoining: who or what owns or lies beyond a boundary, such as Land of A. Perera. road: a road or path's name or width as written. note: any other written note."),
      text: z.string().describe("Exactly as written, with its units and symbols, unchanged: 12.45, 41'6\", 123°45'20\", N 45°30' E, Masonry wall"),
      from: z.string().describe("For a distance or bearing: the point number written at one end of its line, or empty if there isn't one"),
      to: z.string().describe("For a distance or bearing: the point number written at the other end, or empty"),
      near: z.string().describe("For anything else: the point number written nearest to it, or empty"),
      certain: z.boolean().describe("True only when every character is clearly read and what it is (a point number, a side's measurement, a dimension, a label) is clear from where it's written. False when either is in doubt"),
      doubt: z.string().describe("When not certain: what is unclear and what else it could be, in a few words, such as '3 or 8' or 'a point number, or part of the distance 1.58 beside it'. Empty when certain"),
      photoX: z.number().describe("Where the middle of the writing is on the photo as given (not turned round): 0 at the left edge to 1000 at the right. Approximate: only so a person can find it on the photo"),
      photoY: z.number().describe("Where the middle of the writing is on the photo as given: 0 at the top edge to 1000 at the bottom. Approximate: only so a person can find it on the photo"),
    }),
  ),
  unreadable: z.array(z.string()).describe("Short notes on writing you could see but not read at all, such as 'a figure along the side from 4 to 5'"),
});
type ModelReading = z.infer<typeof SketchOutputSchema>["readings"][number];
/** A reading as `acceptSketch` takes it: how clearly it was read, and where, are optional, as from readers before stage 245. */
export type SketchOutputReading = Omit<ModelReading, "certain" | "doubt" | "photoX" | "photoY"> & Partial<Pick<ModelReading, "certain" | "doubt" | "photoX" | "photoY">>;
export type SketchOutput = { readings: SketchOutputReading[]; unreadable: string[] };

/**
 * What the reader is asked for since stage 241 (ADR 0249): the readings, and the drawing itself (lines between numbered points,
 * symbols, labelled areas), all as drawn and written. A reader that returns only readings still works: the drawing is then empty.
 */
export const SketchReadSchema = SketchOutputSchema.extend(SketchDrawingOutput);
export type SketchReadOutput = SketchOutput & Partial<DrawingAnswer>;

const short = (max: number) => z.string().max(max);

export const sketchReadingSchema = z.object({
  id: z.string().regex(/^r\d{1,3}$/),
  /** The photo's file name, unique within a read: the photo as read is kept with the plan under this name (ADR 0240). */
  file: short(200),
  kind: z.enum(SKETCH_KINDS),
  text: short(120).pipe(z.string().min(1)),
  from: short(32),
  to: short(32),
  near: short(32),
  /** Read with doubt (stage 245, ADR 0253): absent when read clearly, as every reading before it was. Listed apart, never a fact. */
  certain: z.literal(false).optional(),
  /** What's unclear about it and what else it could be, in the reader's words. */
  doubt: short(200).optional(),
  /** Where it's written on the photo as given, 0 to 1000 across and down: only to find it again, never a measurement. */
  photo: z.object({ x: z.number().int().min(0).max(1000), y: z.number().int().min(0).max(1000) }).optional(),
});
export type SketchReading = z.infer<typeof sketchReadingSchema>;

/** What a model writes in the doubt field when it has none. */
const NO_DOUBT = /^(?:none|no|nil|n\/?a|-+|nothing|no doubt|not applicable|empty|certain)\.?$/i;

/** A place on the photo from the reader's two numbers, or null when either is missing or off the photo. */
export function photoPlace(x: unknown, y: unknown): { x: number; y: number } | null {
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const [rx, ry] = [Math.round(x), Math.round(y)];
  return rx >= 0 && rx <= 1000 && ry >= 0 && ry <= 1000 ? { x: rx, y: ry } : null;
}

/** What was read from a project's sketches, kept with the plan's version. */
export const sketchRecordSchema = z.object({
  model: short(80),
  readAt: short(40),
  files: z.array(short(200)).max(SKETCH_LIMITS.photos),
  readings: z.array(sketchReadingSchema).max(SKETCH_LIMITS.readings),
  unreadable: z.array(short(200)).max(20),
  /** The sketch's drawing (stage 241): absent on reads from before it, and from a reader that returned only readings. */
  drawing: sketchDrawingSchema.optional(),
  /**
   * The surveyor's corrections of point numbers as read (stage 249, ADR 0257): kept beside the reading, which stays as read. The engine
   * reads the drawing with them applied. Absent until the first one; a new read starts without them.
   */
  corrections: z
    .array(
      z.object({
        file: short(200),
        label: short(32).pipe(z.string().min(1)),
        to: short(32).pipe(z.string().min(1)),
        by: z.string().uuid().nullable(),
        at: short(40),
      }),
    )
    .max(50)
    .optional(),
});
export type SketchRecord = z.infer<typeof sketchRecordSchema>;

/** Spaces folded, trimmed and cut to a length, never through the middle of a character written as two halves (a surrogate pair). */
const clean = (s: string | null | undefined, max: number) => {
  const cut = (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
};

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
 * The names a read gives its photos, in the order sent: each its own, since a phone camera names every shot "image.jpg" and a reading
 * opens its photo by name. The server names them so, and a browser that kept the photos (stage 250) compares by the same rule.
 */
export function sketchFileNames(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const [n, raw] of names.entries()) {
    const base = sketchFileName(raw, n);
    let name = base;
    for (let k = 2; out.includes(name); k++) name = `${base.slice(0, 190)} (${k})`;
    out.push(name);
  }
  return out;
}

/**
 * The model's answer, made safe to keep: readings on a photo that wasn't sent, of an unknown kind, empty, or carrying invisible
 * characters (which could make two point numbers look alike) are dropped. Nothing is reworded.
 */
export function acceptSketch(output: SketchReadOutput, given: readonly string[], model: string, now: Date): SketchRecord {
  const files = given.slice(0, SKETCH_LIMITS.photos).map((f, n) => sketchFileName(f, n));
  const readings: SketchReading[] = [];
  for (const r of output.readings) {
    if (readings.length >= SKETCH_LIMITS.readings) break;
    if (!Number.isInteger(r.image) || r.image < 0 || r.image >= files.length) continue;
    if (!(SKETCH_KINDS as readonly string[]).includes(r.kind)) continue;
    const text = clean(r.text, 120);
    const [from, to, near] = [clean(r.from, 32), clean(r.to, 32), clean(r.near, 32)];
    if (!text || [text, from, to, near].some(hasInvisible)) continue;
    // A doubt makes the reading uncertain whatever `certain` says; a doubt carrying invisible characters isn't shown, the doubt still stands.
    // A model fills a required field with "none" or "N/A" when there's nothing to say: that isn't a doubt.
    const doubt = NO_DOUBT.test(clean(r.doubt, 200)) ? "" : clean(r.doubt, 200);
    const unsure = r.certain === false || doubt !== "";
    const photo = photoPlace(r.photoX, r.photoY);
    readings.push({
      id: `r${readings.length + 1}`,
      file: files[r.image]!,
      kind: r.kind,
      text,
      from,
      to,
      near,
      ...(unsure ? { certain: false as const } : {}),
      ...(doubt && !hasInvisible(doubt) ? { doubt } : {}),
      ...(photo ? { photo } : {}),
    });
  }
  return {
    model: clean(model, 80),
    readAt: now.toISOString(),
    files,
    readings,
    unreadable: output.unreadable.map((u) => clean(u, 200)).filter((u) => u && !hasInvisible(u)).slice(0, 20),
    ...(output.lines || output.symbols || output.areas ? { drawing: acceptDrawing({ lines: output.lines ?? [], symbols: output.symbols ?? [], areas: output.areas ?? [] }, files, clean, hasInvisible) } : {}),
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
  /** The reading as checked has a number the surveyor corrected (ADR 0257); `reading` is then as corrected. */
  corrected?: true;
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

/**
 * One reading checked against the surveyed points, as the plan is shown. Without a confirmed coordinate system (null), point numbers
 * and labels are still checked; a measurement isn't compared.
 */
export function checkReading(r: SketchReading, byNumber: ReadonlyMap<string, SurveyPoint>, crs: CrsRecord | null): ReadingCheck {
  // A dimension written between two numbered points is a measurement between them, compared as one (ADR 0253).
  if (r.kind === "dimension" && r.from && r.to) return { ...checkReading({ ...r, kind: "distance" }, byNumber, crs), reading: r };
  if (r.kind === "point") {
    return byNumber.has(r.text) ? { reading: r, status: "agrees", detail: `Point ${r.text} is in the survey files.` } : { reading: r, status: "unmatched", detail: `Point ${r.text} is on ${r.file} but not in the survey files.` };
  }
  if (r.kind !== "distance" && r.kind !== "bearing") {
    if (r.near && !byNumber.has(r.near)) return { reading: r, status: "unmatched", detail: `"${r.text}" is written beside point ${r.near} on ${r.file}, and point ${r.near} isn't in the survey files.` };
    if (r.kind === "dimension") return { reading: r, status: "not_checked", detail: "A dimension isn't written between two point numbers, so it isn't compared with the survey." };
    return { reading: r, status: "not_checked", detail: "Read for the plan's labels. A label isn't checked against coordinates." };
  }
  if (!r.from || !r.to) return { reading: r, status: "not_checked", detail: "It isn't written between two point numbers on the sketch, so it can't be checked." };
  const a = byNumber.get(r.from);
  const b = byNumber.get(r.to);
  const missing = [a ? null : r.from, b ? null : r.to].filter(Boolean);
  if (!a || !b) return { reading: r, status: "unmatched", detail: `It's written between points ${r.from} and ${r.to}, and ${missing.length === 2 ? `neither is` : `point ${missing[0]} isn't`} in the survey files.` };
  if (!crs) return { reading: r, status: "not_checked", detail: "The project's coordinate system isn't confirmed yet, so it isn't compared with the survey." };
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

/** Every reading checked, in the order read, with the surveyor's corrections of point numbers (ADR 0257): keep answers stay with the reading. */
export function checkSketch(sketch: SketchRecord, points: readonly SurveyPoint[], crs: CrsRecord): ReadingCheck[] {
  const byNumber = new Map(points.map((p) => [p.pointId, p] as const));
  return correctedReadings(sketch.readings, sketch.corrections ?? []).map((r, i) => ({ ...checkReading(r, byNumber, crs), ...(r !== sketch.readings[i] ? { corrected: true as const } : {}) }));
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
  const measured = sketch.readings.filter((r) => r.kind === "distance" || r.kind === "bearing" || r.kind === "dimension").length;
  const doubtful = sketch.readings.filter((r) => r.certain === false).length;
  const compared = `${agree} ${agree === 1 ? "agrees" : "agree"} with the coordinates${close > 0 ? `, and ${close} ${close === 1 ? "is" : "are"} within the usual measuring difference` : ""}`;
  // A reading made with doubt is said to be one, with the reader's doubt, wherever it's raised (ADR 0253).
  const doubtNote = (r: SketchReading) => (r.certain === false ? ` It was read with doubt${r.doubt ? `: ${r.doubt.replace(/[.\s]+$/, "")}` : ""}.` : "");
  out.push({
    code: "SKETCH_READ",
    severity: "information",
    message: `${sketch.readings.length} ${sketch.readings.length === 1 ? "thing was" : "things were"} read from ${sketch.files.length} ${sketch.files.length === 1 ? "sketch" : "sketches"} by ${readerName(sketch.model)}${crs ? `: ${compared}` : ""}.`,
    target: { kind: "project" },
    detail: `${measured} ${measured === 1 ? "is a measurement" : "are measurements"}.${doubtful > 0 ? ` ${doubtful} ${doubtful === 1 ? "was" : "were"} read with doubt, and the sketch report lists ${doubtful === 1 ? "it" : "them"} apart.` : ""} No point was moved and no measurement taken from a sketch: every position is the survey's own.${sketch.unreadable.length > 0 ? ` Seen but not read: ${sketch.unreadable.slice(0, 4).join("; ")}.` : ""}`,
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
          detail: `Read from ${c.reading.file}.${doubtNote(c.reading)} Check the sketch and your field notes: the reading may be wrong, or a point may have been observed or numbered wrongly. Nothing has been changed.`,
          action: "If the coordinates are right, keep it as surveyed. If the sketch is right, observe the point again and import it under a new number.",
          blocks: ["approval"],
          keep: { key, kept: false },
        });
    } else if (c.status === "unmatched") {
      out.push({ code: "SKETCH_POINT_UNKNOWN", severity: "warning", message: c.detail, target: { kind: "project" }, ...(c.reading.certain === false ? { detail: doubtNote(c.reading).trim() } : {}), action: "Check the number on the sketch, or import the file that has the point.", blocks: [] });
    }
  }
  return out;
}
