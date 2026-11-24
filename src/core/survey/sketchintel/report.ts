/**
 * The sketch interpretation report (stage 245, ADR 0253): everything read from a field sketch, in the order a surveyor goes through it.
 * - Each side drawn: its two numbered ends, how it's drawn, what's written along it, and the numbers beside it.
 * - The point numbers, each with the survey point it matches and how.
 * - Measurements that aren't along one drawn side (ties, diagonals, dimensions), and the other writing.
 * - Apart from all of that, everything read with doubt or that the survey disagrees with, for the surveyor to decide.
 *
 * Every entry carries its text as written, which photo it's on and where (when the reader gave it), the side or point it belongs to,
 * what it means, how sure Farbaek is and why, and what the survey says. The report is made again from what was read and the points as
 * they are now. Nothing in it moves a point or draws a line, and a photo position is only for finding the writing again.
 */
import { checkReading, readerName, type ReadingStatus, type SketchKind, type SketchReading, type SketchRecord } from "../autosurvey/sketch";
import type { SurveyDocument } from "../document";
import type { CodeEntry } from "../codes";
import type { CrsRecord } from "../crs";
import type { SurveyPoint } from "../parcel";
import { classifyLine, type LineKind } from "./classify";
import type { SketchLineStyle } from "./drawing";
import { sketchQuestionFindings } from "./findings";
import { writtenWidth, type SketchInterpretation } from "./interpret";
import { indexPoints, matchPoint, type MatchHow } from "./match";

/**
 * How sure Farbaek is of one reading, by a fixed rule:
 * - high: read clearly, and the survey agrees with it (or it's within the usual measuring difference);
 * - medium: read clearly with nothing in the survey to compare it with, or read with doubt and the survey agrees;
 * - low: read with doubt and not confirmed, or the survey disagrees or doesn't have the point.
 */
export type Confidence = "high" | "medium" | "low";

export function confidenceOf(read: "clear" | "doubt", status: ReadingStatus): Confidence {
  const base: Confidence = status === "agrees" || status === "close" ? "high" : status === "not_checked" ? "medium" : "low";
  if (read === "clear") return base;
  return base === "high" ? "medium" : "low";
}

export interface ReportEntry {
  /** The reading's id in the sketch record. */
  id: string;
  text: string;
  file: string;
  /** Where it's written on the photo as given, 0 to 1000 across and down, or null when the reader didn't say. */
  photo: { x: number; y: number } | null;
  /** The two numbered ends it's written between, as written, or null. */
  side: { from: string; to: string } | null;
  near: string | null;
  meaning: string;
  /** What kind of writing the reader took it for. */
  kind: SketchKind;
  read: "clear" | "doubt";
  doubt: string | null;
  status: ReadingStatus;
  detail: string;
  confidence: Confidence;
}

export interface ReportSide {
  line: string;
  file: string;
  from: string;
  to: string;
  drawn: string;
  /** What's written along the whole drawn line, as written. */
  label: string;
  feature: LineKind;
  lineRead: "clear" | "doubt";
  /** Each end's survey point number, or null when the number isn't one point in the survey. */
  ends: [string | null, string | null];
  /** The survey's grid distance between the two ends, when both are surveyed points. */
  gridM: number | null;
  entries: ReportEntry[];
}

export interface ReportPoint {
  label: string;
  pointId: string | null;
  how: MatchHow;
  entries: ReportEntry[];
}

export interface UnclearItem {
  what: string;
  file: string;
  photo: { x: number; y: number } | null;
  reasons: string[];
  /** The reading it's about, when it's one. */
  id: string | null;
  /**
   * Shown apart, more quietly (stage 246, ADR 0254): a measurement read with doubt that the survey agrees with exactly as read, or a
   * label or note read with doubt. They still never count as facts; they just aren't what the surveyor needs to look at first.
   */
  quiet: boolean;
}

export interface SketchReport {
  reader: string;
  readAt: string;
  files: string[];
  /** Whether measurements were compared with the survey (the coordinate system is confirmed). */
  compared: boolean;
  sides: ReportSide[];
  between: ReportEntry[];
  points: ReportPoint[];
  other: ReportEntry[];
  unclear: UnclearItem[];
  questions: string[];
  unreadable: string[];
}

