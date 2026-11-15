import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { SceneColor, SceneItem, SheetPage } from "@/core/survey/sheet/scene";
import { SURVEY_ENGINE_VERSION } from "@/core/survey/version";

/**
 * Vector PDF of a composed sheet scene (ADR 0200). PDFKit (MIT) draws real
 * paths and text with embedded fonts, never a picture of the sheet. Every
 * millimetre in the scene becomes 72 / 25.4 points, so a drawing at 1:500
 * prints at 1:500 when printed at 100%. The file asks viewers not to scale
 * it when printing (PDF 1.6 PrintScaling None), which is a request viewers
 * may ignore: the sheet itself tells people to print at actual size.
 */

export const MM_TO_PT = 72 / 25.4;

const COLORS: Record<SceneColor, string> = { ink: "#000000", muted: "#4a4a4a", faint: "#8a8a8a", red: "#b3261e", paper: "#ffffff" };

let fonts: { sans: Buffer; mono: Buffer } | null = null;
function loadFonts(): { sans: Buffer; mono: Buffer } {
  // Geist and Geist Mono (SIL Open Font License, android/app/src/main/assets/fonts/OFL.txt), embedded as subsets.
  fonts ??= {
    sans: readFileSync(join(process.cwd(), "android/app/src/main/assets/fonts/geist.ttf")),
    mono: readFileSync(join(process.cwd(), "android/app/src/main/assets/fonts/geist-mono.ttf")),
  };
  return fonts;
}

export interface PdfMeta {
  title: string;
  subject: string;
  /** Fixed for a given export, so the same version always produces the same file. */
  createdAt: Date;
}

export function renderPdf(pages: readonly SheetPage[], meta: PdfMeta, options: { compress?: boolean } = {}): Promise<Buffer> {
  const f = loadFonts();
  const first = pages[0];
  if (!first) return Promise.reject(new Error("Nothing to print."));
  const doc = new PDFDocument({
    size: [first.widthMm * MM_TO_PT, first.heightMm * MM_TO_PT],
    margin: 0,
    autoFirstPage: false,
    pdfVersion: "1.7",
    // Uncompressed only so tests can read the drawing operators back.
    compress: options.compress ?? true,
    // Makes PDFKit create the viewer preferences object (and close it itself when the file ends).
    displayTitle: true,
    info: { Title: meta.title, Subject: meta.subject, Creator: `Farbaek Survey Studio (${SURVEY_ENGINE_VERSION})`, Producer: "Farbaek Survey Studio", CreationDate: meta.createdAt, ModDate: meta.createdAt },
  });
  // Viewers that honour it print at 100%. PDFKit writes plain strings as PDF names: /PrintScaling /None.
  const prefs = (doc as unknown as { _root: { data: { ViewerPreferences?: { data: Record<string, unknown> } } } })._root.data.ViewerPreferences;
  if (prefs) prefs.data.PrintScaling = "None";
  doc.registerFont("sans", f.sans);
  doc.registerFont("mono", f.mono);

  for (const page of pages) {
    doc.addPage({ size: [page.widthMm * MM_TO_PT, page.heightMm * MM_TO_PT], margin: 0 });
    for (const item of page.items) draw(doc, item);
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function draw(doc: PDFKit.PDFDocument, item: SceneItem): void {
  const k = MM_TO_PT;
  if (item.kind === "path") {
    if (item.points.length < 2) return;
    doc.save();
    doc.lineWidth(item.width * k).lineJoin("round").lineCap("butt");
    if (item.dash && item.dash.length >= 2) doc.dash(item.dash[0]! * k, { space: item.dash[1]! * k });
    const [x0, y0] = item.points[0]!;
    doc.moveTo(x0 * k, y0 * k);
    for (const [x, y] of item.points.slice(1)) doc.lineTo(x * k, y * k);
    if (item.closed) doc.closePath();
    if (item.fill) doc.fillAndStroke(COLORS[item.fill], COLORS[item.color]);
    else doc.stroke(COLORS[item.color]);
    doc.restore();
    return;
  }
  if (item.kind === "circle") {
    doc.save();
    doc.lineWidth(item.width * k).circle(item.cx * k, item.cy * k, item.r * k);
    if (item.fill) doc.fillAndStroke(COLORS[item.fill], COLORS[item.color]);
    else doc.stroke(COLORS[item.color]);
    doc.restore();
    return;
  }
  if (!item.text) return;
  const size = item.size * k;
  doc.save();
  doc.font(item.font === "mono" ? "mono" : "sans").fontSize(size).fillColor(COLORS[item.color]);
  if (item.rotate) doc.rotate(item.rotate, { origin: [item.x * k, item.y * k] });
  const width = doc.widthOfString(item.text);
  const x = item.anchor === "middle" ? item.x * k - width / 2 : item.anchor === "end" ? item.x * k - width : item.x * k;
  const bold = item.weight === "bold";
  if (bold) doc.lineWidth(size * 0.045).strokeColor(COLORS[item.color]);
  doc.text(item.text, x, item.y * k, { baseline: "alphabetic", lineBreak: false, stroke: bold, fill: true });
  doc.restore();
}
