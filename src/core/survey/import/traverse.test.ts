/**
 * A total station job's traverse (stage 231, ADR 0241): its closure said, and adjusted only by the rule the surveyor chose. SDR33
 * records laid out as Sokkia's interface document gives them, on a local grid (scale 1) so every answer is hand arithmetic.
 * SYNTHETIC values: a square loop from control A, east to B, north to C, and back to A with the closing distance 2 cm long.
 */
import { describe, expect, it } from "vitest";
import { crsById } from "../crs";
import { readPoints } from "./read";
import { parseSdr } from "./sdr";

const rpad = (s: string, n: number) => s.padEnd(n);
const lpad = (s: string, n: number) => s.padStart(n);
const f16 = (s: string) => rpad(s, 16);
const header = `00NM${rpad("SDR33 V04-04.02", 16)}${rpad("", 4)}${rpad("23-Nov-26 09:30", 16)}111111`;
const instr = `01NM${" ".repeat(46)}1`;
/** A coordinate record keyed in (KI): control. */
const pos = (id: string, n: string, e: string, code = "CP") => `08KI${lpad(id, 16)}${f16(n)}${f16(e)}${f16("0.000")}${f16(code)}`;
/** A coordinate record the instrument's topography program computed from a shot (TP). */
const computedPos = (id: string, n: string, e: string, code = "CP") => `08TP${lpad(id, 16)}${f16(n)}${f16(e)}${f16("0.000")}${f16(code)}`;
const stn = (id: string, n: string, e: string) => `02TP${lpad(id, 16)}${f16(n)}${f16(e)}${f16(n ? "0.000" : "")}${f16("1.500")}${f16("STN")}`;
const target = `03NM${f16("1.500")}`;
const bkb = (from: string, to: string, az: string) => `07TP${lpad(from, 16)}${lpad(to, 16)}${f16(az)}${f16("0.0000")}`;
const obs = (from: string, to: string, sd: string, ha: string, code = "CP") => `09F1${lpad(from, 16)}${lpad(to, 16)}${f16(sd)}${f16("90.0000")}${f16(ha)}${f16(code)}`;

/** The loop. B and C are set up with no coordinates (or, with `carried`, the ones the instrument carried from the shot). */
const loop = ({ carried = false, closing = "141.441356" } = {}) =>
  [
    header,
    instr,
    pos("BS", "1100.000", "1000.000"),
    stn("A", "1000.000", "1000.000"),
    target,
    bkb("A", "BS", "0.0000"),
    obs("A", "B", "100.000", "90.0000"),
    obs("A", "d1", "10.000", "45.0000", "TREE"),
    // At B the backsight to A is due west: a circle reading of 90° is due north.
    carried ? stn("B", "1000.000", "1100.000") : stn("B", "", ""),
    target,
    bkb("B", "A", "270.0000"),
    obs("B", "C", "100.000", "90.0000"),
    obs("B", "d2", "10.000", "180.0000", "TREE"),
    carried ? stn("C", "1100.000", "1100.000") : stn("C", "", ""),
    target,
    bkb("C", "B", "180.0000"),
    // Back to A, south-west: 141.421 m would close exactly; the closing distance is 2 cm long.
    obs("C", "A", closing, "45.0000"),
    obs("C", "d3", "10.000", "0.0000", "TREE"),
  ].join("\n");

const LOCAL = crsById("LOCAL");
const at = (r: { points: { pointId: string; e: number; n: number; z: number | null }[] }, id: string) => r.points.find((p) => p.pointId === id)!;
// Where the shot to A lands: just under 2 cm beyond it (141.441356 m against 100√2), south-west.
const s = (141.441356 - 100 * Math.SQRT2) * Math.SQRT1_2;
const L = 100 + 100 + 141.441356;

