/**
 * Sokkia SDR files (SDR2x and SDR33), read by their fixed byte positions
 * (stage 194, observations from stage 225). Source: Sokkia, "Interfacing with
 * the SOKKIA SDR Electronic Field Book", V04-04.xx, October 1999 (research
 * notes, "Survey instrument export formats", sdr_topcon_trimble_landxml.md).
 *
 * - The 00 header picks the layout: "SDR20…" for 4-character point numbers
 *   and 10-byte numbers, "SDR33…" for 16-byte fields. Byte 41 is the angle
 *   unit (1 degrees, 2 gons, 3 mils), byte 42 the distance unit (1 metres,
 *   2 feet); a "13DU3" note means US survey feet.
 * - 08 records are coordinates: point, northing, easting, elevation, code.
 *   02 records are the occupied stations, with their coordinates (blank when
 *   the instrument didn't compute them) and instrument height.
 * - Observations (ADR 0236): 01 gives the vertical angle convention (zenith or
 *   from the horizontal) and the prism constant, 03 the target height, 07 the
 *   backsight (azimuth and circle reading), 09 a shot (slope distance,
 *   vertical and horizontal readings; derivation MC means corrected, with the
 *   horizontal reading an azimuth; F2 is face right), 11 a reduced shot
 *   (azimuth, horizontal and vertical distance). They are reduced by
 *   radiation from each station (reduce.ts), nothing adjusted.
 * - The SDR's own rule: a later record replaces an earlier one, and a
 *   coordinate record stands over an observation of the same point. Each
 *   such pair is a check, and the difference is said.
 * - 18 records are pre-calibration RTK values, and 24 latitude and longitude:
 *   neither is imported.
 * Feet are refused (set the instrument to metres): nothing is converted.
 */
import type { CrsRecord } from "../crs";
import { codeProblem, guardFile, numberedLines, pointIdProblem } from "./common";
import { IMPORT_LIMITS, readNumber, type ImportedPoint, type ImportIssue } from "./delimited";
import { normaliseDegrees } from "../angles";
import { CHECK_LIMIT_M, gap, reduceSetup, type ReducedPoint, type Setup, type Shot } from "./reduce";
import { ADJUST_NAMES, type AdjustMethod, type InstrumentPrecision } from "../adjust";
import { COMPUTED_DERIVATIONS, CONTROL_DERIVATIONS, carriedShot, closeTraverse, type At, type ShotAt, type StationRecord, type TraverseClosure } from "./closure";

export interface SdrRead {
  points: ImportedPoint[];
  issues: ImportIssue[];
  layout: "SDR2x" | "SDR33" | null;
  /** How many points were computed from observations, from how many stations, and the traverse's closure: recorded with the import. */
  reduced: { points: number; stations: number; traverse: TraverseClosure | null } | null;
}

/** Whether text is an SDR file: its first record is a 00 header naming SDR2x or SDR33. */
export function looksLikeSdr(text: string): boolean {
  const first = numberedLines(text).map((l) => l.text.replace(/\u0002/g, "").trim()).find(Boolean) ?? "";
  return /^00(?:NM|ED)SDR(?:2\d|33)/.test(first);
}

/** Field widths by layout: [id, number] in bytes, and where each 08 and 02 field starts (0-based). */
const LAYOUTS = {
  SDR2x: { id: 4, num: 10, pos: { id: 4, n: 8, e: 18, z: 28, code: 38, codeLen: 16 }, stn: { id: 4, n: 8, e: 18, z: 28, hi: 38, code: 48, codeLen: 16 }, prism: 71 },
  SDR33: { id: 16, num: 16, pos: { id: 4, n: 20, e: 36, z: 52, code: 68, codeLen: 16 }, stn: { id: 4, n: 20, e: 36, z: 52, hi: 68, code: 84, codeLen: 16 }, prism: 83 },
} as const;

/** A point name as stored: right-aligned, and zero-filled when numeric ("00000031" is 31). */
export const pointName = (raw: string) => {
  const t = raw.trim();
  return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t;
};

