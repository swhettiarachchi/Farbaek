/**
 * One icon style across the signed-in platform (ADR 0286): rounded, with a full stroke. In Phosphor that is the bold weight for
 * an outlined icon and fill for a state, so no icon may be left at the thin default, and none may ask for the regular weight by
 * name. The public site and its films keep their own look until they are redesigned.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PUBLIC_SITE = /^src\/(?:app\/\(site\)|components\/(?:site|marketing|films|three))\//;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx$/.test(full) ? [full] : [];
  });
}

const sources = ["src/app", "src/components"]
  .flatMap((root) => files(path.join(process.cwd(), root)))
  .map((full) => ({ rel: path.relative(process.cwd(), full).split(path.sep).join("/"), text: readFileSync(full, "utf8") }))
  .filter((f) => !PUBLIC_SITE.test(f.rel));

/** The index just past the `>` that ends the JSX opening tag starting at `from`, or -1 when it isn't one. */
function endOfTag(src: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from + 1; i < src.length; i++) {
    const c = src[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return i + 1;
    else if (c === "<" && depth === 0) return -1;
  }
  return -1;
}

/** Every icon drawn in a file, by the names the file imports from the set (ADR 0289): its tag as written, and the line it starts on. */
function iconTags(text: string): { tag: string; line: number }[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"(?:@\/components\/icons|@phosphor-icons\/react(?:\/ssr)?)"/g)) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (name && /Icon$/.test(name)) names.add(name);
    }
  }
  const out: { tag: string; line: number }[] = [];
  for (const m of text.matchAll(/<([A-Za-z_][\w.]*)(?=[\s/>])/g)) {
    if (!names.has(m[1]!)) continue;
    const end = endOfTag(text, m.index);
    if (end > 0) out.push({ tag: text.slice(m.index, end), line: text.slice(0, m.index).split("\n").length });
  }
  return out;
}

describe("one icon style (ADR 0286)", () => {
  it("finds the icons it is meant to check", () => {
    expect(sources.length).toBeGreaterThan(200);
    expect(sources.flatMap((f) => iconTags(f.text)).length).toBeGreaterThan(800);
  });

  it("leaves no icon at the thin default weight", () => {
    const thin = sources.flatMap((f) => iconTags(f.text).filter((t) => !/\bweight\s*=/.test(t.tag)).map((t) => `${f.rel}:${t.line}`));
    expect(thin).toEqual([]);
  });

  it("asks for the regular weight nowhere: an outline is bold, a state is filled", () => {
    const regular = sources.flatMap((f) =>
      f.text
        .split(/\r?\n/)
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line) && /"regular"/.test(line) && /weight/.test(line))
        .map(({ n }) => `${f.rel}:${n}`),
    );
    expect(regular).toEqual([]);
  });
});
