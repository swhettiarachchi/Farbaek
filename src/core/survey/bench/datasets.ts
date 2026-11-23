/**
 * SYNTHETIC benchmark datasets for AutoSurvey's deterministic path (stage 232): made up, reproducible from a fixed seed, and never
 * a real survey. They exercise what a typical job holds (boundary marks, a road's two edges, fences and walls, buildings, posts and
 * spot heights) at three sizes, plus a total station job with a closed traverse, so the timings in docs/survey/BENCHMARKS.md can be
 * measured again on any machine.
 */

/** A small, fast generator with a fixed seed (mulberry32): the same numbers on every machine. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const E0 = 500_000;
const N0 = 600_000;
const f3 = (v: number) => v.toFixed(3);

export interface BenchDataset {
  name: string;
  file: string;
  text: string;
  points: number;
}

/**
 * A points file (point, easting, northing, height, code) for a lot of about 80 m by 60 m on SLD99's grid: 10 boundary marks
 * observed in order round it, a road along the south with two edges, a live fence and a masonry wall, three buildings, five
 * electric posts, and `spots` spot heights inside.
 */
export function pointsJob(name: string, spots: number, seed = 231): BenchDataset {
  const rnd = random(seed);
  const rows: string[] = ["Point,Easting,Northing,Height,Code"];
  let n = 0;
  const add = (e: number, nn: number, z: number | null, code: string) => rows.push(`${++n},${f3(E0 + e)},${f3(N0 + nn)},${z === null ? "" : f3(z)},${code}`);
  // The boundary, anticlockwise from the south-west corner, every mark a few centimetres off a clean shape.
  const corners: [number, number][] = [[0, 0], [28, 0.4], [56, 0.9], [80, 1.2], [81, 30], [82.5, 61], [55, 62], [27, 61.4], [-0.8, 60.2], [-0.4, 30.5]];
  for (const [i, [e, nn]] of corners.entries()) add(e + (rnd() - 0.5) * 0.04, nn + (rnd() - 0.5) * 0.04, 20 + rnd(), i % 3 === 0 ? "CP" : "St");
  // The road's two edges, 6 m apart, south of the land.
  for (const side of ["RD1", "RD2"]) for (let i = 0; i <= 9; i++) add(-6 + i * 10, side === "RD1" ? -1 : -7, 19.5 + rnd() * 0.3, side);
  // A live fence along the north and a masonry wall on the east.
  for (let i = 0; i < 15; i++) add(i * 5.5, 63 + rnd() * 0.3, null, "LF");
  for (let i = 0; i < 8; i++) add(84 + rnd() * 0.2, 4 + i * 7.5, null, "MW");
  // Three buildings, each a rectangle observed corner by corner.
  for (const [e, nn] of [[10, 10], [45, 12], [20, 40]] as const) for (const [de, dn] of [[0, 0], [12, 0], [12, 8], [0, 8]] as const) add(e + de, nn + dn, null, "P");
  for (let i = 0; i < 5; i++) add(5 + i * 17, -3.5, null, "EP");
  // Spot heights over the land, with no code: a gentle slope and some noise.
  for (let i = 0; i < spots; i++) {
    const e = 1 + rnd() * 78;
    const nn = 1 + rnd() * 58;
    add(e, nn, 20 + nn * 0.05 + (rnd() - 0.5) * 0.4, "");
  }
  return { name, file: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, text: rows.join("\n"), points: n };
}

/**
 * A Sokkia SDR33 job of observations: control A with a backsight, a closed traverse A, S1 to S4 and back to A (legs of about 60 m,
 * turning 72°), and `shotsPerStation` detail shots from each station. Distances are slope distances at a zenith angle of 90°.
 */
export function traverseJob(shotsPerStation: number, seed = 232): BenchDataset {
  const rnd = random(seed);
  const f16 = (s: string) => s.padEnd(16);
  const id16 = (s: string) => s.padStart(16);
  const lines = [`00NM${f16("SDR33 V04-04.02")}${"".padEnd(4)}${f16("23-Nov-26 09:30")}111111`, `01NM${" ".repeat(46)}1`];
  lines.push(`08KI${id16("BS")}${f16(f3(N0 + 100))}${f16(f3(E0))}${f16("20.000")}${f16("CP")}`);
  const stations = ["A", "S1", "S2", "S3", "S4"];
  const LEGS = ["60.002", "60.009", "59.996", "60.004", "60.011"];
  let shots = 0;
  // A regular pentagon of 60 m sides, walked clockwise from A: the azimuth of leg k is 90° + 72°·k.
  for (const [k, st] of stations.entries()) {
    const back = k === 0 ? "BS" : stations[k - 1]!;
    const backAzimuth = k === 0 ? 0 : (90 + 72 * (k - 1) + 180) % 360;
    lines.push(k === 0 ? `02TP${id16(st)}${f16(f3(N0))}${f16(f3(E0))}${f16("20.000")}${f16("1.500")}${f16("STN")}` : `02TP${id16(st)}${f16("")}${f16("")}${f16("")}${f16("1.500")}${f16("STN")}`);
    lines.push(`03NM${f16("1.500")}`);
    // Each backsight read on the circle at zero, so a circle reading is the azimuth minus the backsight's.
    lines.push(`07TP${id16(st)}${id16(back)}${f16(backAzimuth.toFixed(4))}${f16("0.0000")}`);
    const ahead = (90 + 72 * k) % 360;
    const next = k === stations.length - 1 ? "A" : stations[k + 1]!;
    // The legs are measured a few millimetres long or short, each differently, so the loop misses A by about a centimetre.
    lines.push(`09F1${id16(st)}${id16(next)}${f16(LEGS[k]!)}${f16("90.0000")}${f16(((ahead - backAzimuth + 360) % 360).toFixed(4))}${f16("TS")}`);
    for (let i = 0; i < shotsPerStation; i++) {
      const az = rnd() * 360;
      lines.push(`09F1${id16(st)}${id16(`${st}-${i + 1}`)}${f16((5 + rnd() * 40).toFixed(3))}${f16((88 + rnd() * 4).toFixed(4))}${f16(((az - backAzimuth + 360) % 360).toFixed(4))}${f16("")}`);
      shots++;
    }
  }
  return { name: "Total station traverse", file: "traverse.sdr", text: lines.join("\r\n"), points: shots + stations.length + 1 };
}

export const BENCH_DATASETS: readonly BenchDataset[] = [pointsJob("Small job", 40), pointsJob("Typical job", 250), pointsJob("Large job", 3_000), traverseJob(60)];
