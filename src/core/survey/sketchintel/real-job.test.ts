/**
 * The evaluation on a real job (stage 241, ADR 0249), run only on this machine: set FARBAEK_REAL_JOB_DIR to a folder holding the job's
 * files and a job.json naming them. A real client's land data never enters the repository or CI; without the variable this is skipped.
 *
 * job.json: { "survey": ["file.sdr", ...], "crs": "LOCAL" | "EPSG:5235", "sketch": "sketch-read.json", "reference": "reference.json",
 *             "statedExtent": "0.02000 Hectares", "sketchFile": "the photo's name as read" }
 *
 * Several survey files of one job are read together as Generate Plan reads them: a point number already read keeps its first place.
 *
 * It runs what Generate Plan and the sketch read run, in order: every survey file read with the same readers, the automatic draft from
 * the field codes, the sketch's drawing interpreted and applied, the plan checked; then it compares the result with the reference (the
 * surveyor's own plan, by point number) and writes what it found to <dir>/out.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { autoDraft } from "../autodraft";
import { acceptSketch, type SketchReadOutput } from "../autosurvey/sketch";
import { readSurveyFile } from "../autosurvey/start";
import { commonCodes } from "../codes";
import { crsById } from "../crs";
import { emptyDocument, surveyDocumentSchema, type DrawingSettings, type SurveyDocument } from "../document";
import { exceptionsFor } from "../exceptions";
import type { SurveyPoint } from "../parcel";
import { buildPlan } from "../view";
import { applySketch } from "./apply";
import { withAutoCorrections } from "./correct";
import { evaluatePlan, type PlanReference } from "./evaluate";
import { interpretDocument } from "./findings";
import { sketchReport, sketchReportMarkdown } from "./report";

const DIR = process.env.FARBAEK_REAL_JOB_DIR ?? "";

/** Area by the trapezoid rule over each leg: a second method, independent of the coordinate method the plan uses. */
const trapezoid = (ring: readonly { e: number; n: number }[]) => Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]!; return s + (q.e - p.e) * (q.n + p.n); }, 0) / 2);

