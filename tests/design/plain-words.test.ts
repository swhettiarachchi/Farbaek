/**
 * The signed-in app speaks plainly (ADR 0170): a plan, a change, proof and
 * rules, whatever someone knows about software. The technical names stay in
 * code, routes and file formats, and this keeps them off the screen. The
 * billing "contract", the legal "policy" and a Capsule (a kind of file, named
 * and explained on its own page) are real words for real things, and are
 * allowed where they mean that.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TASK_STATE_LABELS } from "@/core/realityloop/progress";

const ROOT = path.resolve(__dirname, "..", "..");

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

// The public site, the films and the staff console have their own audiences.
const SKIP = /components[\\/](marketing|films|three|office|admin|pricing|verify|showcase|site|proof)[\\/]/;
const APP = [...files(path.join(ROOT, "src", "app", "app")), ...files(path.join(ROOT, "src", "components"))].filter((f) => !SKIP.test(f));

/** Sentences and labels in a line: quoted strings with a space or a capital, and text between tags. */
function words(line: string): string[] {
  const t = line.trim();
  if (/^(import |export \{|export function|function |\/\/|\*|\/\*|\{\/\*)/.test(t)) return [];
  const quoted = [...t.matchAll(/(["'`])((?:(?!\1).)*)\1/g)].map((m) => m[2]!).filter((x) => /\s/.test(x) && !/^(bg-|text-|border|flex|grid|rounded|min-|max-|mt-|inline|hover|sha256|\$\{)/.test(x));
  const between = [...t.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]!);
  const prose = t.replace(/\{[^{}]*\}/g, " ");
  const bare = /^[A-Z][a-z]+ [^=;(){}]*[.,]?$/.test(prose) ? [prose] : [];
  return [...quoted, ...between, ...bare];
}

const BANNED: { word: RegExp; say: string }[] = [
  { word: /\bintent contract\b/i, say: "the plan" },
  { word: /\bthe contract\b|\bits contract\b|\bcontract's\b|\bcontract&apos;s\b/i, say: "the plan" },
  { word: /\bproposals?\b/i, say: "a change" },
  { word: /\bcontracts\b/i, say: "plans" },
  { word: /\bgoverned evaluations?\b/i, say: "safety checks" },
  { word: /\bmicroVM\b/i, say: "a private, throwaway computer" },
  { word: /\bAI mapping\b|\bclause\b/i, say: "a line of the plan" },
  { word: /\blifecycle\b/i, say: "progress" },
  { word: /\binvariants?\b/i, say: "must stay true" },
  { word: /\bverified evidence\b/i, say: "passed checks" },
  { word: /\bmission control\b/i, say: "Home" },
  { word: /\bgoverned evaluations?\b/i, say: "safety checks" },
  { word: /\btrust graph\b/i, say: "who can do what" },
  { word: /\bautonomy level\b/i, say: "how much the agent can do on its own" },
];

// Search keeps the old names on purpose, so anyone who knows them can still find the page.
const ALSO_KNOWN_AS = /also: \[/;

describe("the app speaks plainly", () => {
  it("says plan, change, proof and rules, not the technical names", () => {
    const hits = APP.flatMap((f) =>
      readFileSync(f, "utf8")
        .split(/\r?\n/)
        .flatMap((line, i) => {
          if (ALSO_KNOWN_AS.test(line)) return [];
          return words(line).flatMap((text) => BANNED.filter((b) => b.word.test(text)).map((b) => `${path.relative(ROOT, f)}:${i + 1} says "${text.slice(0, 70)}": use "${b.say}"`));
        }),
    );
    expect(hits).toEqual([]);
  });

  it("names every task state in everyday words, on the web and on the phone", () => {
    for (const label of Object.values(TASK_STATE_LABELS)) {
      expect(label).not.toMatch(/contract|policy|execut|authoriz|assembled|recover/i);
    }
  });
});
