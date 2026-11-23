/**
 * Leica GSI files (GSI-8 and GSI-16), read strictly (stage 194). Each line is
 * a block of words; each word is a two-digit word index, four information
 * characters (the sixth is the unit), a sign, then 8 or 16 data characters.
 * GSI-16 lines may start with "*". Sources: Leica's GSI ONLINE guide and
 * Format Manager reference (research notes, "Survey instrument export
 * formats", leica_gsi.md).
 *
 * Read: the point number (WI 11), the target's easting, northing and height
 * (WI 81, 82, 83) or a station's (84, 85, 86), and a code given on the same
 * line (WI 71, the remark, or WI 41). Never guessed:
 * - a code line standing on its own (Leica doesn't tie it to a point);
 * - coordinates without a point number (word 11), or a word given twice on
 *   one line: the line is refused;
 * - a height alone (word 83 without 81 and 82): counted and left out;
 * - feet (Leica doesn't say international or US survey feet);
 * - raw angles and distances (WI 21, 22, 31 or 32 and 33) from a station
 *   line (84, 85, 86, 88): worked out by radiation (ADR 0236), each
 *   station's circle oriented by its first shot to a point the file gives
 *   coordinates for, since GSI doesn't say whether the instrument oriented it;
 * - GSI-8 coordinates outside the project's grid: 8 digits can't hold a
 *   grid easting to the millimetre, so leading digits may have been cut.
 * Every problem is reported with its line; nothing is repaired.
 */
import { bearingFromDeltas } from "../angles";
import type { CrsRecord } from "../crs";
import { codeProblem, finishPoints, guardFile, impliedDecimal, numberedLines, pointIdProblem } from "./common";
import type { ImportedPoint, ImportIssue } from "./delimited";
import { CHECK_LIMIT_M, gap, reduceSetup, type ReducedPoint, type Setup, type Shot } from "./reduce";

/** Decimals implied by the unit digit, for lengths: metres to 1 mm, 1/10 mm and 1/100 mm. Feet (1, 7) and angle units aren't lengths here. */
const METRE_DECIMALS: Record<string, number> = { "0": 3, "6": 4, "8": 5 };
const FEET = new Set(["1", "7"]);

const WORD = /^(\d{2})([0-9.]{4})([+-])(\S{8}|\S{16})$/;

export interface GsiRead {
  points: ImportedPoint[];
  issues: ImportIssue[];
  variant: "GSI-8" | "GSI-16" | "mixed" | null;
  /** How many points were worked out from observations, and from how many stations (ADR 0236). */
  reduced: { points: number; stations: number } | null;
}

