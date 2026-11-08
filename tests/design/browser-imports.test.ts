import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What a page's JavaScript may carry (stage 171). Every "use client" file is
 * downloadable by anyone, signed in or not, so none may import, even through
 * other modules, what Farbaek's plans cost it: model prices, margins, fees and
 * the catalog that works plans out from them. Server actions are followed no
 * further, because only a reference to them reaches the browser.
 */
const root = process.cwd();
const SERVER_ONLY = ["src/core/billing/allowance.ts", "src/core/billing/rate-card.ts", "src/core/billing/revenue.ts", "src/core/billing/catalog.ts"].map((f) => path.join(root, f));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "node_modules") walk(full, out);
    } else if (/\.(tsx?|mts)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(root, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(base + ext) && statSync(base + ext).isFile()) return base + ext;
  }
  return null;
}

const text = new Map<string, string>();
const read = (f: string) => text.get(f) ?? (text.set(f, readFileSync(f, "utf8")), text.get(f)!);
const isDirective = (f: string, d: string) => new RegExp(`^\\s*["']${d}["']`).test(read(f));

/** Value imports only: `import type` and all-type named imports are erased before the browser sees them. */
function imports(file: string): string[] {
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/gms;
  for (const m of read(file).matchAll(re)) {
    if (m[1]) continue;
    const names = m[2]!.trim();
    if (/^\{[^}]*\}$/.test(names) && names.slice(1, -1).split(",").map((n) => n.trim()).filter(Boolean).every((n) => n.startsWith("type "))) continue;
    const r = resolve(file, m[3]!);
    if (r) out.push(r);
  }
  for (const m of read(file).matchAll(/^\s*import\s+["']([^"']+)["']/gm)) {
    const r = resolve(file, m[1]!);
    if (r) out.push(r);
  }
  return out;
}

describe("what the browser downloads", () => {
  it("never carries what plans cost Farbaek, its margins or fees", () => {
    const files = [...walk(path.join(root, "src")), ...walk(path.join(root, "desktop/src/renderer"))];
    const reached: string[] = [];
    for (const start of files.filter((f) => isDirective(f, "use client"))) {
      const seen = new Set([start]);
      const stack: string[][] = [[start]];
      while (stack.length) {
        const trail = stack.pop()!;
        for (const next of imports(trail.at(-1)!)) {
          if (SERVER_ONLY.includes(next)) {
            reached.push([...trail, next].map((f) => path.relative(root, f).split(path.sep).join("/")).join(" -> "));
            stack.length = 0;
            break;
          }
          if (!seen.has(next) && !isDirective(next, "use server")) {
            seen.add(next);
            stack.push([...trail, next]);
          }
        }
      }
    }
    expect(reached).toEqual([]);
  });
});