describe("a total station job's traverse", () => {
  it("says the closure and adjusts nothing until a rule is chosen", () => {
    const r = parseSdr(loop(), LOCAL);
    expect(r.reduced?.traverse).toMatchObject({ start: "A", through: ["B", "C"], closesOn: "A", adjusted: null });
    expect(r.reduced!.traverse!.misclosure.dE).toBeCloseTo(-s, 6);
    expect(r.reduced!.traverse!.misclosure.dN).toBeCloseTo(-s, 6);
    expect(r.reduced!.traverse!.length).toBeCloseTo(L, 6);
    const says = r.issues.map((i) => [i.code, i.message]);
    expect(says).toContainEqual(["TRAVERSE_CLOSURE", "The traverse from station A through B and C closes on point A 0.020 m out (easting -0.014 m, northing -0.014 m) over 341.44 m, 1 in 17,072. Nothing was adjusted."]);
    // The closing point is said with the closure, not again as a check.
    expect(r.issues.some((i) => i.code === "OBSERVATION_CHECK" && i.message.startsWith("Point A:"))).toBe(false);
    expect([at(r, "B").e, at(r, "B").n]).toEqual([expect.closeTo(1100, 9), expect.closeTo(1000, 9)]);
    expect([at(r, "A").e, at(r, "A").n]).toEqual([1000, 1000]);
  });

  it("adjusts by the compass rule when chosen: stations by their distance along it, points with their station, control fixed", () => {
    const plain = parseSdr(loop(), LOCAL);
    const r = parseSdr(loop(), LOCAL, "compass");
    const kB = (s * 100) / L;
    const kC = (s * 200) / L;
    expect(at(r, "B").e).toBeCloseTo(1100 + kB, 9);
    expect(at(r, "B").n).toBeCloseTo(1000 + kB, 9);
    expect(at(r, "C").e).toBeCloseTo(1100 + kC, 9);
    expect(at(r, "C").n).toBeCloseTo(1100 + kC, 9);
    // A detail point moves with the station it was shot from: d2 with B, d3 with C; d1, shot from control, doesn't move.
    expect(at(r, "d2").e - at(plain, "d2").e).toBeCloseTo(kB, 9);
    expect(at(r, "d3").n - at(plain, "d3").n).toBeCloseTo(kC, 9);
    expect(at(r, "d1")).toEqual(at(plain, "d1"));
    // Control and the closing point keep their coordinates; heights aren't adjusted.
    expect(at(r, "A")).toEqual(at(plain, "A"));
    expect(at(r, "BS")).toEqual(at(plain, "BS"));
    expect(at(r, "d3").z).toBe(at(plain, "d3").z);
    expect(r.reduced!.traverse!.adjusted).toMatchObject({ method: "compass", engine: "adjust/1.0.0", largest: expect.closeTo(Math.hypot(kC, kC), 9) });
    const closure = r.issues.find((i) => i.code === "TRAVERSE_CLOSURE")!.message;
    expect(closure).toBe(
      "The traverse from station A through B and C closes on point A 0.020 m out (easting -0.014 m, northing -0.014 m) over 341.44 m, 1 in 17,072. Adjusted by the compass rule (Bowditch), as you chose: the stations moved by up to 0.012 m, and the points shot from each station moved with it. Angles weren't balanced first, since the angular misclosure isn't worked out, and heights weren't adjusted.",
    );
    expect(r.issues.find((i) => i.code === "OBSERVATIONS_REDUCED")!.message).toMatch(/then the traverse adjusted by the compass rule \(Bowditch\), as you chose:/);
  });

  it("adjusts by the transit rule when chosen: eastings by eastings, northings by northings", () => {
    const r = parseSdr(loop(), LOCAL, "transit");
    // Eastings run 100 + 0 + 100.014; northings 0 + 100 + 100.014. B took no northing, C its first share.
    const sumE = 100 + (100 + s * 0) + 141.441356 * Math.SQRT1_2 - 100;
    const SE = 100 + 141.441356 * Math.SQRT1_2;
    expect(sumE).toBeCloseTo(SE, 9);
    expect(at(r, "B").e).toBeCloseTo(1100 + (s * 100) / SE, 9);
    expect(at(r, "B").n).toBeCloseTo(1000, 9);
    expect(at(r, "C").e).toBeCloseTo(1100 + (s * 100) / SE, 9);
    expect(at(r, "C").n).toBeCloseTo(1100 + (s * 100) / SE, 9);
  });

  it("says a closure within the file's own rounding as within half a millimetre, never as a ratio of billions or a signed zero", () => {
    // 141.421356 m is 100√2 to the micrometre: the loop closes to within rounding.
    const r = parseSdr(loop({ closing: "141.421356" }), LOCAL, "compass");
    const closure = r.issues.find((i) => i.code === "TRAVERSE_CLOSURE")!.message;
    expect(closure).toBe(
      "The traverse from station A through B and C closes on point A within half a millimetre over 341.42 m. Adjusted by the compass rule (Bowditch), as you chose: no station moved by as much as half a millimetre. Angles weren't balanced first, since the angular misclosure isn't worked out, and heights weren't adjusted.",
    );
    expect(closure).not.toMatch(/-0\.000|1 in \d{3},\d{3},\d{3}/);
  });

  it("finds the same traverse when the instrument carried each station's coordinates forward", () => {
    const r = parseSdr(loop({ carried: true }), LOCAL, "compass");
    expect(r.reduced?.traverse).toMatchObject({ start: "A", through: ["B", "C"], closesOn: "A" });
    expect(at(r, "C").e).toBeCloseTo(1100 + (s * 200) / L, 9);
  });

  it("closes on control the file keys in, before or after it was shot, but not on coordinates the instrument computed", () => {
    // An open traverse: K keyed in (08KI) at the start of the job, shot from C 2 cm long.
    const toK = loop().replace(obs("C", "A", "141.441356", "45.0000"), obs("C", "K", "141.441356", "45.0000"));
    const before = toK.replace(pos("BS", "1100.000", "1000.000"), `${pos("BS", "1100.000", "1000.000")}\n${pos("K", "1000.000", "1000.000")}`);
    expect(parseSdr(before, LOCAL).reduced?.traverse).toMatchObject({ start: "A", through: ["B", "C"], closesOn: "K" });
    // Keyed in after it was shot, even within a millimetre of the shot: still control, so it closes the traverse and never moves.
    const keyedAfter = `${toK}\n${pos("K", "999.986", "999.986")}`;
    const r = parseSdr(keyedAfter, LOCAL, "compass");
    expect(r.reduced?.traverse).toMatchObject({ closesOn: "K" });
    expect(at(r, "K")).toMatchObject({ e: 999.986, n: 999.986 });
    // The instrument's own computed record for K (08TP), written after the shot: not control, so nothing closes.
    expect(parseSdr(`${toK}\n${computedPos("K", "999.985858", "999.985858")}`, LOCAL).reduced?.traverse ?? null).toBeNull();
  });

  it("prefers the loop's closure on its own start to a later check on another point, and never counts a back-shot as a closure", () => {
    // M keyed in early and shot from C after the shot back to A, 5 mm out: the loop through B and C still closes on A.
    const withM = loop()
      .replace(pos("BS", "1100.000", "1000.000"), `${pos("BS", "1100.000", "1000.000")}\n${pos("M", "1090.000", "1100.000")}`)
      .replace(obs("C", "d3", "10.000", "0.0000", "TREE"), `${obs("C", "d3", "10.000", "0.0000", "TREE")}\n${obs("C", "M", "10.005", "0.0000")}`);
    expect(parseSdr(withM, LOCAL).reduced?.traverse).toMatchObject({ closesOn: "A", through: ["B", "C"] });
    // An open traverse A, B, C with B's shot back to A recorded: re-measuring the leg it came from isn't a closure.
    const open = loop().replace(obs("C", "A", "141.441356", "45.0000"), "").replace(obs("B", "C", "100.000", "90.0000"), `${obs("B", "A", "100.003", "0.0000")}\n${obs("B", "C", "100.000", "90.0000")}`);
    expect(parseSdr(open, LOCAL).reduced?.traverse ?? null).toBeNull();
  });

  it("moves a computed record with the station whose shot it carries, even when the point is shot again later", () => {
    // d2 shot from B with the instrument's computed record straight after, then shot again from C: not a closure, and it moves with B.
    const d2 = (pos2: string) =>
      loop().replace(obs("B", "d2", "10.000", "180.0000", "TREE"), `${obs("B", "d2", "10.000", "180.0000", "TREE")}\n${pos2}`).replace(obs("C", "d3", "10.000", "0.0000", "TREE"), `${obs("C", "d3", "10.000", "0.0000", "TREE")}\n${obs("C", "d2", "100.499", "354.2894", "TREE")}`);
    const text = d2(computedPos("d2", "1000.000", "1110.000", "TREE"));
    expect(parseSdr(text, LOCAL).reduced?.traverse).toMatchObject({ closesOn: "A" });
    const plain = parseSdr(text, LOCAL);
    const r = parseSdr(text, LOCAL, "compass");
    expect(at(r, "d2").e - at(plain, "d2").e).toBeCloseTo((s * 100) / L, 9);
  });

  it("says a station's movement as it is, measured from where its setup put it, even when a later shot to it disagrees", () => {
    // C's shot back to B is 3 cm long: B stays where A's shot put it, the later shot is a check, and B moves by its correction only.
    const text = loop().replace(obs("C", "d3", "10.000", "0.0000", "TREE"), `${obs("C", "d3", "10.000", "0.0000", "TREE")}\n${obs("C", "B", "100.030", "0.0000")}`);
    const plain = parseSdr(text, LOCAL);
    expect([at(plain, "B").e, at(plain, "B").n]).toEqual([expect.closeTo(1100, 9), expect.closeTo(1000, 9)]);
    const r = parseSdr(text, LOCAL, "compass");
    const moved = Math.hypot(at(r, "C").e - at(plain, "C").e, at(r, "C").n - at(plain, "C").n);
    expect(Math.hypot(at(r, "B").e - at(plain, "B").e, at(r, "B").n - at(plain, "B").n)).toBeLessThan(moved);
    expect(r.issues.find((i) => i.code === "TRAVERSE_CLOSURE")!.message).toContain(`moved by up to ${moved.toFixed(3)} m`);
  });

  it("finds carried stations on a projected grid, where the instrument's scale and Farbaek's differ by millimetres", () => {
    // The loop on SLD99 near E 450 100: the instrument carried B and C at a scale of 1, Farbaek reduces at the grid's (about 0.99995).
    const grid = [
      header,
      instr,
      pos("BS", "700200.000", "450100.000"),
      stn("A", "700100.000", "450100.000"),
      target,
      bkb("A", "BS", "0.0000"),
      obs("A", "B", "100.000", "90.0000"),
      stn("B", "700100.000", "450200.000"),
      target,
      bkb("B", "A", "270.0000"),
      obs("B", "C", "100.000", "90.0000"),
      stn("C", "700200.000", "450200.000"),
      target,
      bkb("C", "B", "180.0000"),
      obs("C", "A", "141.441356", "45.0000"),
    ].join("\n");
    const r = parseSdr(grid, crsById("EPSG:5235"), "compass");
    expect(r.reduced?.traverse).toMatchObject({ start: "A", through: ["B", "C"], closesOn: "A", adjusted: { method: "compass" } });
  });

  it("keeps what it records of a long traverse within the import's limit", () => {
    // 60 stations east in a line from A, each set up with no coordinates, closing on K keyed in 1 cm off.
    const lines = [header, instr, pos("BS", "1100.000", "1000.000"), pos("K", "1000.000", "7000.010"), stn("A", "1000.000", "1000.000"), target, bkb("A", "BS", "0.0000")];
    for (let i = 0; i < 60; i++) {
      const here = i === 0 ? "A" : `STATION-${i}`;
      if (i > 0) lines.push(stn(here, "", ""), target, bkb(here, i === 1 ? "A" : `STATION-${i - 1}`, "270.0000"));
      lines.push(obs(here, i === 59 ? "K" : `STATION-${i + 1}`, "100.000", i === 0 ? "90.0000" : "180.0000"));
    }
    const r = parseSdr(lines.join("\n"), LOCAL, "compass");
    const t = r.reduced!.traverse!;
    expect(t).toMatchObject({ closesOn: "K", stations: 59 });
    expect(t.through).toHaveLength(40);
    expect(t.adjusted!.corrections).toHaveLength(40);
    expect(JSON.stringify(t).length).toBeLessThan(4_000);
  });

  it("refuses a rule it can't use, rather than ignoring the choice", () => {
    // No traverse closes: the shot back to A is gone.
    const none = parseSdr(loop().replace(obs("C", "A", "141.441356", "45.0000"), ""), LOCAL, "compass");
    expect(none.points).toEqual([]);
    expect(none.issues.at(-1)).toMatchObject({ code: "TRAVERSE_NOT_ADJUSTED", severity: "error", message: expect.stringMatching(/has no traverse that closes on a point with known coordinates/) });
    // A format Farbaek doesn't adjust.
    const csv = readPoints("delimited", "1,1000,1000\n", { delimiter: ",", hasHeader: false, columns: ["point", "easting", "northing"], crs: LOCAL ?? null, adjust: "compass" });
    expect(csv.issues[0]).toMatchObject({ code: "TRAVERSE_NOT_ADJUSTED", severity: "error" });
    // The same choice through the one entry point adjusts an SDR job.
    const sdr = readPoints("sdr", loop(), { delimiter: ",", hasHeader: false, columns: ["point", "easting", "northing"], crs: LOCAL ?? null, adjust: "compass" });
    expect(sdr.reduction?.traverse?.adjusted?.method).toBe("compass");
  });
});
