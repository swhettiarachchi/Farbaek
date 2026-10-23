/**
 * The Loom's shape and motion (ADR 0056), shared by the 3D scene (WebGL,
 * desktops with a mouse) and its 2D drawing (every other screen), so both
 * show the same thing: the six RealityLoop stages on a tilted ring turning
 * slowly round the knight, evidence packets travelling the thread, and fine
 * motes rising.
 *
 * Plain numbers and functions: no React, no three.js. The colours mirror
 * src/styles/tokens.css (a canvas can't read CSS variables cheaply per frame).
 */

export const LOOM_COLORS = {
  accent: "#2450f0",
  cyan: "#0a6e85",
  ink: "#121317",
  /** Intent, Code, Test (verified) · Approval (waiting) · Proof, Launch (not yet). */
  stages: ["#2450f0", "#2450f0", "#2450f0", "#d98e04", "#9aa0aa", "#9aa0aa"],
  motes: ["#2450f0", "#0a6e85", "#7f9cff", "#9aa0aa"],
} as const;

export const LOOM = {
  inner: { rx: 2.0, rz: 1.12, tube: 0.009, opacity: 0.75 },
  outer: { rx: 2.7, rz: 1.5, tube: 0.005, opacity: 0.14 },
  /** The ring group's Euler rotation (x, y, z, applied z first) and its drop below the knight's centre. */
  tilt: [0.36, 0, -0.14] as const,
  drop: -0.15,
  /** Radians per second the rings turn about their upright axis. */
  spin: 0.11,
  node: { core: 0.075, halo: 0.16, haloOpacity: 0.12 },
  packets: { count: 12, size: 0.026, lapsPerSecond: 0.03 },
  motes: { count: 260, size: 0.03, opacity: 0.7, seed: 11 },
  camera: { y: 0.15, z: 6.6, fov: 35 },
  knight: { height: 3.25, y: 0.08 },
} as const;

export type Vec3 = { x: number; y: number; z: number };

/** A point on a ring at a fraction of the way round by length, like the 3D curve's getPointAt. */
export function ringPoint(ring: { rx: number; rz: number }, u: number): Vec3 {
  const table = arcTable(ring.rx, ring.rz);
  const target = (((u % 1) + 1) % 1) * table[table.length - 1]!;
  let lo = 0;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (table[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const span = table[i]! - table[i - 1]! || 1;
  const a = ((i - 1 + (target - table[i - 1]!) / span) / (table.length - 1)) * Math.PI * 2;
  return { x: Math.cos(a) * ring.rx, y: 0, z: Math.sin(a) * ring.rz };
}

const ARC_STEPS = 256;
const arcCache = new Map<string, number[]>();
/** Cumulative length round an ellipse, sampled evenly by angle. */
function arcTable(rx: number, rz: number): number[] {
  const key = `${rx}:${rz}`;
  const cached = arcCache.get(key);
  if (cached) return cached;
  const table = [0];
  for (let i = 1; i <= ARC_STEPS; i++) {
    const a0 = ((i - 1) / ARC_STEPS) * Math.PI * 2;
    const a1 = (i / ARC_STEPS) * Math.PI * 2;
    table.push(table[i - 1]! + Math.hypot(Math.cos(a1) * rx - Math.cos(a0) * rx, Math.sin(a1) * rz - Math.sin(a0) * rz));
  }
  arcCache.set(key, table);
  return table;
}

/** A ring-local point turned by the spin, then by the ring group's tilt, then dropped: world space. */
export function toWorld(p: Vec3, spin: number): Vec3 {
  // Spin about y (three.js: x' = x cos + z sin, z' = -x sin + z cos).
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  let x = p.x * cs + p.z * ss;
  let y = p.y;
  let z = -p.x * ss + p.z * cs;
  // Euler XYZ: z rotation first, then x (y is 0).
  const [ax, , az] = LOOM.tilt;
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  return { x, y: y + LOOM.drop, z };
}

/**
 * Where the drawing sits: `scale` pixels per world unit at the knight's
 * depth, and the pixel where the knight's centre is.
 */
export interface LoomView {
  scale: number;
  knightX: number;
  knightY: number;
}

export interface Projected {
  x: number;
  y: number;
  /** Size multiplier from perspective: above 1 nearer the camera. */
  k: number;
  /** World depth: positive is in front of the knight. */
  z: number;
}

/** A world point on the drawing, seen from the 3D scene's camera. */
export function project(p: Vec3, view: LoomView): Projected {
  const k = LOOM.camera.z / (LOOM.camera.z - p.z);
  return {
    x: view.knightX + p.x * view.scale * k,
    // The knight's centre is at y = knight.y; the camera looks along -z from camera.y.
    y: view.knightY - ((p.y - LOOM.camera.y) * k - (LOOM.knight.y - LOOM.camera.y)) * view.scale,
    k,
    z: p.z,
  };
}

export type LoomShape =
  | { kind: "line"; points: [number, number][]; color: string; width: number; alpha: number }
  | { kind: "dot"; x: number; y: number; r: number; color: string; alpha: number };

export interface LoomFrame {
  /** Drawn behind the knight, then the knight, then `front` over him. */
  back: LoomShape[];
  front: LoomShape[];
}

const RING_SAMPLES = 120;

/** A world point moved toward the knight's centre by `by` (1 leaves it). */
function shrink(p: Vec3, by: number): Vec3 {
  return by === 1 ? p : { x: p.x * by, y: p.y * by, z: p.z * by };
}

/** A ring's outline, split where it passes behind the knight's plane. */
function ringLines(ring: { rx: number; rz: number; tube: number; opacity: number }, color: string, spin: number, view: LoomView, ringScale: number, frame: LoomFrame) {
  let run: [number, number][] = [];
  let inFront: boolean | null = null;
  const flush = () => {
    if (run.length > 1) (inFront ? frame.front : frame.back).push({ kind: "line", points: run, color, width: ring.tube * 2 * view.scale, alpha: ring.opacity });
  };
  for (let i = 0; i <= RING_SAMPLES; i++) {
    const a = (i / RING_SAMPLES) * Math.PI * 2;
    const p = project(shrink(toWorld({ x: Math.cos(a) * ring.rx, y: 0, z: Math.sin(a) * ring.rz }, spin), ringScale), view);
    const front = p.z >= 0;
    if (inFront !== null && front !== inFront) {
      // Close this run at the crossing point and start the next from it, so there's no gap.
      run.push([p.x, p.y]);
      flush();
      run = [run[run.length - 2] ?? [p.x, p.y]];
    }
    inFront = front;
    run.push([p.x, p.y]);
  }
  flush();
}

/** Deterministic motes, as in the 3D scene: positions in a 9 by 7 by 4 box and a rising speed each. */
export function motes(count: number = LOOM.motes.count): { x: number; y: number; z: number; speed: number; color: string }[] {
  let seed: number = LOOM.motes.seed;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: count }, () => {
    const x = (rand() - 0.5) * 9;
    const y = (rand() - 0.5) * 7;
    const z = (rand() - 0.5) * 4 - 1;
    const color = LOOM_COLORS.motes[Math.floor(rand() * LOOM_COLORS.motes.length)]!;
    return { x, y, z, speed: 0.05 + rand() * 0.12, color };
  });
}

