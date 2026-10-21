import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Office Space's structural rules (ADR 0032), checked in the source:
 * every console page and action checks the staff member itself, links use
 * the visible paths, and the customer app never imports office code.
 */
const ROOT = join(__dirname, "..", "..");

function files(dir: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, pattern));
    else if (pattern.test(name)) out.push(p);
  }
  return out;
}
const read = (p: string) => readFileSync(p, "utf8");
const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, "/");

describe("Office Space guards", () => {
  const consoleDir = join(ROOT, "src", "app", "office", "(console)");

  it("checks the staff member in every console page and action", () => {
    for (const p of files(consoleDir, /^(page|layout)\.tsx$/)) expect(read(p), rel(p)).toMatch(/requireStaff\(\)/);
    for (const p of files(consoleDir, /^actions\.ts$/)) {
      const src = read(p);
      const exported = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
      expect(exported.length, rel(p)).toBeGreaterThan(0);
      for (const name of exported) {
        const body = src.slice(src.indexOf(`export async function ${name}`)).split(/\nexport /)[0]!;
        expect(body, `${rel(p)} ${name}`).toMatch(/staffAction\(|severe\(/);
      }
    }
  });

  it("links and redirects with the visible paths, never /office", () => {
    for (const p of [...files(join(ROOT, "src", "app", "office"), /\.tsx?$/), ...files(join(ROOT, "src", "components", "office"), /\.tsx?$/)]) {
      const src = read(p);
      expect(src, rel(p)).not.toMatch(/(?:href=\{?["'`]|redirect\(["'`]|replace\(["'`]|push\(["'`])\/office\b/);
      expect(src, rel(p)).not.toMatch(/usePathname/);
    }
  });

  it("keeps office code out of the customer app", () => {
    const customer = [join(ROOT, "src", "app", "app"), join(ROOT, "src", "components", "app"), join(ROOT, "src", "server", "workspace")];
    for (const dir of customer) {
      for (const p of files(dir, /\.tsx?$/)) expect(read(p), rel(p)).not.toMatch(/from "@\/(?:server\/office|app\/office|components\/office)\b/);
    }
  });
});
