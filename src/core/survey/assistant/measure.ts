/**
 * Measurements dictated to the assistant (stage 195): legs of a field book
 * ("from 101 to 102 bearing 45 30 15 distance 25.40, then to 103 bearing ...")
 * and coordinates ("point 215 northing ... easting ... height ... code CP").
 * They're never applied to the plan: the rows go to the Import step's typed
 * tables, under the same checks and confirmation as typing them (survey skill
 * rule 3). Values are kept as the digits said, never rounded (rule 10).
 */
import { bearingText, readBearing, readLength, readNumber } from "./spoken";

export interface LegRow {
  from: string;
  to: string;
  bearing: string;
  distance: string;
  code: string;
}
export interface CoordinateRow {
  point: string;
  n: string;
  e: string;
  z: string;
  code: string;
}

/** A point number said as digits, number words or letters and digits ("A110"). */
function pointName(text: string): string | null {
  const t = text.replace(/\b(point|station|number|no\.?)\b/gi, " ").trim();
  if (/^[A-Za-z]{1,4}\d{1,8}$|^\d{1,8}[A-Za-z]{0,2}$/.test(t)) return t.toUpperCase() === t ? t : t.toUpperCase();
  const n = readNumber(t);
  return n && Number.isInteger(n.value) && n.value >= 0 ? n.text : null;
}

const SEGMENT = /\s*(?:;|\bthen\b|\bnext\b|\band then\b)\s*/i;

/** Legs from the words. A leg without "from" starts where the last one ended. Each problem names the leg. */
export function readLegs(text: string): { rows: LegRow[]; problems: string[] } {
  const rows: LegRow[] = [];
  const problems: string[] = [];
  const parts = text
    .split(SEGMENT)
    .map((s) => s.replace(/^\s*(?:a\s+)?legs?\b/i, "").trim())
    .filter(Boolean);
  parts.forEach((part, i) => {
    const what = `Leg ${i + 1}`;
    const b = /\bbearing\b/i.exec(part);
    const d = /\bdistance\b/i.exec(part);
    const c = /\bcode\b/i.exec(part);
    if (!b || !d || d.index < b.index) {
      problems.push(`${what}: say the bearing, then the distance ("bearing … distance …").`);
      return;
    }
    const head = part.slice(0, b.index);
    const bearingWords = part.slice(b.index + b[0].length, d.index);
    const distanceText = part.slice(d.index + d[0].length, c && c.index > d.index ? c.index : undefined);
    const code = c && c.index > d.index ? part.slice(c.index + c[0].length).trim().split(/\s+/).slice(0, 3).join(" ") : "";
    const m = /^(?:\s*from\s+(.+?))?\s*\bto\s+(.+?)\s*$/i.exec(head);
    const from = m?.[1] ? pointName(m[1]) : (rows[rows.length - 1]?.to ?? null);
    const to = m?.[2] ? pointName(m[2]) : null;
    if (!to || !from) {
      problems.push(`${what}: say which points it runs between ("from 101 to 102").`);
      return;
    }
    const bearing = readBearing(bearingWords);
    if (!bearing) {
      problems.push(`${what}: the bearing "${bearingWords.trim()}" isn't one Farbaek reads for certain.`);
      return;
    }
    const length = readLength(distanceText);
    if (!length) {
      problems.push(`${what}: the distance "${distanceText.trim()}" isn't a length above zero.`);
      return;
    }
    if (length.unit === "ft") {
      problems.push(`${what}: distances go in metres. Say it in metres, or type it.`);
      return;
    }
    rows.push({ from, to, bearing: bearingText(bearingWords)!, distance: length.text, code });
  });
  return { rows, problems };
}

const KEY = /\b(northing|north|easting|east|height|elevation|level|rl|code)\b/gi;

/** Coordinate rows from the words: "point 215 northing … easting … height … code CP". Each problem names the row. */
export function readCoordinateRows(text: string): { rows: CoordinateRow[]; problems: string[] } {
  const rows: CoordinateRow[] = [];
  const problems: string[] = [];
  const parts = text
    .split(/\s*(?:;|\bthen\b|\bnext\b)\s*|(?=\bpoint\b)/i)
    .map((s) => s.trim())
    .filter((s) => /\bpoint\b/i.test(s) || /\bnorth|east/i.test(s));
  parts.forEach((part, i) => {
    const what = `Row ${i + 1}`;
    const marks = [...part.matchAll(KEY)].map((m) => ({ key: m[1]!.toLowerCase(), at: m.index!, end: m.index! + m[0].length }));
    const nameText = part.slice(0, marks[0]?.at ?? part.length);
    const point = pointName(nameText);
    const value = (keys: string[]) => {
      const k = marks.findIndex((m) => keys.includes(m.key));
      if (k < 0) return null;
      return part.slice(marks[k]!.end, marks[k + 1]?.at ?? part.length).trim();
    };
    const nText = value(["northing", "north"]);
    const eText = value(["easting", "east"]);
    const zText = value(["height", "elevation", "level", "rl"]);
    const code = (value(["code"]) ?? "").split(/\s+/).slice(0, 3).join(" ");
    const n = nText === null ? null : readNumber(nText);
    const e = eText === null ? null : readNumber(eText);
    const z = zText === null || zText === "" ? null : readNumber(zText);
    if (!point) problems.push(`${what}: say the point number first ("point 215 …").`);
    else if (!n || !e) problems.push(`${what}, point ${point}: say the northing and the easting as numbers.`);
    else if (zText && !z) problems.push(`${what}, point ${point}: the height "${zText}" isn't a number.`);
    else rows.push({ point, n: n.text, e: e.text, z: z?.text ?? "", code });
  });
  return { rows, problems };
}
