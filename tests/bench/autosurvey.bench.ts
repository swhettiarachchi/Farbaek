/**
 * AutoSurvey's deterministic path, timed (stage 232): reading the file, drawing the draft, checking and composing the plan, writing
 * the PDF and the DXF, on the SYNTHETIC datasets in src/core/survey/bench/datasets.ts. No model is called: this is the part of
 * Generate Plan that tested code does. Run with `pnpm bench:survey` (its own config, so `pnpm test` never runs it); the results are
 * kept in docs/survey/BENCHMARKS.md. Each step runs twice to warm up, then 9 times, and the median and the slowest are reported.
 */
import { cpus, totalmem } from "node:os";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { BENCH_DATASETS } = await import("@/core/survey/bench/datasets");
const { readSurveyFile } = await import("@/core/survey/autosurvey/start");
const { autoDraft } = await import("@/core/survey/autodraft");
const { crsById } = await import("@/core/survey/crs");
const { emptyDocument } = await import("@/core/survey/document");
const { writeDxf } = await import("@/core/survey/export/dxf");
const { buildPlan } = await import("@/core/survey/view");
const { renderPdf } = await import("@/server/survey/pdf");

const crs = crsById("EPSG:5235")!;
const meta = { title: "Benchmark plan (synthetic)", subject: "Draft survey plan, not certified", createdAt: new Date("2026-11-23T00:00:00Z") };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RUNS = 9;

function prepare(file: string, text: string) {
  const read = readSurveyFile(file, text, crs);
  if (!read.ok) throw new Error(`${file}: ${read.problem}`);
  const points = read.read.points.map((p, i) => ({ id: uuid(i + 1), pointId: p.pointId, e: p.e, n: p.n, z: p.z, code: p.code }));
  const drafted = autoDraft({ points, document: emptyDocument(), surveyDate: null });
  const view = buildPlan({ points, document: drafted.document, crsId: crs.id, crsConfirmation: "Confirmed for the benchmark", surveyor: null, approval: null });
  return { read: read.read, points, drafted, view };
}

async function time(run: () => unknown): Promise<{ median: number; slowest: number }> {
  for (let i = 0; i < 2; i++) await run();
  const ms: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    await run();
    ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  return { median: ms[Math.floor(RUNS / 2)]!, slowest: ms.at(-1)! };
}

const rows: string[] = [];
const ms = (v: number) => (v < 10 ? v.toFixed(1) : v.toFixed(0));

describe("AutoSurvey's deterministic path (synthetic data)", () => {
  for (const ds of BENCH_DATASETS) {
    it(`${ds.name}: ${ds.points} points`, async () => {
      const p = prepare(ds.file, ds.text);
      // What was made, so a timing is never of an empty plan.
      expect(p.read.points.length).toBe(ds.points);
      expect(p.view.sheet.pages.length).toBeGreaterThan(0);
      const dxf = () => writeDxf({ document: p.drafted.document, points: p.points, lots: p.view.lots, crs: p.view.crs, scale: p.view.sheet.scale ?? 500, projectName: ds.name, status: "Draft" });
      const steps: [string, () => unknown][] = [
        ["read", () => readSurveyFile(ds.file, ds.text, crs)],
        ["draft", () => autoDraft({ points: p.points, document: emptyDocument(), surveyDate: null })],
        ["check and compose", () => buildPlan({ points: p.points, document: p.drafted.document, crsId: crs.id, crsConfirmation: "Confirmed for the benchmark", surveyor: null, approval: null })],
        ["PDF", () => renderPdf(p.view.sheet.pages, meta)],
        ["DXF", dxf],
        [
          "all",
          async () => {
            const q = prepare(ds.file, ds.text);
            await renderPdf(q.view.sheet.pages, meta);
            writeDxf({ document: q.drafted.document, points: q.points, lots: q.view.lots, crs: q.view.crs, scale: q.view.sheet.scale ?? 500, projectName: ds.name, status: "Draft" });
          },
        ],
      ];
      const cells: string[] = [];
      for (const [, run] of steps) {
        const t = await time(run);
        cells.push(`${ms(t.median)} (${ms(t.slowest)})`);
      }
      rows.push(`| ${ds.name} | ${ds.points} | ${p.drafted.shapes} | ${p.view.findings.length} | ${cells.join(" | ")} |`);
    }, 300_000);
  }

  it("prints the table", () => {
    const cpu = cpus()[0]?.model.trim() ?? "unknown CPU";
    console.log(
      [
        `Machine: ${cpu}, ${cpus().length} threads, ${(totalmem() / 1024 ** 3).toFixed(1)} GB; Node ${process.version}. Milliseconds: median of ${RUNS} runs (slowest).`,
        "",
        "| Dataset | Points | Shapes drawn | Findings | Read | Draft | Check and compose | PDF | DXF | All |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ...rows,
      ].join("\n"),
    );
  });
});