const DRAWN: Record<SketchLineStyle, string> = {
  single: "single line",
  double: "double line",
  dashed: "dashed line",
  hatched: "hatched line",
  crossed: "line with crosses",
  curved: "curved line",
  other: "line",
};

export const HOW_MATCHED: Record<MatchHow, string> = {
  exact: "Same number",
  "leading zeros": "Read without its leading zeros",
  case: "Letter case differs",
  none: "Not in the survey",
  ambiguous: "More than one surveyed point has this number",
};

function meaningOf(r: SketchReading, onSide: boolean): string {
  switch (r.kind) {
    case "point":
      return "A point number";
    case "distance":
      return !r.from || !r.to ? "A measurement whose ends aren't numbered" : onSide ? "The side's measured length" : "A length measured between two numbered points (a tie or a diagonal)";
    case "bearing":
      return !r.from || !r.to ? "A bearing whose ends aren't numbered" : onSide ? "The side's bearing" : "A bearing between two numbered points";
    case "dimension":
      return r.from && r.to ? (onSide ? "The side's measured length" : "A length measured between two numbered points (a tie or a diagonal)") : "A dimension, not between numbered points";
    case "feature":
      return "What a drawn line or object is";
    case "adjoining":
      return "Who or what lies beyond the boundary";
    case "road":
      return writtenWidth(r.text) !== null ? "A road's width" : "A road's name";
    default:
      return "A note";
  }
}

const sameSide = (r: SketchReading, a: string, b: string) => (r.from === a && r.to === b) || (r.from === b && r.to === a);

export interface SketchReportInput {
  sketch: SketchRecord;
  points: readonly SurveyPoint[];
  codes: readonly CodeEntry[];
  /** The project's coordinate system once a person has confirmed it, else null: measurements are then not compared. */
  crs: CrsRecord | null;
  interpretation: SketchInterpretation | null;
  /** The plan, when there is one: the report then lists only the questions its checks still ask, as they ask them. */
  document?: SurveyDocument;
}

