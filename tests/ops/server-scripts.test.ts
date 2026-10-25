/**
 * The server scripts in scripts/vps/ (ADR 0036, ADR 0071). Their mistakes
 * only show when they run on the VPS, often at night, so the simple ones are
 * caught here.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JOBS } from "@/core/ops/jobs";

const dir = new URL("../../scripts/vps/", import.meta.url);
const scripts = readdirSync(dir)
  .filter((f) => f.endsWith(".sh"))
  .map((name) => ({ name, text: readFileSync(new URL(name, dir), "utf8") }));

describe("server scripts", () => {
  it("continue long lines with a real backslash at the end", () => {
    for (const { name, text } of scripts) {
      text.split(/\r?\n/).forEach((line, i) => {
        // The two characters "\n" in place of a line break join the lines, with a stray "n".
        expect(line, `${name}:${i + 1}`).not.toMatch(/\s\\n\s+-/);
        // Anything after the backslash, even a space, ends the continuation.
        expect(line, `${name}:${i + 1}`).not.toMatch(/\\[ \t]+$/);
      });
    }
  });

  it("report runs only for jobs the Health page knows, when they work and when they fail", () => {
    const keys: string[] = JOBS.map((j) => j.key);
    const reporting = scripts.filter((s) => s.text.includes("app_note_job_run"));
    expect(reporting.map((s) => s.name).sort()).toEqual(["db-backup.sh", "db-restore-test.sh"]);
    for (const { name, text } of reporting) {
      expect(keys, name).toContain(text.match(/app_note_job_run\('([a-z_]+)'/)?.[1]);
      expect(text, name).toMatch(/note_run true /);
      expect(text, name).toMatch(/trap 'note_run false /);
    }
  });
});
