/**
 * File patterns for workspace rules (ADR 0082), compiled to one anchored
 * regular expression that JavaScript and Postgres read the same way, so the
 * server and the database match a path alike.
 *
 * - `*` is any run of characters within a folder name, `?` one character,
 *   and `**` any number of folders.
 * - A pattern with no `/` before its end matches a name in any folder, as
 *   in .gitignore: `*.sql`, `package.json`, `fixtures/`.
 * - A trailing `/` means everything inside that folder: `src/billing/`.
 * - Anything else is a path from the project's root: `app/page.tsx`.
 *
 * The regex is built from tokens, never from the pattern's own syntax, and
 * the wildcards are capped, so a pattern can't make matching slow.
 */

export const MAX_PATTERN_LENGTH = 200;
const MAX_WILDCARDS = 8;
const MAX_DEEP = 3;
const ALLOWED = /^[A-Za-z0-9._@+\-/*?]+$/;

export type PatternResult = { ok: true; regex: string } | { ok: false; error: string };

/** The pattern people see and the one that's hashed: trimmed, with `/**` written as a trailing `/`. */
export function normalizePattern(glob: string): string {
  const t = glob.trim();
  return t.endsWith("/**") && t.length > 3 ? t.slice(0, -2) : t;
}

export function compilePattern(glob: string): PatternResult {
  const p = normalizePattern(glob);
  if (p === "") return { ok: false, error: "Write a file pattern." };
  if (p.length > MAX_PATTERN_LENGTH) return { ok: false, error: `Keep a pattern under ${MAX_PATTERN_LENGTH} characters.` };
  if (!ALLOWED.test(p)) return { ok: false, error: "Use letters, numbers, . _ - @ + and / in paths, with * ? and ** as wildcards." };
  if (p.startsWith("/")) return { ok: false, error: "Write paths from the project's root, without a leading /." };
  if (p.includes("//")) return { ok: false, error: "A pattern can't contain //." };
  const segments = p.split("/");
  if (segments.some((s) => s === "." || s === "..")) return { ok: false, error: "A pattern can't contain . or .. as a folder." };
  if ((p.match(/[*?]/g) ?? []).length > MAX_WILDCARDS) return { ok: false, error: `Use at most ${MAX_WILDCARDS} wildcards in a pattern.` };
  if (segments.filter((s) => s === "**").length > MAX_DEEP) return { ok: false, error: `Use ** at most ${MAX_DEEP} times in a pattern.` };

  const folder = p.endsWith("/");
  const body = folder ? p.slice(0, -1) : p;
  const parts = body.split("/");
  // No slash before the end: a name in any folder, as in .gitignore.
  const anywhere = !body.includes("/");
  let out = anywhere ? "(.*/)?" : "";
  parts.forEach((seg, i) => {
    const last = i === parts.length - 1;
    if (seg === "**") {
      out += last ? ".*" : "(.*/)?";
      return;
    }
    out += segment(seg) + (last ? "" : "/");
  });
  if (folder) out += "/.*";
  return { ok: true, regex: `^${out}$` };
}

/** One folder or file name: `*` and `?` stay inside it, runs of `*` count once. */
function segment(seg: string): string {
  let out = "";
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === "*") {
      while (seg[i + 1] === "*") i++;
      out += "[^/]*";
    } else if (c === "?") out += "[^/]";
    else if (c === "." || c === "+") out += `\\${c}`;
    else out += c;
  }
  return out;
}

const cache = new Map<string, RegExp | null>();

/** Whether a project path matches the pattern. An invalid pattern matches nothing. */
export function matchesPattern(glob: string, path: string): boolean {
  let re = cache.get(glob);
  if (re === undefined) {
    const c = compilePattern(glob);
    re = c.ok ? new RegExp(c.regex) : null;
    if (cache.size > 2_000) cache.clear();
    cache.set(glob, re);
  }
  return re !== null && re.test(path);
}

/** Whether the pattern covers every file. */
export function coversEverything(glob: string): boolean {
  const p = normalizePattern(glob);
  return p === "*" || p === "**" || p === "**/*" || /^\*+$/.test(p);
}

/** The pattern in plain words, as the object of "A change to …". */
export function describePattern(glob: string): string {
  const p = normalizePattern(glob);
  if (coversEverything(p)) return "any file";
  const wild = /[*?]/.test(p);
  if (p.endsWith("/")) {
    const body = p.slice(0, -1);
    if (!body.includes("/")) return wild ? `any file inside a folder named like ${body}` : `any file inside a folder named ${body}`;
    return wild ? `any file inside folders matching ${body}` : `any file inside ${body}`;
  }
  if (!p.includes("/")) return wild ? `any file named like ${p}` : `any file named ${p}`;
  return wild ? `any file matching ${p}` : `the file ${p}`;
}