/**
 * Everything to draw at `t` seconds, back to front within each layer.
 * `ringScale` draws the rings and what rides on them closer to the knight
 * (narrow screens); sizes and the motes stay as they are.
 */
export function loomFrame(t: number, view: LoomView, { field = [], ringScale = 1 }: { field?: ReturnType<typeof motes>; ringScale?: number } = {}): LoomFrame {
  const frame: LoomFrame = { back: [], front: [] };
  const spin = t * LOOM.spin;

  // three.js sizes points by half the screen's height, not by world units: tan(fov / 2) of a world unit each.
  const moteRadius = (LOOM.motes.size / 2) * Math.tan(((LOOM.camera.fov / 2) * Math.PI) / 180);
  for (const m of field) {
    const y = ((((m.y + m.speed * t + 3.5) % 7) + 7) % 7) - 3.5;
    const p = project({ x: m.x, y, z: m.z }, view);
    (p.z >= 0 ? frame.front : frame.back).push({ kind: "dot", x: p.x, y: p.y, r: moteRadius * view.scale * p.k, color: m.color, alpha: LOOM.motes.opacity });
  }

  ringLines(LOOM.outer, LOOM_COLORS.ink, spin, view, ringScale, frame);
  ringLines(LOOM.inner, LOOM_COLORS.accent, spin, view, ringScale, frame);

  const dots: { p: Projected; shapes: LoomShape[] }[] = [];
  LOOM_COLORS.stages.forEach((color, i) => {
    const p = project(shrink(toWorld(ringPoint(LOOM.inner, i / LOOM_COLORS.stages.length), spin), ringScale), view);
    dots.push({
      p,
      shapes: [
        { kind: "dot", x: p.x, y: p.y, r: LOOM.node.halo * view.scale * p.k, color, alpha: LOOM.node.haloOpacity },
        { kind: "dot", x: p.x, y: p.y, r: LOOM.node.core * view.scale * p.k, color, alpha: 1 },
      ],
    });
  });
  for (let i = 0; i < LOOM.packets.count; i++) {
    const u = (t * LOOM.packets.lapsPerSecond + i / LOOM.packets.count) % 1;
    const p = project(shrink(toWorld(ringPoint(LOOM.inner, u), spin), ringScale), view);
    const r = LOOM.packets.size * (0.7 + 0.3 * Math.sin(t * 3 + i)) * view.scale * p.k;
    dots.push({ p, shapes: [{ kind: "dot", x: p.x, y: p.y, r, color: LOOM_COLORS.cyan, alpha: 1 }] });
  }
  // Farther first, so nearer nodes cover them.
  dots.sort((a, b) => a.p.z - b.p.z);
  for (const d of dots) (d.p.z >= 0 ? frame.front : frame.back).push(...d.shapes);
  return frame;
}
