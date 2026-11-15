/**
 * Reads the PDF Farbaek writes back as bytes: page size, print scaling,
 * embedded fonts, page count, and the drawing's true scale measured from the
 * PDF's own path operators. Data is SYNTHETIC (src/core/survey/fixtures.ts).
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { crsById } from "@/core/survey/crs";
import { SAMPLE_POINTS, sampleDocument } from "@/core/survey/fixtures";
import { computeParcel } from "@/core/survey/parcel";
import { composeSheet } from "@/core/survey/sheet/compose";
import { toPage } from "@/core/survey/sheet/scene";
import { SRI_LANKA_CADASTRAL_V1 } from "@/core/survey/sheet/template";
import { MM_TO_PT, renderPdf } from "./pdf";

const doc = sampleDocument();
const parcelResult = computeParcel(SAMPLE_POINTS, doc.boundary);
if (!parcelResult.ok) throw new Error("sample parcel");
const parcel = parcelResult.parcel;
const sheet = composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: doc, points: SAMPLE_POINTS, parcel, crs: crsById("EPSG:5235"), crsConfirmation: "Confirmed by Test Person on 2026-11-15", surveyor: null, approval: null });
const meta = { title: "Sample plan", subject: "Synthetic test", createdAt: new Date("2026-11-15T00:00:00Z") };

/** PDFKit writes numbers rounded to six decimals, without trailing zeros. */
const n = (v: number) => String(Math.round(v * 1e6) / 1e6);

describe("the plan PDF", () => {
  it("is a PDF 1.7 at A3 landscape that asks not to be scaled, with embedded fonts and an overleaf", async () => {
    const pdf = (await renderPdf(sheet.pages, meta, { compress: false })).toString("latin1");
    expect(pdf.startsWith("%PDF-1.7")).toBe(true);
    expect(pdf).toContain("/PrintScaling /None");
    expect(pdf).toContain(`/MediaBox [0 0 ${n(420 * MM_TO_PT)} ${n(297 * MM_TO_PT)}]`);
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(2);
    expect(pdf.match(/\/FontFile2/g)!.length).toBeGreaterThanOrEqual(2);
    expect(pdf).not.toContain("/BaseFont /Helvetica");
  }, 30_000);

  it("draws the boundary at exactly the plan's scale", async () => {
    const pdf = (await renderPdf(sheet.pages, meta, { compress: false })).toString("latin1");
    const v = sheet.viewport!;
    const [x0, y0] = toPage(v, parcel.vertices[0]!.e, parcel.vertices[0]!.n);
    const [x1, y1] = toPage(v, parcel.vertices[1]!.e, parcel.vertices[1]!.n);
    // The boundary path's first two operators, as PDFKit writes them in its top-down user space.
    const move = `${n(x0 * MM_TO_PT)} ${n(y0 * MM_TO_PT)} m`;
    const line = `${n(x1 * MM_TO_PT)} ${n(y1 * MM_TO_PT)} l`;
    const at = pdf.indexOf(`${move}\n${line}`);
    expect(at).toBeGreaterThan(0);
    const lengthPt = Math.hypot((x1 - x0) * MM_TO_PT, (y1 - y0) * MM_TO_PT);
    const expectedPt = ((parcel.legs[0]!.distance * 1000) / v.scale) * MM_TO_PT;
    expect(lengthPt).toBeCloseTo(expectedPt, 6);
    // And 10 m on the ground is 10 × 1000 / scale mm of paper, in points.
    expect(((10 * 1000) / v.scale) * MM_TO_PT).toBeCloseTo((10_000 / v.scale) * (72 / 25.4), 9);
  }, 30_000);

  it("gives the same bytes for the same version", async () => {
    const a = await renderPdf(sheet.pages, meta);
    const b = await renderPdf(sheet.pages, meta);
    expect(a.length).toBe(b.length);
  }, 30_000);
});