/** Whether text looks like GSI: its first few blocks are made only of GSI words. */
export function looksLikeGsi(text: string): boolean {
  const blocks = numberedLines(text)
    .map((l) => l.text.trim().replace(/^\*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
  return blocks.length > 0 && blocks.every((b) => b.split(/\s+/).every((w) => WORD.test(w)));
}

/** Strips the zero fill from a text word (point numbers, codes): "0000A110" is "A110", "00000000" is "0", "0000.125" is "0.125". */
const unfill = (data: string) => data.replace(/^0+(?=[^.])/, "");

type Word = { wi: string; unit: string; sign: "+" | "-"; data: string };

/** A length word in metres (31 to 33, 84 to 88), or null when it isn't one. */
const lengthOf = (w: Word): number | null => {
  const d = METRE_DECIMALS[w.unit];
  return d === undefined || !/^\d+$/.test(w.data) ? null : impliedDecimal(w.sign, w.data, d);
};

/**
 * An angle word (21, 22) in degrees, by its unit digit: 2 gons and 3 decimal degrees, each with 5 implied decimals; 4 degrees,
 * minutes and seconds packed as DDDMMSSs (the last digit tenths of a second); 5 mils with 4 decimals. Leica's own decodes are the
 * test cases (research notes, leica_gsi.md).
 */
export const angleOf = (w: Word): number | null => {
  if (!/^\d+$/.test(w.data)) return null;
  const sign = w.sign === "-" ? -1 : 1;
  if (w.unit === "2") return impliedDecimal(w.sign, w.data, 5) * 0.9;
  if (w.unit === "3") return impliedDecimal(w.sign, w.data, 5);
  if (w.unit === "5") return (impliedDecimal(w.sign, w.data, 4) * 360) / 6400;
  if (w.unit === "4") {
    const d = w.data;
    const minutes = Number(d.slice(-5, -3));
    const seconds = Number(`${d.slice(-3, -1)}.${d.slice(-1)}`);
    if (minutes >= 60 || seconds >= 60) return null;
    return sign * (Number(d.slice(0, -5) || "0") + minutes / 60 + seconds / 3600);
  }
  return null;
};

/** A line's code: the remark (71) when it's filled, else the code word (41); an empty remark is written as zeros. */
const codeOfLine = (word: (wi: string) => Word | undefined): string | null => {
  const w = [word("71"), word("41")].find((x) => x && unfill(x.data) !== "0");
  return w ? unfill(w.data) : null;
};

interface GsiShot {
  line: number;
  target: string;
  hz: number | null;
  v: number | null;
  sd: number | null;
  hd: number | null;
  dh: number | null;
  reflector: number | null;
  code: string | null;
  station: Setup | null;
}

export function parseGsi(text: string, crs: CrsRecord | null = null): GsiRead {
  const guard = guardFile(text, "This is a binary file, perhaps a Leica DBX job. Export the job from the instrument as GSI-16 or as ASCII with coordinates, then import that.");
  if (guard) return { points: [], issues: [guard], variant: null, reduced: null };
  const issues: ImportIssue[] = [];
  const read: ImportedPoint[] = [];
  let short = 0;
  let long = 0;
  // GSI-8 coordinate words only: point numbers and codes in 8 characters say nothing about cut coordinates.
  let shortCoords = 0;
  let rawLines = 0;
  let codeAlone = 0;
  let heightOnly = 0;
  // Observations (stage 228, ADR 0236): the station set up last, the reflector height in force, and every shot read.
  let currentStation: Setup | null = null;
  let reflector: number | null = null;
  const shotsRead: GsiShot[] = [];
  let reducedCount: { points: number; stations: number } | null = null;
  for (const { line, text: raw } of numberedLines(text)) {
    const body = raw.trim().replace(/^\*/, "").trim();
    if (!body) continue;
    const words = body.split(/\s+/);
    const parsed: { wi: string; unit: string; sign: "+" | "-"; data: string }[] = [];
    let bad = false;
    for (const [k, w] of words.entries()) {
      const m = WORD.exec(w);
      if (!m) {
        issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}, word ${k + 1} ("${w.slice(0, 24)}") isn't a GSI word of 15 or 23 characters.` });
        bad = true;
        break;
      }
      if (parsed.some((p) => p.wi === m[1])) {
        issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}: word ${m[1]} appears twice, so Farbaek can't tell which one holds the value.` });
        bad = true;
        break;
      }
      if (m[4]!.length === 8) {
        short++;
        if (/^8[1-6]$/.test(m[1]!)) shortCoords++;
      } else long++;
      parsed.push({ wi: m[1]!, unit: m[2]![3]!, sign: m[3] as "+" | "-", data: m[4]! });
    }
    if (bad) continue;
    const word = (wi: string) => parsed.find((p) => p.wi === wi);
    const id = word("11");
    const coords = [word("81"), word("82"), word("83")];
    const station = [word("84"), word("85"), word("86")];
    const set = coords[0] || coords[1] ? coords : station[0] || station[1] ? station : null;
    if (!set) {
      if (word("83") || word("86")) heightOnly++;
      else if (word("21") || word("22") || word("31") || word("32")) {
        rawLines++;
        // A shot (ADR 0236): its target, circle reading, zenith angle, distance and reflector height, kept for the reduction below.
        if (word("87")) reflector = lengthOf(word("87")!);
        shotsRead.push({ line, target: id ? unfill(id.data) : "", hz: word("21") ? angleOf(word("21")!) : null, v: word("22") ? angleOf(word("22")!) : null, sd: word("31") ? lengthOf(word("31")!) : null, hd: word("32") ? lengthOf(word("32")!) : null, dh: word("33") ? lengthOf(word("33")!) : null, reflector, code: codeOfLine(word), station: currentStation });
      } else if (!id && word("41")) codeAlone++;
      continue;
    }
    // A station line sets up the station its later shots come from; its instrument height is on the line (88) when given.
    if (!(coords[0] || coords[1]) && (station[0] || station[1]) && id) {
      const se = station[0] ? lengthOf(station[0]) : null;
      const sn = station[1] ? lengthOf(station[1]) : null;
      const sz = station[2] ? lengthOf(station[2]) : null;
      currentStation = se !== null && sn !== null ? { line, station: unfill(id.data), e: se, n: sn, z: sz, instrumentHeight: word("88") ? lengthOf(word("88")!) : null, orientation: null, backsight: null } : null;
      reflector = null;
    }
    if (!id || /^0+$/.test(id.data)) {
      issues.push({ code: "MISSING_POINT_ID", severity: "error", line, message: `Line ${line} has coordinates but no point number (word 11${id ? " is all zeros" : " is missing"}).` });
      continue;
    }
    const pointId = unfill(id.data);
    const idProblem = pointIdProblem(pointId);
    if (idProblem) {
      issues.push({ code: "POINT_ID_TOO_LONG", severity: "error", line, message: `Line ${line} ${idProblem}.` });
      continue;
    }
    const [e, n, z] = set;
    if (!e || !n) {
      issues.push({ code: "MISSING_COORDINATE", severity: "error", line, message: `Line ${line}, point ${pointId}: the ${!e ? "easting" : "northing"} word is missing.` });
      continue;
    }
    const value = (w: NonNullable<typeof e>, what: string): number | string => {
      if (FEET.has(w.unit)) return `the ${what} is in feet. Set the instrument's distance unit to metres and export again: Leica doesn't say which foot.`;
      const d = METRE_DECIMALS[w.unit];
      if (d === undefined) return `the ${what}'s unit digit "${w.unit}" isn't a length in metres.`;
      if (!/^\d+$/.test(w.data)) return `the ${what} "${w.data}" isn't a number.`;
      return impliedDecimal(w.sign, w.data, d);
    };
    const ve = value(e, "easting");
    const vn = value(n, "northing");
    const vz = z ? value(z, "height") : null;
    const problem = [ve, vn, vz].find((v): v is string => typeof v === "string");
    if (problem) {
      issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}, point ${pointId}: ${problem}` });
      continue;
    }
    if (ve === 0 && vn === 0 && (vz === null || vz === 0)) {
      issues.push({ code: "MISSING_COORDINATE", severity: "error", line, message: `Line ${line}, point ${pointId}: every coordinate is zero, which is how an unset field is written. Check the point in the instrument.` });
      continue;
    }
    // The remark (71) when it's filled, else the code word (41): an empty remark is written as zeros.
    const codeWord = [word("71"), word("41")].find((w) => w && unfill(w.data) !== "0");
    const code = codeWord ? unfill(codeWord.data) : null;
    const cp = codeProblem(code);
    if (cp) {
      issues.push({ code: "CODE_NOT_READABLE", severity: "error", line, message: `Line ${line}, point ${pointId} ${cp}.` });
      continue;
    }
    read.push({ line, pointId, e: ve as number, n: vn as number, z: vz as number | null, code });
  }
  const variant = short && long ? "mixed" : long ? "GSI-16" : short ? "GSI-8" : null;

  // The shots, worked out station by station (ADR 0236). GSI doesn't say whether a circle reading was oriented on the instrument, so
  // each station's orientation comes from its first shot to a point the file gives coordinates for; later shots to such points are
  // checks. Nothing is adjusted.
  const given = new Map(read.map((p) => [p.pointId, p] as const));
  const leftOut: string[] = [];
  const computed = new Map<string, ReducedPoint>();
  const checks: { pointId: string; d: number; what: string }[] = [];
  const spreads: string[] = [];
  const stations = new Map<Setup, GsiShot[]>();
  for (const s of shotsRead) {
    if (!s.station) {
      leftOut.push(`line ${s.line}: no station is set up before it`);
      continue;
    }
    const list = stations.get(s.station);
    if (list) list.push(s);
    else stations.set(s.station, [s]);
  }
  for (const [setup, list] of stations) {
    const orienting = list.find((s) => s.hz !== null && s.target !== setup.station && given.has(s.target));
    if (!orienting) {
      for (const s of list) leftOut.push(`line ${s.line}: station ${setup.station} has no shot to a point the file gives coordinates for, so its circle can't be oriented`);
      continue;
    }
    const to = given.get(orienting.target)!;
    const azimuth = bearingFromDeltas(to.e - setup.e, to.n - setup.n);
    if (azimuth === null) {
      for (const s of list) leftOut.push(`line ${s.line}: station ${setup.station} and point ${orienting.target} are at the same place, so the circle can't be oriented`);
      continue;
    }
    const orientation = azimuth - orienting.hz!;
    const shots: Shot[] = [];
    for (const s of list) {
      if (pointIdProblem(s.target) || codeProblem(s.code)) leftOut.push(`line ${s.line}: the shot's point number or code can't be read`);
      else if (s.hz === null || s.v === null) leftOut.push(`line ${s.line}: its angles aren't in degrees, gons or mils`);
      else if (s.sd === null && s.hd === null) {
        // An angles-only shot orients the circle, or checks it; it places nothing.
        if (s !== orienting) leftOut.push(`line ${s.line}: it has no distance (an angles-only shot)`);
      } else {
        const slope = s.sd ?? Math.hypot(s.hd!, s.dh ?? 0);
        const zenith = s.sd !== null ? s.v : s.dh !== null ? (Math.atan2(s.hd!, s.dh) * 180) / Math.PI : 90;
        shots.push({ kind: "polar", line: s.line, to: s.target, code: s.code, targetHeight: s.sd !== null || s.dh !== null ? s.reflector : null, horizontal: s.hz, oriented: false, orientation, zenith, slope });
      }
    }
    const r = reduceSetup(setup, shots, crs);
    for (const p of r.problems) leftOut.push(`line ${p.line}: ${p.message}`);
    for (const s of r.spreads) spreads.push(`${s.pointId} (${s.spread.toFixed(3)} m)`);
    for (const p of r.points) {
      const before = computed.get(p.pointId);
      if (before) checks.push({ pointId: p.pointId, d: gap(before, p), what: `the shots from stations ${before.from} and ${p.from}` });
      computed.set(p.pointId, p);
    }
  }
  for (const [id, p] of computed) {
    const g = given.get(id);
    if (g) checks.push({ pointId: id, d: gap(g, p), what: `its coordinates in the file and the shot from station ${p.from}` });
  }
  const fromShots = [...computed.values()].filter((p) => !given.has(p.pointId));
  for (const p of fromShots) read.push({ line: p.line, pointId: p.pointId, e: p.e, n: p.n, z: p.z, code: p.code });
  if (fromShots.length > 0) {
    const used = new Set(fromShots.map((p) => p.from));
    const scales = fromShots.map((p) => p.scale);
    const [lo, hi] = [Math.min(...scales), Math.max(...scales)];
    const scaleText = !crs || !crs.tm ? "distances used as measured, since the coordinate system has no projection" : `distances reduced to the grid with ${crs.name}'s scale factor and each station's height (${lo === hi ? lo.toFixed(7) : `${lo.toFixed(7)} to ${hi.toFixed(7)}`})`;
    issues.push({ code: "OBSERVATIONS_REDUCED", severity: "warning", line: null, message: `${fromShots.length} ${fromShots.length === 1 ? "point was" : "points were"} worked out from the instrument's observations, by radiation from ${used.size} ${used.size === 1 ? "station" : "stations"} (${[...used].slice(0, 6).join(", ")}${used.size > 6 ? " and more" : ""}), with nothing adjusted. Each station's circle was oriented by its first shot to a point the file gives coordinates for; ${scaleText}.${fromShots.some((p) => p.z !== null) ? " Heights don't include earth curvature and refraction, a few millimetres on a 200 m sight." : ""}` });
  }
  const off = checks.filter((c) => c.d > CHECK_LIMIT_M);
  for (const c of off.slice(0, 20)) issues.push({ code: "OBSERVATION_CHECK", severity: "warning", line: null, message: `Point ${c.pointId}: ${c.what} differ by ${c.d.toFixed(3)} m. Check the observations and coordinates: nothing was adjusted.` });
  if (checks.length - off.length > 0) issues.push({ code: "OBSERVATION_CHECK", severity: "warning", line: null, message: `${checks.length - off.length} ${checks.length - off.length === 1 ? "check agrees" : "checks agree"} within ${CHECK_LIMIT_M * 100} cm: a point given in the file or shot twice, worked out the same.` });
  if (spreads.length > 0) issues.push({ code: "OBSERVATION_CHECK", severity: "warning", line: null, message: `Shots to the same point from one station differ by more than ${CHECK_LIMIT_M * 100} cm, and were averaged: ${spreads.slice(0, 8).join(", ")}${spreads.length > 8 ? " and more" : ""}.` });
  if (leftOut.length > 0) {
    const byReason = new Map<string, number[]>();
    for (const entry of leftOut) {
      const m = /^line (\d+): (.*)$/.exec(entry);
      const reason = m ? m[2]! : entry;
      const ls = byReason.get(reason);
      if (ls) ls.push(m ? Number(m[1]) : 0);
      else byReason.set(reason, [m ? Number(m[1]) : 0]);
    }
    const reasons = [...byReason].map(([reason, ls]) => `${reason} (${ls.length === 1 ? `line ${ls[0]}` : `lines ${ls.length > 6 ? `${ls.slice(0, 6).join(", ")} and more` : `${ls.slice(0, -1).join(", ")} and ${ls.at(-1)}`}`})`);
    issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `${leftOut.length} ${leftOut.length === 1 ? "shot was" : "shots were"} left out: ${reasons.slice(0, 4).join("; ")}${reasons.length > 4 ? `; and ${reasons.length - 4} more reasons` : ""}.` });
  }
  reducedCount = fromShots.length > 0 ? { points: fromShots.length, stations: new Set(fromShots.map((p) => p.from)).size } : null;
  if (read.length === 0 && rawLines > 0) {
    return { points: [], issues: [...issues, { code: "NO_ROWS", severity: "error", line: null, message: `This file holds raw observations (angles and distances on ${rawLines} ${rawLines === 1 ? "line" : "lines"}), and none could be worked out into coordinates: ${leftOut[0] ?? "there is no station with coordinates (words 84 and 85) to work them out from"}. Record the station's coordinates and a shot to a known point, or export the coordinates (GSI words 81 to 83, or a CSV).` }], variant, reduced: null };
  }
  if (read.length === 0 && issues.length === 0) return { points: [], issues: [{ code: "NO_ROWS", severity: "error", line: null, message: "The file has no points with coordinates (GSI words 11 with 81 and 82)." }], variant, reduced: null };
  if (codeAlone > 0) issues.push({ code: "CODE_NOT_READABLE", severity: "warning", line: null, message: `${codeAlone} code ${codeAlone === 1 ? "line stands" : "lines stand"} on ${codeAlone === 1 ? "its" : "their"} own. Leica doesn't tie a code line to a point, so Farbaek doesn't guess: record codes as remarks with each point, or export them in the same line.` });
  if (heightOnly > 0) issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `${heightOnly} ${heightOnly === 1 ? "line has" : "lines have"} a height but no easting and northing (word 83 without 81 and 82), so ${heightOnly === 1 ? "it wasn't" : "they weren't"} imported.` });
  if (variant === "mixed") issues.push({ code: "CHECK_FILE", severity: "warning", line: null, message: "The file mixes GSI-8 and GSI-16 words, which usually means files were joined or edited by hand. Check it." });
  // GSI-8 keeps 8 digits: a grid easting such as 500000.000 m can't fit to the millimetre, so points outside the grid were likely cut.
  const r = crs?.plausibleRange;
  if (r && shortCoords && read.some((p) => p.e < r.minE || p.e > r.maxE || p.n < r.minN || p.n > r.maxN)) {
    issues.push({ code: "NOT_A_NUMBER", severity: "error", line: null, message: `These GSI-8 coordinates fall outside ${crs!.name}. GSI-8 keeps only 8 digits, so the leading digits of grid coordinates are cut. Export the job as GSI-16, which keeps them.` });
  }
  return { ...finishPoints(read, issues), variant, reduced: reducedCount };
}