const ANGLE_UNITS: Record<string, { name: string; toDegrees: (v: number) => number }> = {
  "1": { name: "degrees", toDegrees: (v) => v },
  "2": { name: "gons", toDegrees: (v) => v * 0.9 },
  "3": { name: "mils", toDegrees: (v) => (v * 360) / 6400 },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * `adjust` is the rule the surveyor chose to spread a traverse's misclosure by (ADR 0241); without one, nothing is adjusted.
 * `precision` is the instrument's, which least squares weighs by (ADR 0274); without one, a typical total station's, and it says so.
 */
export function parseSdr(text: string, crs: CrsRecord | null = null, adjust: AdjustMethod | null = null, precision: InstrumentPrecision | null = null): SdrRead {
  const guard = guardFile(text, "This is a binary file, not an SDR text file. Export the job from the instrument or Sokkia's software as an SDR33 or CSV file.");
  if (guard) return { points: [], issues: [guard], layout: null, reduced: null };
  const records = numberedLines(text)
    .map((l) => ({ line: l.line, text: l.text.replace(/\u0002/g, "").trimEnd() }))
    .filter((l) => l.text && !l.text.startsWith("\u0003") && !/^\d{5}$/.test(l.text));
  const header = records[0];
  const version = header?.text.slice(4, 20).trim() ?? "";
  const layout = /^SDR33/.test(version) ? "SDR33" : /^SDR2\d/.test(version) ? "SDR2x" : null;
  if (!header || !/^00(?:NM|ED)/.test(header.text) || !layout) {
    return { points: [], issues: [{ code: "NO_ROWS", severity: "error", line: header?.line ?? null, message: "This isn't an SDR file: its first record isn't an SDR2x or SDR33 header (00NM or 00ED)." }], layout: null, reduced: null };
  }
  const issues: ImportIssue[] = [];
  // Header byte 42 is the distance unit: 1 metres, 2 feet. Anything but 1 is refused, as is a feet note (13DU2, 13DU3) anywhere.
  const units = header.text.padEnd(46);
  const unit = units[41];
  if (unit === "2" || records.some((r) => r.text.startsWith("13DU3") || r.text.startsWith("13DU2"))) {
    return { points: [], issues: [{ code: "NOT_A_NUMBER", severity: "error", line: header.line, message: "The SDR file is in feet. Set the instrument's distance unit to metres and export again: Farbaek stores metres and never converts." }], layout, reduced: null };
  }
  if (unit !== "1") {
    return { points: [], issues: [{ code: "NOT_A_NUMBER", severity: "error", line: header.line, message: `The SDR header doesn't say the distances are in metres (its distance unit, byte 42, is "${unit?.trim() || "blank"}"). Set the instrument's distance unit to metres and export again.` }], layout, reduced: null };
  }
  if (units[44] === "2") {
    issues.push({ code: "CHECK_FILE", severity: "warning", line: header.line, message: "The instrument was set to show coordinates easting first. Sokkia's layout stores northing first in the file, and Farbaek reads it that way: check one point against your field notes." });
  }
  const angle = ANGLE_UNITS[units[40] ?? ""] ?? null;
  const L = LAYOUTS[layout];
  const W = L.num;
  const I = L.id;
  const cell = (rec: string, start: number, width: number) => rec.padEnd(start + width).slice(start, start + width).trim();
  const num = (rec: string, start: number) => {
    const c = cell(rec, start, W);
    return c === "" ? null : readNumber(c);
  };

  // The vertical angle convention: from the 01 record when there is one. Without it, only readings that can be nothing but zenith
  // angles (all within 45° of level, face left or right) are taken as such, and that is said; anything else isn't guessed.
  const record01 = records.find((r) => r.text.startsWith("01"))?.text;
  const verticalOf01 = record01?.padEnd(52)[50];
  const unsaid = record01 ? "the instrument record (01) doesn't say how vertical angles are measured" : "the file has no instrument record (01) saying how vertical angles are measured";
  const obsRecords = records.filter((r) => r.text.startsWith("09"));
  let vertical: "zenith" | "horizontal" | null = verticalOf01 === "1" ? "zenith" : verticalOf01 === "2" ? "horizontal" : null;
  if (vertical === null && obsRecords.length > 0 && angle) {
    const readings = obsRecords.map((r) => num(r.text, 4 + 2 * I + W)).filter((v): v is number => v !== null).map((v) => angle.toDegrees(v));
    if (readings.length > 0 && readings.every((v) => (v > 45 && v < 135) || (v > 225 && v < 315))) {
      vertical = "zenith";
      issues.push({ code: "CHECK_FILE", severity: "warning", line: null, message: `${unsaid[0]!.toUpperCase()}${unsaid.slice(1)}. Every reading is near 90° or 270°, so they were taken as zenith angles: check one height against your field notes.` });
    }
  }
  const prismText = (() => {
    const rec = records.find((r) => r.text.startsWith("01"))?.text;
    const v = rec ? num(rec, L.prism) : null;
    return v === null ? null : `${v} mm`;
  })();

  const byName = new Map<string, ImportedPoint>();
  const order: string[] = [];
  const computed = new Map<string, ReducedPoint>();
  const computedOrder: string[] = [];
  const leftOut: string[] = [];
  // Stations set up with no coordinates to be had, and whether any shot from them was left out (and so already said).
  const lostStations = new Map<string, { line: number; said: boolean }>();
  const checks: { pointId: string; d: number; what: string }[] = [];
  const spreads: string[] = [];
  let observations = 0;
  let skippedOther = 0;
  let coordinateRecords = 0;
  let setup: Setup | null = null;
  // A station set up without coordinates to be had: its shots are left out, each saying so.
  let lost: string | null = null;
  let shots: Shot[] = [];
  let targetHeight: number | null = null;

  // Each occupied station at its first setup, and the station whose shot gave it its coordinates (ADR 0241): the traverse.
  const stations = new Map<string, StationRecord>();
  // Every shot reduced, per point, and each standing coordinate record's derivation (KI keyed, TP computed...): what's control.
  const history = new Map<string, ShotAt[]>();
  const derivation = new Map<string, { station: boolean; code: string }>();
  /** A station at its first setup: control when keyed in or given as control, else linked to the earlier shot it came from. */
  const noteStation = (id: string, at: At, line: number, record: string | null) => {
    if (stations.has(id)) return;
    const set = (from: string | null) => void stations.set(id, { e: at.e, n: at.n, line, from });
    const kind = byName.has(id) ? derivation.get(id) : undefined;
    if ((record !== null && CONTROL_DERIVATIONS.has(record)) || (kind && !kind.station && !COMPUTED_DERIVATIONS.has(kind.code))) return set(null);
    const shot = computed.get(id);
    if (shot && at === shot) return set(shot.from);
    set(carriedShot(at, history.get(id), stations)?.from ?? null);
  };

  const known = (id: string) => byName.get(id) ?? computed.get(id) ?? null;
  // A setup's shots are reduced when the next station is set up, or at the end: a traverse's next station comes from them.
  const flush = () => {
    if (setup && shots.length > 0) {
      const r = reduceSetup(setup, shots, crs);
      for (const p of r.problems) leftOut.push(`line ${p.line}: ${p.message}`);
      for (const s of r.spreads) spreads.push(`${s.pointId} (${s.spread.toFixed(3)} m)`);
      for (const p of r.points) {
        const seen = history.get(p.pointId);
        if (seen) seen.push({ e: p.e, n: p.n, line: p.line, from: p.from });
        else history.set(p.pointId, [{ e: p.e, n: p.n, line: p.line, from: p.from }]);
        const before = computed.get(p.pointId);
        // Shot again from another station: a check, and the later shot stands, as the SDR's rule has it.
        if (before) checks.push({ pointId: p.pointId, d: gap(before, p), what: `the shots from stations ${before.from} and ${p.from}` });
        else computedOrder.push(p.pointId);
        computed.set(p.pointId, p);
      }
    }
    shots = [];
  };

  for (const { line, text: rec } of records.slice(1)) {
    const type = rec.slice(0, 2);
    if (type === "18" || type === "24") {
      skippedOther++;
      continue;
    }
    if (type === "03") {
      const h = num(rec, 4);
      targetHeight = h;
      continue;
    }
    if (type === "07") {
      const from = pointName(cell(rec, 4, I));
      const to = pointName(cell(rec, 4 + I, I));
      const az = num(rec, 4 + 2 * I);
      const circle = num(rec, 4 + 2 * I + W);
      if (setup && from === setup.station && az !== null && circle !== null && angle) {
        setup.orientation = angle.toDegrees(az) - angle.toDegrees(circle);
        setup.backsight = to;
      } else if (setup && from === setup.station) leftOut.push(`line ${line}: the backsight from ${from} can't be read, so ${from}'s circle readings can't be turned into bearings`);
      continue;
    }
    if (type === "09" || type === "11") {
      observations++;
      const from = pointName(cell(rec, 4, I));
      const to = pointName(cell(rec, 4 + I, I));
      const a = num(rec, 4 + 2 * I);
      const b = num(rec, 4 + 2 * I + W);
      const c = num(rec, 4 + 2 * I + 2 * W);
      const code = cell(rec, 4 + 2 * I + 3 * W, 16) || null;
      if (!setup || from !== setup.station) {
        if (!setup && lost && from === lost) lostStations.get(lost)!.said = true;
        leftOut.push(`line ${line}: ${!setup && lost && from === lost ? `station ${lost} has no coordinates, in its record or from an earlier shot, so nothing can be worked out from it` : !setup ? "no station is set up before it" : `it's shot from ${from || "no point"}, which isn't the station set up there (${setup.station})`}`);
        continue;
      }
      if (pointIdProblem(to) || codeProblem(code)) {
        leftOut.push(`line ${line}: the shot's point number or code can't be read`);
        continue;
      }
      if (!angle) {
        leftOut.push(`line ${line}: the header doesn't say the angle unit (byte 41), so the angles can't be read`);
        continue;
      }
      if (a === null || b === null || c === null) {
        const blankDistance = cell(rec, 4 + 2 * I, W) === "";
        leftOut.push(`line ${line}: ${blankDistance ? "it has no distance (an angles-only shot)" : "a reading isn't a plain number"}`);
        continue;
      }
      if (type === "11") {
        // Heights from reduced records aren't worked out: what their vertical distance includes isn't given.
        shots.push({ kind: "reduced", line, to, code, targetHeight: null, azimuth: angle.toDegrees(a), horizontal: b, vertical: c });
        continue;
      }
      if (!vertical) {
        leftOut.push(`line ${line}: ${unsaid}, and its readings don't settle it`);
        continue;
      }
      const derivation = rec.slice(2, 4);
      // As a zenith angle, within one turn: an angle from the horizontal of 355° (5° down) is a zenith angle of 95°.
      let zenith = normaliseDegrees(vertical === "zenith" ? angle.toDegrees(b) : 90 - angle.toDegrees(b));
      let horizontal = angle.toDegrees(c);
      // Face right: the circle is half a turn round and the zenith angle measured the other way.
      if (derivation === "F2") {
        zenith = normaliseDegrees(360 - zenith);
        horizontal += 180;
      }
      // The backsight in force now: a later one never re-orients this shot.
      shots.push({ kind: "polar", line, to, code, targetHeight, horizontal, oriented: derivation === "MC", orientation: setup.orientation, zenith, slope: a });
      continue;
    }
    if (type !== "08" && type !== "02") continue;
    if (++coordinateRecords > IMPORT_LIMITS.maxRows) {
      return { points: [], issues: [{ code: "TOO_MANY_ROWS", severity: "error", line: null, message: `The file has more than ${IMPORT_LIMITS.maxRows} coordinate records; the limit is ${IMPORT_LIMITS.maxRows}.` }], layout, reduced: null };
    }
    const f = type === "08" ? L.pos : L.stn;
    const padded = rec.padEnd(f.code + f.codeLen);
    const id = pointName(padded.slice(f.id, f.id + L.id));
    const problem = pointIdProblem(id);
    if (problem) {
      issues.push({ code: "MISSING_POINT_ID", severity: "error", line, message: `Line ${line} ${problem}.` });
      continue;
    }
    const n = num(padded, f.n);
    const e = num(padded, f.e);
    const zCell = padded.slice(f.z, f.z + L.num).trim();
    const z = zCell === "" ? null : readNumber(zCell);
    if (type === "02") {
      flush();
      targetHeight = null;
      const hi = num(padded, L.stn.hi);
      const nBlank = padded.slice(f.n, f.n + L.num).trim() === "";
      const eBlank = padded.slice(f.e, f.e + L.num).trim() === "";
      // A station without coordinates in the record is one the instrument didn't compute: it may come from an earlier station's shot.
      if (nBlank && eBlank) {
        const at = known(id);
        setup = at ? { line, station: id, e: at.e, n: at.n, z: at.z, instrumentHeight: hi, orientation: null, backsight: null } : null;
        lost = at ? null : id;
        if (at) noteStation(id, at, line, null);
        else lostStations.set(id, { line, said: false });
        continue;
      }
      lost = null;
      if (n !== null && e !== null && (zCell === "" || z !== null)) {
        setup = { line, station: id, e, n, z, instrumentHeight: hi, orientation: null, backsight: null };
        noteStation(id, { e, n, line }, line, rec.slice(2, 4));
      }
    }
    if (n === null || e === null || (zCell !== "" && z === null)) {
      issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}, point ${id}: a coordinate isn't a plain number in its SDR field.` });
      if (type === "02") setup = null;
      continue;
    }
    const code = padded.slice(f.code, f.code + f.codeLen).trim() || null;
    const cp = codeProblem(code);
    if (cp) {
      issues.push({ code: "CODE_NOT_READABLE", severity: "error", line, message: `Line ${line}, point ${id} ${cp}.` });
      continue;
    }
    const point: ImportedPoint = { line, pointId: id, e, n, z, code };
    const prior = byName.get(id);
    if (prior) {
      if (prior.e !== e || prior.n !== n || prior.z !== z || prior.code !== code) {
        issues.push({ code: "DUPLICATE_POINT_REPLACED", severity: "warning", line, message: `Line ${line}: point ${id} was stored again with different values. The SDR's rule is that the later record replaces the earlier one (line ${prior.line}), so line ${line} is used.` });
        byName.set(id, point);
        derivation.set(id, { station: type === "02", code: rec.slice(2, 4) });
      }
      continue;
    }
    byName.set(id, point);
    derivation.set(id, { station: type === "02", code: rec.slice(2, 4) });
    order.push(id);
  }
  flush();

  // A point the file gives coordinates for stands over one worked out from a shot; the shot is then a check on it.
  for (const id of computedOrder) {
    const given = byName.get(id);
    const shot = computed.get(id)!;
    if (given) checks.push({ pointId: id, d: gap(given, shot), what: `its coordinates in the file and the shot from station ${shot.from}` });
  }
  const fromShots = computedOrder.filter((id) => !byName.has(id)).map((id) => computed.get(id)!);
  if (order.length + fromShots.length > IMPORT_LIMITS.maxRows) {
    return { points: [], issues: [{ code: "TOO_MANY_ROWS", severity: "error", line: null, message: `The file holds more than ${IMPORT_LIMITS.maxRows} points; the limit is ${IMPORT_LIMITS.maxRows}.` }], layout, reduced: null };
  }
  // The traverse that closes on a known point: its closure said, and adjusted only by the rule the surveyor chose (ADR 0241).
  // Control: a station no earlier shot reached, or a record keyed in or given as control. Only control closes a traverse.
  const control = new Map<string, At>();
  for (const [id, g] of byName) {
    const k = derivation.get(id)!;
    if (k.station ? stations.get(id)?.from === null : CONTROL_DERIVATIONS.has(k.code)) control.set(id, g);
  }
  const traverse = closeTraverse(stations, control, history, adjust, precision);
  if (!traverse.ok) return { points: [], issues: [...issues, traverse.issue], layout, reduced: null };
  const place = (p: ImportedPoint, from: string | null): ImportedPoint => {
    const at = traverse.place(p.pointId, p, from);
    return at === p ? p : { ...p, e: at.e, n: at.n };
  };
  // A record the instrument computed from a shot (TP, TV, MC) moves with the station it was shot from; anything else doesn't move.
  const given = order.map((id) => {
    const g = byName.get(id)!;
    const k = derivation.get(id)!;
    return place(g, !k.station && COMPUTED_DERIVATIONS.has(k.code) ? (carriedShot(g, history.get(id), stations)?.from ?? null) : null);
  });
  // Worked-out points sit where they were shot, among the given ones; with none, the order is the file's as before.
  const points: ImportedPoint[] = fromShots.length === 0 ? given : [...given, ...fromShots.map(({ line, pointId, e, n, z, code, from }) => {
          // A station stands where its setup put it, which everything shot from it hangs on; later shots to it are checks.
          const st = stations.get(pointId);
          return place({ line, pointId, e: st ? st.e : e, n: st ? st.n : n, z, code }, from);
        })].sort((a, b) => a.line - b.line);
  const adjusted = traverse.closure?.adjusted ? ADJUST_NAMES[traverse.closure.adjusted.method] : null;

  // The stations the worked-out points came from: not one whose shots only checked points the file gives.
  const stationsUsed = new Set(fromShots.map((p) => p.from));
  // A station with no coordinates and no shot left out from it is still said, with its line.
  for (const [id, l] of lostStations) if (!l.said) leftOut.push(`line ${l.line}: station ${id} has no coordinates, in its record or from an earlier shot, so nothing can be worked out from it`);
  if (fromShots.length > 0) {
    const scales = fromShots.map((p) => p.scale);
    const [lo, hi] = [Math.min(...scales), Math.max(...scales)];
    const scaleText = !crs || !crs.tm ? "distances used as measured, since the coordinate system has no projection" : `distances reduced to the grid with ${crs.name}'s scale factor and each station's height (${lo === hi ? lo.toFixed(7) : `${lo.toFixed(7)} to ${hi.toFixed(7)}`})`;
    const heights = fromShots.some((p) => p.z !== null) ? " Heights don't include earth curvature and refraction, a few millimetres on a 200 m sight." : "";
    issues.push({
      code: "OBSERVATIONS_REDUCED",
      severity: "warning",
      line: null,
      message: `${plural(fromShots.length, "point was", "points were")} worked out from the instrument's observations, by radiation from ${plural(stationsUsed.size, "station", "stations")} (${[...stationsUsed].slice(0, 6).join(", ")}${stationsUsed.size > 6 ? " and more" : ""})${adjusted ? `, then the traverse adjusted by ${adjusted}, as you chose` : ", with nothing adjusted"}: ${angle?.name ?? "angles"}, ${scaleText}.${prismText ? ` The instrument's prism constant was ${prismText}, taken as already applied to the recorded distances.` : ""}${heights}`,
    });
  }
  issues.push(...traverse.issues);
  // The traverse's closing point is said with its closure, not again as a check.
  const said = checks.filter((c) => c.pointId !== traverse.closesOn);
  const off = said.filter((c) => c.d > CHECK_LIMIT_M);
  const agree = said.length - off.length;
  const asShot = adjusted ? "this compares them as shot, before the traverse was adjusted" : "nothing was adjusted";
  for (const c of off.slice(0, 20)) issues.push({ code: "OBSERVATION_CHECK", severity: "warning", line: null, message: `Point ${c.pointId}: ${c.what} differ by ${c.d.toFixed(3)} m. Check the observations and coordinates: ${asShot}.` });
  if (off.length > 20) issues.push({ code: "OBSERVATION_CHECK", severity: "warning", line: null, message: `${off.length - 20} more points differ the same way.` });
  if (agree > 0) issues.push({ code: "OBSERVATION_CHECK", severity: "warning", line: null, message: `${plural(agree, "check agrees", "checks agree")} within ${CHECK_LIMIT_M * 100} cm: a point given in the file or shot twice, worked out the same.` });
  if (spreads.length > 0) issues.push({ code: "OBSERVATION_CHECK", severity: "warning", line: null, message: `Shots to the same point from one station differ by more than ${CHECK_LIMIT_M * 100} cm, and were averaged: ${spreads.slice(0, 8).join(", ")}${spreads.length > 8 ? " and more" : ""}.` });
  // Left out, by reason, each with its lines.
  const byReason = new Map<string, number[]>();
  for (const entry of leftOut) {
    const m = /^line (\d+): (.*)$/.exec(entry);
    const reason = m ? m[2]! : entry;
    const ls = byReason.get(reason);
    if (ls) ls.push(m ? Number(m[1]) : 0);
    else byReason.set(reason, [m ? Number(m[1]) : 0]);
  }
  const reasons = [...byReason].map(([reason, ls]) => `${reason} (${ls.length === 1 ? `line ${ls[0]}` : `lines ${ls.length > 6 ? `${ls.slice(0, 6).join(", ")} and more` : `${ls.slice(0, -1).join(", ")} and ${ls.at(-1)}`}`})`);
  if (leftOut.length > 0) issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `${plural(leftOut.length, "record was", "records were")} left out: ${reasons.slice(0, 4).join("; ")}${reasons.length > 4 ? `; and ${reasons.length - 4} more reasons` : ""}.` });

  if (points.length === 0 && observations > 0) {
    return { points: [], issues: [...issues, { code: "NO_ROWS", severity: "error", line: null, message: `This job holds the instrument's measurements (angles and distances, ${plural(observations, "record", "records")}), and none could be worked out into coordinates: ${leftOut[0] ?? "there is no station with coordinates to work them out from"}. Set up a station with known coordinates and a backsight, or export the coordinates as a CSV (point, northing, easting, height, code).` }], layout, reduced: null };
  }
  if (points.length === 0) return { points: [], issues: [...issues, { code: "NO_ROWS", severity: "error", line: null, message: "The SDR file has no coordinate records (08 or 02) and no observations." }], layout, reduced: null };
  if (skippedOther > 0) issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `${skippedOther} RTK or latitude-longitude ${skippedOther === 1 ? "record was" : "records were"} left out: they aren't grid coordinates in the job's system.` });
  return { points, issues, layout, reduced: fromShots.length > 0 || traverse.closure ? { points: fromShots.length, stations: stationsUsed.size, traverse: traverse.closure } : null };
}
