/**
 * The motion budget (ADR 0172). In the signed-in app, feedback is quick, a change of view takes about a quarter of a
 * second, and only transform and opacity animate. The public site and the films have their own audience and are
 * exempt, as the research says of marketing reveals.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const SKIP = /components[\\/](marketing|films|three|showcase|site|office|admin)[\\/]/;

/** Not motion of the interface: Studio's preview changes width when someone picks a device. */
const LONG_ALLOWED = new Set(["src/components/studio/visual-editor.tsx"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(name) && !SKIP.test(p) ? [p] : [];
  });
}

const app = [...files(path.join(ROOT, "src/app/app")), ...files(path.join(ROOT, "src/components"))].map((f) => ({
  rel: path.relative(ROOT, f).replaceAll("\\", "/"),
  lines: readFileSync(f, "utf8").split(/\r?\n/),
}));
const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");

const find = (test: (line: string) => boolean) => app.flatMap((f) => f.lines.flatMap((line, i) => (test(line) ? [`${f.rel}:${i + 1}`] : [])));

describe("the motion budget", () => {
  it("never animates everything at once", () => {
    expect(find((l) => /\btransition-all\b/.test(l))).toEqual([]);
    expect(css).not.toMatch(/transition:\s*all\b/);
  });

  it("keeps the app's transitions under half a second", () => {
    const long = app
      .filter((f) => !LONG_ALLOWED.has(f.rel))
      .flatMap((f) =>
        f.lines.flatMap((line, i) =>
          [...line.matchAll(/\bduration-(?:\[(\d*\.?\d+)(ms|s)\]|(\d+))/g)]
            .filter((m) => (m[3] ? Number(m[3]) : m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1])) >= 500)
            .map(() => `${f.rel}:${i + 1}`),
        ),
      );
    expect(long).toEqual([]);
  });

  it("keeps long animations to rare moments and live state", () => {
    // A first run's progress and a security score filling in are hero moments. The core's loops mean the agent is working.
    const allowed = new Set(["steps-fill", "score-in", "core-orbit", "core-call"]);
    const long = app.flatMap((f) =>
      f.lines.flatMap((line, i) =>
        [...line.matchAll(/animate-\[([a-z-]+)_(\d*\.?\d+)(ms|s)/g)]
          .filter((m) => (m[3] === "s" ? Number(m[2]) * 1000 : Number(m[2])) >= 500 && !allowed.has(m[1]!))
          .map((m) => `${f.rel}:${i + 1} ${m[1]}`),
      ),
    );
    expect(long).toEqual([]);
  });

  it("only moves anything when motion is welcome", () => {
    // Token by token, so a variant such as sm: or [&_svg]: can't slip through beside a motion-safe: on the same line.
    expect(find((l) => l.split(/[\s"'`]+/).some((token) => /(^|:)animate-(\[|ping|pulse|spin|bounce)/.test(token) && !token.includes("motion-safe:")))).toEqual([]);
  });

  it("animates only transform and opacity in what it adds for moments", () => {
    const keyframes = [...css.matchAll(/@keyframes\s+((?:moment|jump)-[\w-]+)\s*\{([\s\S]*?)\n\}/g)];
    expect(keyframes.length).toBeGreaterThanOrEqual(4);
    for (const [, name, body] of keyframes) {
      const properties = [...body!.matchAll(/^\s*([a-z-]+):/gm)].map((m) => m[1]);
      expect(properties.filter((p) => p !== "opacity" && p !== "transform"), name).toEqual([]);
    }
  });

  it("states its budget in one place", () => {
    for (const token of ["--motion-feedback: 100ms", "--motion-ui: 240ms", "--motion-exit: 160ms", "--ease-expressive"]) expect(css).toContain(token);
  });
});
