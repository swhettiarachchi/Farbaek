/**
 * A real job's other files, read and compared with its SDR (stage 242, ADR 0250), run only on this machine: set FARBAEK_REAL_JOB_DIR to
 * a folder whose job.json names them ({ "survey": ["job.sdr"], "printout": "job_Point List.txt", "dxf": "job.dxf" }). A real client's
 * land data never enters the repository or CI; without the variable this is skipped.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSurveyFile } from "../autosurvey/start";
import { crsById } from "../crs";
import { detectFormat } from "./detect";
import { parseDxfPoints } from "./dxfpoints";
import { parseSdr } from "./sdr";
import { parseSokkiaList } from "./sokkialist";

const DIR = process.env.FARBAEK_REAL_JOB_DIR ?? "";
const job = DIR && existsSync(join(DIR, "job.json")) ? (JSON.parse(readFileSync(join(DIR, "job.json"), "utf8")) as { survey: string[]; printout?: string; dxf?: string }) : null;

describe.skipIf(!job)("a real job's printout and drawing, against its SDR (local only)", () => {
  const sdr = job ? parseSdr(readFileSync(join(DIR, job.survey[0]!), "latin1"), null, null).points : [];
  const same = (got: readonly { pointId: string; e: number; n: number }[], what: string) => {
    const byId = new Map(sdr.map((p) => [p.pointId, p]));
    const off = got.map((p) => ({ id: p.pointId, d: byId.has(p.pointId) ? Math.hypot(p.e - byId.get(p.pointId)!.e, p.n - byId.get(p.pointId)!.n) : Infinity }));
    console.log(`${what}: ${got.length} points; the SDR has ${sdr.length}; not in the SDR: ${off.filter((o) => o.d === Infinity).map((o) => o.id).join(", ") || "none"}; largest difference ${Math.max(...off.filter((o) => o.d !== Infinity).map((o) => o.d)).toFixed(4)} m; missing: ${sdr.filter((p) => !got.some((g) => g.pointId === p.pointId)).map((p) => p.pointId).join(", ") || "none"}`);
    for (const o of off) expect(o.d).toBeLessThan(0.0006);
  };
  it.skipIf(!job?.printout)("reads the printout's points as the SDR has them", () => {
    const text = readFileSync(join(DIR, job!.printout!), "latin1");
    // As Generate Plan takes it: known by its contents, and read whole.
    expect(detectFormat(job!.printout!, text)).toBe("sokkialist");
    expect(readSurveyFile(job!.printout!, text, crsById("LOCAL")).ok).toBe(true);
    const r = parseSokkiaList(text);
    console.log(r.issues.map((i) => `[${i.severity}] ${i.message}`).join("\n"));
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    same(r.points, "printout");
    expect(r.points.length).toBe(sdr.length);
  });
  it.skipIf(!job?.dxf)("reads the drawing's points as the SDR has them", () => {
    const text = readFileSync(join(DIR, job!.dxf!), "latin1");
    expect(detectFormat(job!.dxf!, text)).toBe("dxf");
    expect(readSurveyFile(job!.dxf!, text, crsById("LOCAL")).ok).toBe(true);
    const r = parseDxfPoints(text);
    console.log(r.issues.map((i) => `[${i.severity}] ${i.message}`).join("\n"));
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    same(r.points, "drawing");
  });
});
