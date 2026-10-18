/**
 * People see their usage as a share of each limit and when it resets
 * (ADR 0019), never AI credit counts or costs. Credits are the internal unit
 * only. This guards every page, component and user-facing server message.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");

function files(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, ext));
    else if (ext.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

/** Lines of text a person could read: not imports, not comments. */
function visibleLines(file: string): { line: number; text: string }[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((text, i) => ({ line: i + 1, text }))
    .filter(({ text }) => {
      const t = text.trim();
      return !t.startsWith("import ") && !/^export .* from "/.test(t) && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*") && !/^\}? ?from "/.test(t);
    });
}

const UI = [...files(path.join(ROOT, "src", "app"), /\.tsx$/), ...files(path.join(ROOT, "src", "components"), /\.tsx$/), ...files(path.join(ROOT, "desktop", "src", "renderer"), /\.tsx$/)];
const MESSAGES = ["ai-credits.ts", "ai-drafting.ts", "proposals.ts", "use-cases.ts", "usage-summary.ts"].map((f) => path.join(ROOT, "src", "server", "workspace", f));

describe("no credit wording reaches people", () => {
  it("pages and components never say credit", () => {
    const hits = UI.flatMap((f) => visibleLines(f).filter(({ text }) => /\bcredits?\b/i.test(text)).map(({ line, text }) => `${path.relative(ROOT, f)}:${line}: ${text.trim()}`));
    expect(hits).toEqual([]);
  });

  it("user-facing server messages never say credit", () => {
    const quoted = /(["'`])(?:(?!\1).)*\bcredits?\b(?:(?!\1).)*\1/i;
    const hits = MESSAGES.flatMap((f) => visibleLines(f).filter(({ text }) => quoted.test(text)).map(({ line, text }) => `${path.relative(ROOT, f)}:${line}: ${text.trim()}`));
    expect(hits).toEqual([]);
  });
});