export function sketchReport({ sketch, points, codes, crs, interpretation, document }: SketchReportInput): SketchReport {
  const index = indexPoints(points);
  const drawing = sketch.drawing ?? { lines: [], symbols: [], areas: [] };

  // Each drawn side, leg by leg along its line.
  const sides: ReportSide[] = [];
  for (const line of drawing.lines) {
    const kind = classifyLine(line.label, line.style, codes).kind;
    // A line that closes comes back to its first point, as the engine draws it, unless it's written with that number again at its end.
    const ring = line.closes && line.points.length > 2 && line.points[0] !== line.points.at(-1) ? [...line.points, line.points[0]!] : line.points;
    for (let i = 0; i + 1 < ring.length; i++) {
      const [from, to] = [ring[i]!, ring[i + 1]!];
      const [a, b] = [matchPoint(from, index).point, matchPoint(to, index).point];
      sides.push({ line: line.id, file: line.file, from, to, drawn: DRAWN[line.style], label: line.label, feature: kind, lineRead: line.certain ? "clear" : "doubt", ends: [a?.pointId ?? null, b?.pointId ?? null], gridM: a && b ? Math.hypot(b.e - a.e, b.n - a.n) : null, entries: [] });
    }
  }

  // A point number is matched as the point list matches it (leading zeros and letter case, said), so the two never disagree.
  const pointCheck = (r: SketchReading): { status: ReadingStatus; detail: string } => {
    const m = matchPoint(r.text, index);
    if (m.point) return { status: "agrees", detail: m.how === "exact" ? `Point ${r.text} is in the survey files.` : `${HOW_MATCHED[m.how]}: point ${m.point.pointId} in the survey files.` };
    return { status: "unmatched", detail: m.how === "ambiguous" ? `More than one surveyed point is numbered ${r.text}, so the sketch can't say which.` : `Point ${r.text} is on ${r.file} but not in the survey files.` };
  };
  // A measurement's ends, and the point a label is near, are matched the same way: a number two surveyed points share isn't compared.
  const otherCheck = (r: SketchReading): { status: ReadingStatus; detail: string } => {
    const resolved = new Map<string, SurveyPoint>();
    for (const label of [r.from, r.to, r.near].filter(Boolean)) {
      const m = matchPoint(label, index);
      if (m.how === "ambiguous") return { status: "unmatched", detail: `More than one surveyed point is numbered ${label}, so it can't be compared.` };
      if (m.point) resolved.set(label, m.point);
    }
    return checkReading(r, resolved, crs);
  };
  const entry = (r: SketchReading, onSide: boolean): ReportEntry => {
    const c = r.kind === "point" ? pointCheck(r) : otherCheck(r);
    const read = r.certain === false ? "doubt" : "clear";
    return {
      id: r.id,
      text: r.text,
      file: r.file,
      photo: r.photo ?? null,
      side: r.from && r.to ? { from: r.from, to: r.to } : null,
      near: r.near || null,
      meaning: meaningOf(r, onSide),
      kind: r.kind,
      read,
      doubt: r.doubt ?? null,
      status: c.status,
      detail: c.detail,
      confidence: confidenceOf(read, c.status),
    };
  };

  const between: ReportEntry[] = [];
  const other: ReportEntry[] = [];
  const pointEntries = new Map<string, ReportEntry[]>();
  const all: ReportEntry[] = [];
  for (const r of sketch.readings) {
    if (r.kind === "point") {
      const e = entry(r, false);
      pointEntries.set(r.text, [...(pointEntries.get(r.text) ?? []), e]);
      all.push(e);
    } else if (r.kind === "distance" || r.kind === "bearing" || r.kind === "dimension") {
      // Along a drawn side when its two numbers are that side's two ends; a measurement can belong to only one side.
      const side = r.from && r.to ? sides.find((s) => sameSide(r, s.from, s.to)) : undefined;
      const e = entry(r, Boolean(side));
      (side ? side.entries : between).push(e);
      all.push(e);
    } else {
      const e = entry(r, false);
      other.push(e);
      all.push(e);
    }
  }

  // Every point number the sketch carries: on its lines, at its symbols, round its areas, and written on its own.
  const labels = [...new Set([...drawing.lines.flatMap((l) => l.points), ...drawing.symbols.map((s) => s.at).filter(Boolean), ...drawing.areas.flatMap((a) => a.around), ...pointEntries.keys()])];
  const pointList: ReportPoint[] = labels.map((label) => {
    const m = matchPoint(label, index);
    return { label, pointId: m.point?.pointId ?? null, how: m.how, entries: pointEntries.get(label) ?? [] };
  });

  // Apart: what was read with doubt, what the survey disagrees with, and numbers the survey doesn't have.
  const ranked: { item: UnclearItem; rank: number }[] = [];
  const unclear = { push: (item: Omit<UnclearItem, "quiet">, rank: number) => ranked.push({ item: { ...item, quiet: rank >= 3 }, rank }) };
  for (const e of all) {
    const reasons: string[] = [];
    if (e.read === "doubt") reasons.push(e.doubt ? `Read with doubt: ${e.doubt}${/[.!?]$/.test(e.doubt) ? "" : "."}` : "Read with doubt.");
    if (e.status === "differs" || e.status === "unmatched") reasons.push(e.detail);
    else if (e.read === "doubt" && (e.status === "agrees" || e.status === "close")) reasons.push(`The survey agrees with it as read: ${e.detail}`);
    if (reasons.length === 0) continue;
    const where = e.side ? ` between ${e.side.from} and ${e.side.to}` : e.near ? ` near ${e.near}` : "";
    const conflict = e.status === "differs" || e.status === "unmatched";
    const label = e.kind === "feature" || e.kind === "note" || e.kind === "adjoining";
    // A point number that exists says only that the number exists: a doubtful one stays in front (an upside-down 20 read as 10, where
    // 10 is another point). Only a measurement the survey agrees with exactly, as read, is folded away with the labels.
    const rank = conflict ? 0 : label ? 3 : e.kind !== "point" && e.status === "agrees" ? 4 : 1;
    unclear.push({ what: `${e.text}${where} (${e.meaning.toLowerCase()})`, file: e.file, photo: e.photo, reasons, id: e.id }, rank);
  }
  // A number on the drawing the survey doesn't have, once: a written point number already listed above says it.
  for (const p of pointList) {
    if ((p.how !== "none" && p.how !== "ambiguous") || p.entries.length > 0) continue;
    const reason = p.how === "none" ? `${p.label} isn't a point number in the survey.` : `More than one surveyed point is numbered ${p.label}, so the sketch can't say which.`;
    const file = drawing.lines.find((l) => l.points.includes(p.label))?.file ?? drawing.symbols.find((s) => s.at === p.label)?.file ?? drawing.areas.find((a) => a.around.includes(p.label))?.file ?? sketch.files[0] ?? "";
    unclear.push({ what: `Point number ${p.label}`, file, photo: null, reasons: [reason], id: null }, 0);
  }
  for (const line of drawing.lines.filter((l) => !l.certain)) {
    unclear.push({ what: `The ${DRAWN[line.style]} ${line.points.join(" to ")}${line.label ? ` ("${line.label}")` : ""}`, file: line.file, photo: null, reasons: ["Its numbers, or the line between them, were read with doubt."], id: null }, 2);
  }

  return {
    reader: readerName(sketch.model),
    readAt: sketch.readAt,
    files: sketch.files,
    compared: crs !== null,
    sides,
    between,
    points: pointList,
    other,
    unclear: ranked.sort((a, b) => a.rank - b.rank).map((x) => x.item),
    questions: document ? sketchQuestionFindings(interpretation, document).map((f) => [f.message, f.detail].filter(Boolean).join(" ")) : (interpretation?.questions ?? []).map((q) => [q.text, ...q.evidence].join(" ")),
    unreadable: sketch.unreadable,
  };
}

