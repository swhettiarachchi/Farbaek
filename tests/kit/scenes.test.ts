import { describe, expect, it } from "vitest";
// The kit is plain JavaScript served from public/; only its pure helpers run here (three.js loads lazily, in a browser).
// @ts-expect-error: a .js module without types.
import * as kit from "../../public/kit/scenes/v1/scenes.js";
import { SCENE_NAMES } from "@/core/media/library";

describe("Farbaek Scenes v1", () => {
  it("offers the scenes the catalogue names, and pins three.js", () => {
    expect([...kit.SCENES].sort()).toEqual([...SCENE_NAMES].sort());
    expect(kit.THREE_URL).toBe("https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js");
  });

  it("reads colours as sRGB, and nothing else", () => {
    expect(kit.parseColor("#fff")).toEqual([1, 1, 1]);
    expect(kit.parseColor("#2450f0")!.map((c: number) => Math.round(c * 255))).toEqual([36, 80, 240]);
    expect(kit.parseColor("rgb(36, 80, 240)")!.map((c: number) => Math.round(c * 255))).toEqual([36, 80, 240]);
    expect(kit.parseColor("rgba(0 0 0 / 50%)")).toEqual([0, 0, 0]);
    for (const bad of ["", "blue", "#12", "rgb(300, 0, 0)", "url(x)", null]) expect(kit.parseColor(bad)).toBeNull();
    expect(kit.luminance([1, 1, 1])).toBeCloseTo(1);
    expect(kit.luminance([0, 0, 0])).toBe(0);
  });

  it("runs WebGL only where it's welcome and affordable", () => {
    const ok = { reducedMotion: false, saveData: false, cores: 8, memory: 8, webgl: true };
    expect(kit.canRun3D(ok)).toEqual({ ok: true, reason: null });
    expect(kit.canRun3D({ ...ok, reducedMotion: true }).reason).toBe("reduced-motion");
    expect(kit.canRun3D({ ...ok, saveData: true }).reason).toBe("save-data");
    expect(kit.canRun3D({ ...ok, cores: 2 }).reason).toBe("weak-device");
    expect(kit.canRun3D({ ...ok, memory: 2 }).reason).toBe("weak-device");
    // Four cores, and browsers that don't report memory (Safari), get the scene.
    expect(kit.canRun3D({ ...ok, cores: 4, memory: undefined }).ok).toBe(true);
    expect(kit.canRun3D({ ...ok, webgl: false }).reason).toBe("no-webgl");
    // The recorder forces it, but never without WebGL.
    expect(kit.canRun3D({ ...ok, reducedMotion: true }, true).ok).toBe(true);
    expect(kit.canRun3D({ ...ok, webgl: false }, true).ok).toBe(false);
  });

  it("caps the pixel ratio, lower on touch screens", () => {
    expect(kit.pixelRatio(3, false)).toBe(2);
    expect(kit.pixelRatio(3, true)).toBe(1.5);
    expect(kit.pixelRatio(1, true)).toBe(1);
    expect(kit.pixelRatio(Number.NaN, false)).toBe(1);
  });

  it("reads a box's options with safe defaults", () => {
    const o = kit.readOptions({ farbaekScene: "orb", speed: "2", intensity: "3", palette: "#111,#222,#333,#444,nope", tone: "light" });
    expect(o.scene).toBe("orb");
    expect(o.period).toBe(8);
    expect(o.intensity).toBe(1);
    expect(o.palette).toHaveLength(3);
    expect(o.tone).toBe("light");
    expect(o.backdrop).toBe("none");
    const d = kit.readOptions({ farbaekScene: "unknown" });
    expect(d.scene).toBe("aurora");
    expect(d.period).toBe(16);
    expect(d.intensity).toBe(0.85);
    expect(d.backdrop).toBe("solid");
    expect(d.tone).toBeNull();
  });

  it("lets the gallery load only https, inline images or the site's own paths", () => {
    for (const ok of ["https://picsum.photos/id/1/800/600", "images/a.webp", "/assets/b.png", "data:image/png;base64,AAAA"]) expect(kit.safeImageSrc(ok)).toBe(true);
    for (const bad of ["javascript:alert(1)", "http://x.test/a.png", "//evil.test/a.png", "data:text/html,x", "a b.png", ""]) expect(kit.safeImageSrc(bad)).toBe(false);
    expect(kit.readOptions({ images: "https://a.test/1.jpg, javascript:alert(1), b.png" }).images).toEqual(["https://a.test/1.jpg", "b.png"]);
  });

  it("loops: the phase at the period is the phase at zero", () => {
    expect(kit.phaseAt(0, 10)).toBe(0);
    expect(kit.phaseAt(10, 10)).toBeCloseTo(0);
    expect(kit.phaseAt(2.5, 10)).toBeCloseTo(Math.PI / 2);
    expect(kit.phaseAt(-2.5, 10)).toBeCloseTo((3 * Math.PI) / 2);
    expect(kit.completePalette([[1, 0, 0]], "light")).toHaveLength(3);
  });
});
