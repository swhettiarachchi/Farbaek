/**
 * Farbaek's own icons (ADR 0289): one soft, rounded set for the whole product outside the public site. A scan can't judge a
 * drawing, so the drawings are looked at on the sheet; this holds what a scan can: that every screen takes its icons from the
 * set, that every icon in it is drawn with the set's one stroke, and that a state is its body with its mark cut out.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as icons from "@/components/icons";
import { FILLS } from "@/components/icons/fills";
import { strokeFor } from "@/components/icons/soft";

const PUBLIC_SITE = /^src\/(?:app\/\(site\)|components\/(?:site|marketing|films|three))\//;
const THE_SET = /^src\/components\/icons\//;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

const sources = files(path.join(process.cwd(), "src")).map((full) => ({ rel: path.relative(process.cwd(), full).split(path.sep).join("/"), text: readFileSync(full, "utf8") }));
const shapes = Object.entries(icons.ICON_SHAPES);
const draw = (name: string, props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement((icons as unknown as Record<string, icons.Icon>)[`${name}Icon`]!, { size: 20, weight: "bold", ...props }));

describe("one set of icons (ADR 0289)", () => {
  it("is where every screen outside the public site takes its icons from", () => {
    const direct = sources.filter((f) => !PUBLIC_SITE.test(f.rel) && !THE_SET.test(f.rel) && /from\s*"@phosphor-icons\/react/.test(f.text)).map((f) => f.rel);
    expect(direct).toEqual([]);
    expect(sources.filter((f) => /from\s*"@\/components\/icons"/.test(f.text)).length).toBeGreaterThan(300);
  });

  it("leaves the public site's own files as they were: they don't take the set", () => {
    expect(sources.filter((f) => PUBLIC_SITE.test(f.rel) && /from\s*"@\/components\/icons"/.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("has a component for every icon drawn, and a drawing for every state", () => {
    expect(shapes.length).toBeGreaterThan(230);
    for (const [name] of shapes) expect(typeof (icons as Record<string, unknown>)[`${name}Icon`], name).toBe("object");
    for (const name of Object.keys(FILLS)) expect(icons.ICON_SHAPES[name], `${name} is a state of an icon that isn't drawn`).toBeDefined();
  });

  it("draws every icon as path data that starts with a move, with nothing left unwritten in it", () => {
    for (const [name, shape] of shapes) {
      expect(Boolean(shape.o || shape.s), name).toBe(true);
      for (const d of [shape.o, shape.s]) {
        if (!d) continue;
        expect(d, name).toMatch(/^M/);
        expect(d, name).not.toMatch(/NaN|undefined|null|Infinity/);
        expect(d, name).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/);
      }
    }
    for (const [name, fill] of Object.entries(FILLS)) for (const d of [fill.b, fill.k, fill.ks, fill.o]) if (d) expect(d, name).toMatch(/^M[MmLlHhVvCcSsQqTtAaZz0-9 .,-]*$/);
  });

  it("draws with one stroke, round at its ends and joins, on a 24 unit square, in the colour of the words beside it", () => {
    for (const [name] of shapes) {
      const html = draw(name);
      expect(html, name).toContain('viewBox="0 0 24 24"');
      expect(html, name).toContain('width="20"');
      expect(html, name).not.toMatch(/stroke-linecap="(?!round)/);
      expect(html, name).not.toMatch(/stroke-linejoin="(?!round)/);
      // Nothing but the stroke's own width, and no colour of its own.
      for (const m of html.matchAll(/stroke-width="([^"]+)"/g)) expect(m[1], name).toBe("2");
      for (const m of html.matchAll(/(?:stroke|fill)="([^"]+)"/g)) expect(["none", "currentColor"], name).toContain(m[1]);
    }
  });

  it("is a little heavier when drawn small, so a 14px icon is as dark as a 20px one", () => {
    expect(strokeFor(14)).toBeGreaterThan(strokeFor(20));
    expect(strokeFor(16)).toBe(strokeFor(14));
    expect(strokeFor(24)).toBe(strokeFor(20));
    expect(strokeFor("1em")).toBe(strokeFor(20));
    expect(draw("FolderSimple", { size: 14 })).toContain(`stroke-width="${strokeFor(14)}"`);
  });

  it("draws a state as its body filled, with its mark cut out through a mask of its own", () => {
    const tick = draw("CheckCircle", { weight: "fill" });
    expect(tick).toContain('fill="currentColor"');
    const id = /<mask id="([^"]+)"/.exec(tick)?.[1];
    expect(id).toMatch(/^fbi-[a-zA-Z0-9]+$/);
    expect(tick).toContain(`mask="url(#${id})"`);
    // Two on one page never share a mask.
    const two = renderToStaticMarkup(createElement("div", null, createElement(icons.CheckCircleIcon, { weight: "fill" }), createElement(icons.WarningCircleIcon, { weight: "fill" })));
    const ids = [...two.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
    // A body with nothing cut out of it needs no mask; an icon with no state drawn stays an outline.
    expect(draw("FolderSimple", { weight: "fill" })).not.toContain("<mask");
    expect(draw("Trash", { weight: "fill" })).toBe(draw("Trash"));
  });

  it("takes what the app passes to an icon: a class, hidden from readers, a name when it has one, mirrored", () => {
    const html = draw("ArrowRight", { className: "shrink-0 text-ink-3", "aria-hidden": true });
    expect(html).toContain('class="shrink-0 text-ink-3"');
    expect(html).toContain('aria-hidden="true"');
    expect(draw("ArrowRight", { alt: "Next" })).toContain("<title>Next</title>");
    expect(draw("ArrowRight", { mirrored: true })).toContain('transform="translate(24 0) scale(-1 1)"');
    // With no size it is as tall as the words it sits in.
    expect(renderToStaticMarkup(createElement(icons.ArrowRightIcon))).toContain('width="1em"');
  });
});
