import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LOOM, LOOM_COLORS, loomFrame, motes, project, ringPoint, toWorld, type LoomView } from "./loom-geometry";

const view: LoomView = { scale: 100, knightX: 200, knightY: 250 };

describe("the Loom's 2D geometry", () => {
  it("turns and tilts a ring point exactly as the 3D scene's groups do", () => {
    const tilt = new THREE.Group();
    tilt.rotation.set(...LOOM.tilt);
    tilt.position.set(0, LOOM.drop, 0);
    const spin = new THREE.Group();
    tilt.add(spin);
    for (const [angle, local] of [
      [0, new THREE.Vector3(2, 0, 0)],
      [1.3, new THREE.Vector3(0.4, 0, 1.1)],
      [4.2, new THREE.Vector3(-1.7, 0, -0.6)],
    ] as const) {
      spin.rotation.y = angle;
      tilt.updateMatrixWorld(true);
      const want = spin.localToWorld(local.clone());
      const got = toWorld({ x: local.x, y: local.y, z: local.z }, angle);
      expect(got.x).toBeCloseTo(want.x, 6);
      expect(got.y).toBeCloseTo(want.y, 6);
      expect(got.z).toBeCloseTo(want.z, 6);
    }
  });

  it("projects like the 3D scene's camera, with the knight's centre where the poster's knight is", () => {
    const height = 800;
    const camera = new THREE.PerspectiveCamera(LOOM.camera.fov, 1, 0.1, 100);
    camera.position.set(0, LOOM.camera.y, LOOM.camera.z);
    camera.updateMatrixWorld(true);
    // Pixels per unit at the knight's depth for a canvas this tall.
    const scale = height / 2 / Math.tan(THREE.MathUtils.degToRad(LOOM.camera.fov / 2)) / LOOM.camera.z;
    const centre = new THREE.Vector3(0, LOOM.knight.y, 0).project(camera);
    const knightX = ((centre.x + 1) / 2) * height;
    const knightY = ((1 - centre.y) / 2) * height;
    for (const p of [new THREE.Vector3(1.2, 0.4, 0.9), new THREE.Vector3(-2.1, -0.6, -1.4)]) {
      const ndc = p.clone().project(camera);
      const got = project({ x: p.x, y: p.y, z: p.z }, { scale, knightX, knightY });
      expect(got.x).toBeCloseTo(((ndc.x + 1) / 2) * height, 4);
      expect(got.y).toBeCloseTo(((1 - ndc.y) / 2) * height, 4);
    }
    expect(project({ x: 0, y: LOOM.knight.y, z: 0 }, view)).toMatchObject({ x: 200, y: 250, k: 1 });
  });

  it("spaces the stages evenly by length round the ring, like the 3D curve", () => {
    const { rx, rz } = LOOM.inner;
    // By symmetry, each quarter of the length ends at an end of an axis.
    for (const [u, x, z] of [[0, rx, 0], [0.25, 0, rz], [0.5, -rx, 0], [0.75, 0, -rz], [1, rx, 0]] as const) {
      const p = ringPoint(LOOM.inner, u);
      expect(p.x).toBeCloseTo(x, 2);
      expect(p.z).toBeCloseTo(z, 2);
    }
    for (let i = 0; i < 6; i++) {
      const p = ringPoint(LOOM.inner, i / 6);
      expect((p.x / rx) ** 2 + (p.z / rz) ** 2).toBeCloseTo(1, 6);
    }
  });

  it("draws every stage and packet once, the far side behind the knight and the near side over him", () => {
    const frame = loomFrame(4, view);
    const dots = [...frame.back, ...frame.front].filter((s) => s.kind === "dot");
    // A halo and a core per stage, one dot per packet.
    expect(dots).toHaveLength(LOOM_COLORS.stages.length * 2 + LOOM.packets.count);
    expect(frame.back.some((s) => s.kind === "line")).toBe(true);
    expect(frame.front.some((s) => s.kind === "line")).toBe(true);
    expect(frame.front.some((s) => s.kind === "dot")).toBe(true);
    expect(frame.back.some((s) => s.kind === "dot")).toBe(true);
  });

  it("moves with time, draws the rings tighter on narrow screens, and repeats its motes exactly", () => {
    const xs = (t: number, ringScale = 1) =>
      [...loomFrame(t, view, { ringScale }).back, ...loomFrame(t, view, { ringScale }).front].flatMap((s) => (s.kind === "line" ? s.points.map(([x]) => x) : []));
    const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
    expect(loomFrame(4, view)).not.toEqual(loomFrame(5, view));
    expect(spread(xs(4, 0.78))).toBeLessThan(spread(xs(4)) * 0.8);
    expect(motes(10)).toEqual(motes(10));
  });
});