describe.skipIf(!DIR || !existsSync(join(DIR, "job.json")))("a real job, end to end (local only)", () => {
  it("reads, draws, interprets the sketch, checks and compares with the surveyor's plan", () => {
    const job = JSON.parse(readFileSync(join(DIR, "job.json"), "utf8")) as { survey: string[]; crs: string; sketch: string; reference: string; statedExtent?: string; sketchFile?: string; settings?: Partial<DrawingSettings>; surveyorNotes?: string[]; sketchHabits?: SurveyDocument["sketchHabits"] };
    const crs = crsById(job.crs);
    expect(crs).not.toBeNull();
    const out: string[] = [`# Real job evaluation`, "", `Run ${new Date().toISOString()} on ${job.survey.join(", ")} and ${job.sketch}.`, ""];

    // 1. The survey files, as Generate Plan reads them.
    const points: SurveyPoint[] = [];
    for (const name of job.survey) {
      const r = readSurveyFile(name, readFileSync(join(DIR, name), "latin1"), crs, null);
      out.push(r.ok ? `- ${name}: ${r.read.points.length} points read (${r.read.format}).` : `- ${name}: refused: ${r.problem}`);
      if (r.ok) for (const p of r.read.points.filter((q) => !points.some((x) => x.pointId === q.pointId))) points.push({ id: `00000000-0000-4000-8000-${String(points.length + 1).padStart(12, "0")}`, pointId: p.pointId, e: p.e, n: p.n, z: p.z, code: p.code ?? null });
    }
    expect(points.length).toBeGreaterThan(0);

    // 2. The automatic draft from the field codes.
    // The sheet settings the surveyor chose for the job, when job.json gives them (such as the deed's extent on the face).
    let doc = { ...emptyDocument(), codes: commonCodes(), sheet: { ...emptyDocument().sheet, statedExtent: job.statedExtent ?? "" }, settings: { ...emptyDocument().settings, ...job.settings }, ...(job.sketchHabits ? { sketchHabits: job.sketchHabits } : {}) };
    const drafted = autoDraft({ points, document: doc, surveyorUserId: null, surveyDate: null });
    doc = drafted.document;
    out.push("", `## From the field codes`, "", `${drafted.shapes} shapes drawn.`, ...drafted.notDrawn.map((n) => `- ${n}`));

    // 3. The sketch's drawing, interpreted and applied as the sketch read does.
    const answer = JSON.parse(readFileSync(join(DIR, job.sketch), "utf8")) as SketchReadOutput;
    const record = acceptSketch(answer, [job.sketchFile ?? "sketch.jpg"], "claude (as read for this evaluation)", new Date());
    doc = { ...doc, sketch: record };
    // Farbaek's plain corrections, as a new read gets them (ADR 0260).
    const corrected = withAutoCorrections(doc, points, new Date());
    doc = corrected.document;
    out.push("", "## Farbaek's corrections", "", ...(corrected.corrections.length ? corrected.corrections.map((c) => `- ${c.label} read as ${c.to}`) : ["None."]));
    const interpretation = interpretDocument(doc, points)!;
    const applied = applySketch(doc, interpretation);
    doc = applied.document;
    expect(surveyDocumentSchema.safeParse(doc).success).toBe(true);

    out.push("", "## Point numbers on the sketch", "", "| Written | Survey point | How |", "| --- | --- | --- |", ...interpretation.matches.map((m) => `| ${m.label} | ${m.pointId ?? "none"} | ${m.how} |`));
    out.push("", "## What the sketch's drawing proposes", "");
    for (const p of interpretation.proposals) out.push(`- **${p.kind}${p.kind === "line" ? ` (${p.feature})` : ""}**, ${p.level}: ${p.evidence.join(" ")}`);
    out.push("", "## What it asks", "", ...interpretation.questions.map((q) => `- ${q.text} ${q.evidence.join(" ")}`));
    out.push("", `${applied.added.length} items put on the plan, each waiting for the surveyor.`, ...applied.skipped.map((s) => `- ${s}`));

    // 4. The plan, checked.
    const view = buildPlan({ points, document: doc, crsId: job.crs, crsConfirmation: "Confirmed for this evaluation", surveyor: null, approval: null });
    out.push("", "## The plan's checks", "", ...view.findings.map((f) => `- [${f.severity}] ${f.code}: ${f.message}`));

    // 4b. What the plan asks the surveyor (stage 295): the cards, the lines confirmed together, and why each other sketch line has its own.
    const asks = exceptionsFor(doc, points, view.findings);
    const together = asks.confirm.find((x) => x.together)?.together?.keys ?? [];
    const why = (key: string) => {
      const p = interpretation.proposals.find((x) => `feature:${x.id}` === key);
      if (!p || p.kind !== "line") return "not a line the sketch drew";
      const mine = interpretation.questions.filter((q) => q.item === p.id).map((q) => q.text.slice(0, 70));
      const shared = interpretation.questions.filter((q) => q.item !== p.id && q.from.some((f) => p.from.includes(f))).map((q) => `${q.item ? "about another item" : "about these lines"}: ${q.text.slice(0, 60)}`);
      return [p.settled ? "settled" : "course not settled", ...mine.map((m) => `own question: ${m}`), ...shared].join("; ");
    };
    const ownLines = asks.confirm.filter((x) => x.confirm?.startsWith("feature:sk-")).map((x) => x.confirm!);
    out.push(
      "",
      "## What the plan asks the surveyor",
      "",
      `${asks.fix.length} to fix, ${asks.confirm.length} to confirm (${together.length} lines on one card), ${asks.note.length} notes.`,
      ...ownLines.map((k) => `- ${k.slice(11, 21)}: ${why(k)}`),
    );

    // 5. Against the surveyor's own plan, and the area by two methods.
    const reference = JSON.parse(readFileSync(join(DIR, job.reference), "utf8")) as PlanReference;
    const e = evaluatePlan(doc, points, reference);
    const ring = (nums: readonly string[]) => nums.map((n) => points.find((p) => p.pointId === n)!);
    out.push(
      "",
      "## Against the surveyor's plan",
      "",
      `- Lot: ${e.score.lot}. Farbaek ${e.lot.generated.join("-")}; the plan ${e.lot.reference.join("-")}.`,
      ...e.lot.missingOff.map((x) => `  - the plan's corner ${x.point} lies ${x.offM.toFixed(3)} m off Farbaek's outline`),
      `- Lines: ${e.score.lines}.`,
      ...e.lines.map(
        (l) =>
          `  - ${l.what} (${l.points.join("-")}): ${l.found === "yes" ? "drawn" : l.found === "partly" ? "drawn in part" : "not drawn"}${l.by.length ? ` by ${l.by.join(", ")}` : ""}${l.passed.length ? `, passing ${l.passed.join(", ")} without a stop` : ""}${l.notDrawn.length && l.found !== "no" ? `; not drawn: ${l.notDrawn.map((x) => x.join(" to ")).join(", ")}` : ""}`,
      ),
      ...e.extra.map((x) => `  - extra: ${x.id} (${x.points.join("-")})`),
      `- Symbols: ${e.score.symbols}.`,
      `- Area: Farbaek's outline ${e.lot.generatedM2?.toFixed(2)} m² (trapezoid rule ${e.lot.generated.length >= 3 ? trapezoid(ring(e.lot.generated)).toFixed(2) : "-"} m²); the plan's outline ${e.lot.referenceM2?.toFixed(2)} m² (trapezoid rule ${trapezoid(ring(e.lot.reference)).toFixed(2)} m²); stated ${e.lot.statedM2?.toFixed(2) ?? "-"} m².`,
    );
    mkdirSync(join(DIR, "out"), { recursive: true });
    writeFileSync(join(DIR, "out", "evaluation.md"), out.join("\n"));
    // The sheet as drawn, page by page, to look at beside the surveyor's plan.
    const colour = { ink: "#111", muted: "#555", faint: "#999", red: "#c00", paper: "#fff" } as const;
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    view.sheet.pages.forEach((page, k) => {
      const items = page.items.map((it) =>
        it.kind === "path"
          ? `<path d="${it.points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ")}${it.closed ? " Z" : ""}" fill="${it.fill ? colour[it.fill] : "none"}" stroke="${colour[it.color]}" stroke-width="${it.width}"${it.dash ? ` stroke-dasharray="${it.dash.join(" ")}"` : ""}/>`
          : it.kind === "circle"
            ? `<circle cx="${it.cx}" cy="${it.cy}" r="${it.r}" fill="${it.fill ? colour[it.fill] : "none"}" stroke="${colour[it.color]}" stroke-width="${it.width}"/>`
            : `<text x="${it.x}" y="${it.y}" font-size="${it.size}" font-family="${it.font === "mono" ? "monospace" : "sans-serif"}" font-weight="${it.weight === "bold" ? 700 : 400}" text-anchor="${it.anchor}" fill="${colour[it.color]}" transform="rotate(${it.rotate} ${it.x} ${it.y})">${esc(it.text)}</text>`,
      );
      writeFileSync(join(DIR, "out", `page${k + 1}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.widthMm} ${page.heightMm}" width="${page.widthMm * 4}" height="${page.heightMm * 4}" style="background:#fff">${items.join("")}</svg>`);
    });
    // 6. The sketch interpretation report (stage 245), with what the surveyor said about the job kept apart from what was read.
    const sr = sketchReport({ sketch: doc.sketch!, points, codes: doc.codes, crs, interpretation });
    const notes = job.surveyorNotes?.length ? ["", "## What the surveyor said", "", "Kept apart from what was read: the surveyor's own words about the job.", "", ...job.surveyorNotes.map((n) => `- ${n}`)] : [];
    writeFileSync(join(DIR, "out", "sketch-report.md"), [sketchReportMarkdown(sr), ...notes].join(String.fromCharCode(10)));
    writeFileSync(join(DIR, "out", "evaluation.json"), JSON.stringify({ evaluation: e, interpretation: { ...interpretation, proposals: interpretation.proposals.map((p) => ({ ...p, points: undefined, corners: undefined })) } }, null, 2));
    // The plan document as built, its points by number ("#17") and its codes by name, to draw again or lay over the surveyor's plan.
    const number = new Map(points.map((p) => [p.id, p.pointId]));
    const byNumber = JSON.stringify({ ...doc, codes: doc.codes.map((c) => c.code) }, null, 1).replace(/"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/g, (whole, id: string) => (number.has(id) ? JSON.stringify(`#${number.get(id)}`) : whole));
    writeFileSync(join(DIR, "out", "document.json"), byNumber);
    expect(e.lot.generated.length).toBeGreaterThan(0);
  });
});