export const CONFIDENCE_WORDS: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };
export const STATUS_WORDS: Record<ReadingStatus, string> = {
  agrees: "Agrees with the survey",
  close: "Within the usual measuring difference",
  differs: "Differs from the survey",
  unmatched: "Not in the survey",
  not_checked: "Not compared",
};
export const CONFIDENCE_RULE =
  "How sure, by a fixed rule: High when read clearly and the survey agrees; Medium when read clearly with nothing in the survey to compare it with, or read with doubt and the survey agrees; Low when read with doubt and not confirmed, or when the survey disagrees or doesn't have the point.";

/** Where on the photo, in words: "62% across, 83% down", or null when the reader didn't say. */
export const photoWords = (p: { x: number; y: number } | null): string | null => (p ? `${Math.round(p.x / 10)}% across, ${Math.round(p.y / 10)}% down` : null);

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const BS = String.fromCharCode(92);
/** Text from the sketch made safe in a Markdown table cell: one line, no raw HTML, no column breaks, no link or image. */
const cell = (t: string) =>
  t
    .split(BS)
    .join(BS + BS)
    .split(CR)
    .join("")
    .split(LF)
    .join(" ")
    .split("<")
    .join("&lt;")
    .split("|")
    .join(`${BS}|`)
    .split("[")
    .join(`${BS}[`)
    .split("]")
    .join(`${BS}]`);

