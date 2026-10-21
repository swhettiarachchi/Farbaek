import { describe, expect, it } from "vitest";
import { FILMS } from "@/content/films";
import { bezier, chapterAt, clock, easeOut, keys, progress, toVtt, typed } from "./timeline";

describe("the film timeline", () => {
  it("eases like CSS, holding at both ends", () => {
    const linearish = bezier(0, 0, 1, 1);
    expect(linearish(0.5)).toBeCloseTo(0.5, 3);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.3)).toBeGreaterThan(0.7);
    expect(progress(500, 1000, 2000)).toBe(0);
    expect(progress(2500, 1000, 2000)).toBe(1);
  });

  it("moves through keyframes and holds before and after them", () => {
    const frames = [[1000, 0], [2000, 100], [3000, 50]] as const;
    expect(keys(0, frames)).toBe(0);
    expect(keys(1500, frames)).toBeCloseTo(50, 0);
    expect(keys(2000, frames)).toBe(100);
    expect(keys(9000, frames)).toBe(50);
  });

  it("types at a steady pace and finds the chapter playing", () => {
    expect(typed("Hello there", 900, 1000)).toBe("");
    expect(typed("Hello there", 1200, 1000, 20)).toBe("Hell");
    expect(typed("Hello there", 99_000, 1000)).toBe("Hello there");
    const { chapters } = FILMS.build;
    expect(chapterAt(chapters, 0).chapter.id).toBe("describe");
    expect(chapterAt(chapters, 8_000).chapter.id).toBe("plan");
    expect(chapterAt(chapters, 53_999).index).toBe(chapters.length - 1);
    expect(clock(62_400)).toBe("1:02");
  });

  it("writes WebVTT with one cue per chapter, back to back", () => {
    const vtt = toVtt(FILMS.build.chapters, FILMS.build.durationMs, "caption");
    expect(vtt.startsWith("WEBVTT\n\n1\n00:00:00.000 --> 00:00:08.000\nDescribe what you want")).toBe(true);
    expect(vtt.trim().endsWith("serves exactly this version.")).toBe(true);
    expect(vtt).toContain("00:00:46.000 --> 00:00:54.000");
    expect(toVtt(FILMS.build.chapters, FILMS.build.durationMs, "label")).toContain("\nPlan\n");
  });
});