/** The report as Markdown, for a file a surveyor keeps beside the job. Everything from the sketch is escaped as text. */
export function sketchReportMarkdown(r: SketchReport, title = "Sketch interpretation report"): string {
  const where = (e: { file: string; photo: { x: number; y: number } | null }) => cell(`${e.file}${photoWords(e.photo) ? `, ${photoWords(e.photo)}` : ""}`);
  const read = (e: ReportEntry) => (e.read === "clear" ? "Clearly" : `With doubt${e.doubt ? `: ${e.doubt}` : ""}`);
  const out: string[] = [
    `# ${cell(title)}`,
    "",
    `Read by ${r.reader} on ${r.readAt.slice(0, 10)} from ${r.files.map(cell).join(", ")}.`,
    "",
    CONFIDENCE_RULE,
    "",
    "Positions on a photo are approximate, as the photo is given (not turned round), and only for finding the writing again. Nothing here moved a point or gave a position: every position on the plan is the survey's own.",
    ...(r.compared ? [] : ["", "The coordinate system isn't confirmed yet, so measurements aren't compared with the survey."]),
    "",
    "## Each side of the sketch",
    "",
  ];
  if (r.sides.length === 0) out.push("The sketch's lines weren't read.");
  else {
    out.push("| Side | Drawn as | Written along the line | Number beside it | What it means | The survey gives | Compared | Read | How sure | Where on the photo |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const s of r.sides) {
      const head = `| ${cell(`${s.from} to ${s.to}`)} | ${s.drawn}${s.lineRead === "doubt" ? " (read with doubt)" : ""} | ${cell(s.label) || "Nothing"} |`;
      const grid = s.gridM !== null ? `${s.gridM.toFixed(3)} m on the grid` : "Not both surveyed";
      if (s.entries.length === 0) out.push(`${head} None written | | ${grid} | | | | |`);
      for (const e of s.entries) out.push(`${head} ${cell(e.text)} | ${e.meaning} | ${grid} | ${STATUS_WORDS[e.status]} | ${cell(read(e))} | ${CONFIDENCE_WORDS[e.confidence]} | ${where(e)} |`);
    }
  }
  out.push("", "## Point numbers", "");
  if (r.points.length === 0) out.push("No point numbers were read.");
  else {
    out.push("| Written | Survey point | How matched | Read | How sure | Where on the photo |", "| --- | --- | --- | --- | --- | --- |");
    for (const p of r.points) {
      if (p.entries.length === 0) out.push(`| ${cell(p.label)} | ${p.pointId ? cell(p.pointId) : "None"} | ${HOW_MATCHED[p.how]} | On the drawing only | | |`);
      for (const e of p.entries) out.push(`| ${cell(p.label)} | ${p.pointId ? cell(p.pointId) : "None"} | ${HOW_MATCHED[p.how]} | ${cell(read(e))} | ${CONFIDENCE_WORDS[e.confidence]} | ${where(e)} |`);
    }
  }
  const table = (heading: string, entries: readonly ReportEntry[], empty: string) => {
    out.push("", `## ${heading}`, "");
    if (entries.length === 0) {
      out.push(empty);
      return;
    }
    out.push("| Written | Where it belongs | What it means | Compared | Read | How sure | Where on the photo |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const e of entries) out.push(`| ${cell(e.text)} | ${cell(e.side ? `${e.side.from} to ${e.side.to}` : e.near ? `Near ${e.near}` : "Not tied to a point")} | ${e.meaning} | ${STATUS_WORDS[e.status]} | ${cell(read(e))} | ${CONFIDENCE_WORDS[e.confidence]} | ${where(e)} |`);
  };
  table("Measurements not along one drawn side", r.between, "None.");
  table("Other writing", r.other, "None.");
  const [needs, quiet] = [r.unclear.filter((u) => !u.quiet), r.unclear.filter((u) => u.quiet)];
  out.push("", "## Unclear or uncertain, for the surveyor to decide", "", "None of these was used as a fact: each waits for the surveyor. What the survey disagrees with comes first.", "");
  if (needs.length === 0) out.push("Nothing.");
  for (const u of needs) out.push(`- **${cell(u.what)}** (${where(u)}): ${cell(u.reasons.join(" "))}`);
  if (quiet.length > 0) {
    out.push("", "### Also read with doubt", "", "Labels and notes, and measurements the survey agrees with exactly as read. Not used as facts either.", "");
    for (const u of quiet) out.push(`- **${cell(u.what)}** (${where(u)}): ${cell(u.reasons.join(" "))}`);
  }
  if (r.questions.length > 0) out.push("", "## What the engine asks", "", ...r.questions.map((q) => `- ${cell(q)}`));
  if (r.unreadable.length > 0) out.push("", "## Seen but not read", "", ...r.unreadable.map((u) => `- ${cell(u)}`));
  return out.join(LF);
}
