/**
 * The validation and provenance report (stage 236, ADR 0245): one version's checks and where everything on it came from, as a PDF
 * a surveyor can file with the plan. It is made from what the project records, nothing worked out for it alone:
 * - the version, its coordinate system and who confirmed it, and its approval when there is one;
 * - the engines that made it;
 * - every source file with its SHA-256, and what was worked out from it (observations reduced, a traverse's closure, a rule chosen);
 * - every check on the version, most serious first, with its evidence, what to do and what it holds back;
 * - the version history and the files exported, with their fingerprints.
 * It certifies nothing, and says so: the licensed surveyor certifies a plan by signing the printed sheet.
 */
import { z } from "zod";
import { ADJUST_NAMES, ADJUST_METHODS, precisionText, weighedBy } from "../adjust";
import { HALF_MM } from "../import/closure";
import type { SurveyDocument } from "../document";
import type { Finding, Severity } from "../qc";
import { textWidth, wrap, type SceneColor, type SceneItem, type SheetPage } from "../sheet/scene";

export interface ReportInput {
  projectName: string;
  version: number;
  /** When this version was saved (ISO). */
  versionAt: string;
  /** When the report was made (ISO): its checks, engines and exports are as they stand then. */
  madeAt: string;
  crs: { name: string; confirmation: string | null };
  approval: { by: string; at: string; sha256: string } | null;
  /** Why an approval of this version no longer applies, or null. */
  lapsed: "crs_changed" | "content_changed" | null;
  /** The engines, with their versions, that worked out the checks and figures as the report gives them. */
  engines: readonly string[];
  sources: readonly { name: string; format: string; sha256: string; sizeBytes: number; points: number; at: string; notes: readonly string[] }[];
  /** Items on the plan someone other than the surveyor filled, and how many they've confirmed. */
  filled: Filled;
  /** The sketch read kept with this version, summed up, or null when none was read. */
  sketch: { reader: string; at: string; photos: number; readings: number; agree: number; close: number; differ: number; unmatched: number; unchecked: number; unreadable: number } | null;
  findings: readonly Finding[];
  versions: readonly { version: number; note: string | null; at: string }[];
  /** True when the project holds more versions or exports than were read, so the lists stop short of the oldest. */
  versionsCut: boolean;
  exports: readonly { what: string; version: number; sha256: string; at: string }[];
  exportsCut: boolean;
}

export interface Filled {
  drawn: { total: number; confirmed: number };
  ai: { total: number; confirmed: number };
}

/** What the version's own record says filled its items: drawn by tested code from the field codes, or suggested by AI. */
export function filledCounts(doc: SurveyDocument, live: (key: string) => boolean): Filled {
  const out: Filled = { drawn: { total: 0, confirmed: 0 }, ai: { total: 0, confirmed: 0 } };
  for (const [key, p] of Object.entries(doc.provenance)) {
    if (p.source === "engine" || !live(key)) continue;
    const into = p.source === "auto" ? out.drawn : out.ai;
    into.total += 1;
    if (p.reviewed) into.confirmed += 1;
  }
  return out;
}

const metres = (m: number) => `${m.toFixed(3)} m`;
const traverseSchema = z.object({
  start: z.string().max(40),
  stations: z.number().int().min(0),
  closesOn: z.string().max(40),
  length: z.number().min(0),
  misclosure: z.object({ dE: z.number(), dN: z.number(), linear: z.number().min(0) }),
  precision: z.number().positive().nullable(),
  adjusted: z
    .object({
      method: z.enum(ADJUST_METHODS),
      engine: z.string().max(40),
      largest: z.number().min(0),
      // Least squares' fit and what it weighed by (ADR 0274), so the report says which precision was used.
      stats: z
        .object({
          sigma0: z.number().min(0),
          passes: z.boolean(),
          side: z.enum(["low", "high"]).nullable().optional(),
          precision: z.object({ angleSeconds: z.number().positive(), distanceMm: z.number().positive(), distancePpm: z.number().min(0), instrument: z.string().max(120).optional() }),
        })
        .optional(),
    })
    .nullable(),
});
const reductionSchema = z.object({ engine: z.string().max(40), points: z.number().int().min(0), stations: z.number().int().min(0), traverse: traverseSchema.nullable().optional() });

/**
 * What an import's recorded settings say was worked out from the file: the observations reduced, and a traverse's closure and
 * the rule chosen. Read defensively: a record that doesn't match is left out rather than guessed at.
 */
export function sourceNotes(settings: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (settings.by === "autosurvey") out.push("Imported by Generate Plan.");
  const r = reductionSchema.safeParse(settings.reduction);
  if (!r.success) return out;
  const { engine, points, stations, traverse: t } = r.data;
  out.push(`${plural(points, "point", "points")} worked out from the instrument's observations at ${plural(stations, "station", "stations")} (${engine}).`);
  if (t) {
    // Below half a millimetre the figures round to nothing: said as the import says it.
    const closed = t.precision === null ? "exactly" : t.misclosure.linear < HALF_MM ? "within half a millimetre" : `with a misclosure of ${metres(t.misclosure.linear)} (${metres(t.misclosure.dE)} east, ${metres(t.misclosure.dN)} north), ${precisionText(t.precision)}`;
    out.push(`Traverse from ${t.start} through ${plural(t.stations, "station", "stations")}, closing on ${t.closesOn}, ${metres(t.length)} long: it closed ${closed}.`);
    const s = t.adjusted?.stats;
    const fit = s ? ` Weighted for ${weighedBy(s.precision)}; σ0 ${s.sigma0.toFixed(2)}, ${s.passes ? "within" : s.side === "low" ? "below" : "above"} the χ² test's range at 95%.` : "";
    out.push(t.adjusted ? `Adjusted by ${ADJUST_NAMES[t.adjusted.method]}, as the surveyor chose (${t.adjusted.engine}); the largest correction was ${metres(t.adjusted.largest)}.${fit}` : "Not adjusted: the points are where the observations put them.");
  }
  return out;
}

const PAGE = { w: 210, h: 297, margin: 18 } as const;
const SIZE = { title: 5.2, heading: 3.6, body: 2.75, small: 2.35 } as const;
const GROUPS: { severity: Severity; title: string }[] = [
  { severity: "error", title: "Must be fixed" },
  { severity: "professional_review", title: "For the surveyor's professional judgement" },
  { severity: "warning", title: "Warnings" },
  { severity: "information", title: "For information" },
];

/** A UTC time, to the minute, as the report prints every time. */
export const utcText = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
};

const sizeText = (bytes: number) => (bytes < 1024 ? `${bytes} bytes` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Text cut to a width, by whole characters (never half of one), ending in an ellipsis when cut; measured with the ellipsis. */
export function fitText(text: string, size: number, width: number, font: "sans" | "mono" = "sans"): string {
  if (textWidth(text, size, font) <= width) return text;
  const chars = [...text];
  while (chars.length > 1 && textWidth(`${chars.join("")}…`, size, font) > width) chars.pop();
  return `${chars.join("")}…`;
}

/** Lays text down the page and on to the next as it fills: every line wrapped to the text width, nothing past the margins. */
class Writer {
  readonly pages: SceneItem[][] = [[]];
  private y: number = PAGE.margin;
  private readonly width = PAGE.w - PAGE.margin * 2;
  private readonly bottom = PAGE.h - PAGE.margin - 8;

  private get items() {
    return this.pages[this.pages.length - 1]!;
  }

  private room(h: number) {
    if (this.y + h <= this.bottom) return;
    this.pages.push([]);
    this.y = PAGE.margin;
  }

  gap(mm: number) {
    this.y += mm;
  }

  text(t: string, opts: { size?: number; weight?: "regular" | "bold"; color?: SceneColor; font?: "sans" | "mono"; indent?: number } = {}) {
    const size = opts.size ?? SIZE.body;
    const indent = opts.indent ?? 0;
    const font = opts.font ?? "sans";
    for (const line of wrap(t, size, this.width - indent, font)) {
      // A word longer than the line (a long file name) is cut to fit rather than run past the margin.
      const lh = size * 1.42;
      this.room(lh);
      this.y += lh;
      this.items.push({ kind: "text", x: PAGE.margin + indent, y: this.y - size * 0.3, text: fitText(line, size, this.width - indent, font), size, weight: opts.weight ?? "regular", font, anchor: "start", rotate: 0, color: opts.color ?? "ink", layer: "SHEET" });
    }
  }

  heading(t: string) {
    this.room(SIZE.heading * 4);
    this.gap(SIZE.heading * 0.9);
    this.text(t, { size: SIZE.heading, weight: "bold" });
    this.gap(0.8);
  }
}

/** The report's pages: A4 portrait, each with its page number and the version it reports on at the foot. */
export function reportPages(r: ReportInput): SheetPage[] {
  const w = new Writer();
  w.text("Checks and sources report", { size: SIZE.title, weight: "bold" });
  w.gap(1);
  w.text(r.projectName, { size: SIZE.heading });
  w.text(`Version ${r.version}, saved ${utcText(r.versionAt)}. This report was made ${utcText(r.madeAt)}, with the checks as they stood then.`, { color: "muted" });
  w.gap(2);
  w.text(
    r.approval
      ? `Approved in Farbaek by ${r.approval.by} on ${r.approval.at}. Approval records the surveyor's review of this exact version; the plan is certified only by their signature on the printed sheet. This report certifies nothing.`
      : `Draft: not approved.${r.lapsed === "crs_changed" ? " An approval of this version no longer applies: the project's coordinate system changed after it." : r.lapsed === "content_changed" ? " An approval of this version no longer matches the plan as computed now." : ""} The plan is certified only by the licensed surveyor's signature on the printed sheet. This report certifies nothing.`,
  );
  if (r.approval) w.text(`Approved content SHA-256 ${r.approval.sha256}`, { font: "mono", size: SIZE.small, color: "muted" });

  w.heading("Coordinate system");
  w.text(r.crs.name);
  w.text(r.crs.confirmation ? r.crs.confirmation : "Not confirmed by a person.", { color: "muted" });

  w.heading("Worked out with");
  w.text(`${r.engines.join("; ")}: the engine versions that gave the checks and figures in this report.`, { color: "muted" });

  w.heading("Source files");
  if (r.sources.length === 0) w.text("No files were imported.", { color: "muted" });
  for (const s of r.sources) {
    w.text(`${s.name} (${s.format}), ${plural(s.points, "point", "points")}, ${sizeText(s.sizeBytes)}, imported ${utcText(s.at)}.`);
    w.text(`SHA-256 ${s.sha256}`, { font: "mono", size: SIZE.small, color: "muted", indent: 4 });
    for (const n of s.notes) w.text(n, { size: SIZE.small, color: "muted", indent: 4 });
    w.gap(1.2);
  }

  w.heading("Who filled what");
  const { drawn, ai } = r.filled;
  const rest = r.approval ? "the approval confirmed the rest" : "the rest are confirmed when the surveyor approves the plan";
  w.text(drawn.total === 0 ? "Nothing was drawn automatically from the field codes." : `${plural(drawn.total, "item was", "items were")} drawn by tested code from the field codes; the surveyor confirmed ${drawn.confirmed} of them one by one, and ${rest}.`);
  w.text(ai.total === 0 ? "No item was filled by AI." : `${plural(ai.total, "item was", "items were")} suggested by AI; the surveyor confirmed ${ai.confirmed} of them.`);
  w.text(
    "Coordinates are the imported files' own, worked out from the instrument's observations by tested code where a source says so. Distances, bearings and areas are worked out from them by tested code. AI reads documents, sketches and the surveyor's words, and suggests text and which points make a lot, road or line, for the surveyor to check.",
    { size: SIZE.small, color: "muted" },
  );

  if (r.sketch) {
    const k = r.sketch;
    w.heading("Field sketches");
    const parts = [
      k.agree > 0 ? `${k.agree} ${k.agree === 1 ? "agrees" : "agree"} with the survey` : "",
      k.close > 0 ? `${k.close} ${k.close === 1 ? "is" : "are"} within the usual measuring difference` : "",
      k.differ > 0 ? `${k.differ} ${k.differ === 1 ? "differs" : "differ"}` : "",
      k.unmatched > 0 ? `${k.unmatched} ${k.unmatched === 1 ? "names a point" : "name points"} the survey doesn't have` : "",
      k.unchecked > 0 ? `${k.unchecked} couldn't be checked` : "",
    ].filter(Boolean);
    const listed = parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
    w.text(`${plural(k.photos, "photo was", "photos were")} read by ${k.reader} on ${utcText(k.at)}: ${plural(k.readings, "reading", "readings")}${listed ? `, of which ${listed}` : ""}.${k.unreadable > 0 ? ` ${plural(k.unreadable, "piece of writing was", "pieces of writing were")} seen but not read.` : ""}`);
    w.text("Sketches are read only to check the survey: nothing on the plan was drawn or measured from them.", { size: SIZE.small, color: "muted" });
  }

  w.heading("Checks");
  if (r.findings.length === 0) w.text("No check raised anything on this version.", { color: "muted" });
  for (const g of GROUPS) {
    const fs = r.findings.filter((f) => f.severity === g.severity);
    if (fs.length === 0) continue;
    w.gap(0.6);
    w.text(`${g.title} (${fs.length})`, { weight: "bold" });
    for (const f of fs) {
      w.text(f.message, { indent: 4 });
      if (f.detail) w.text(f.detail, { size: SIZE.small, color: "muted", indent: 8 });
      if (f.action) w.text(`Next: ${f.action}`, { size: SIZE.small, color: "muted", indent: 8 });
      if (f.blocks.length > 0) w.text(`Holds back: ${f.blocks.join(", ")}.`, { size: SIZE.small, color: "muted", indent: 8 });
      w.text(f.code, { font: "mono", size: SIZE.small, color: "faint", indent: 8 });
      w.gap(0.8);
    }
  }

  w.heading("Version history");
  for (const v of r.versions.slice(0, 30)) w.text(`Version ${v.version}, ${utcText(v.at)}${v.note ? `: ${v.note}` : "."}`, { size: SIZE.small });
  // The project's page reads the newest versions and exports only; past that, the oldest weren't read and aren't counted.
  const beyond = (n: number, cut: boolean, one: string, many: string) => `And ${plural(n, `earlier ${one}`, `earlier ${many}`)}${cut ? " listed in the project, and any older ones, which weren't read for this report." : "."}`;
  if (r.versions.length > 30) w.text(beyond(r.versions.length - 30, r.versionsCut, "version", "versions"), { size: SIZE.small, color: "muted" });
  else if (r.versionsCut) w.text("Older versions weren't read for this report.", { size: SIZE.small, color: "muted" });

  w.heading("Files exported");
  if (r.exports.length === 0) w.text("None yet.", { color: "muted" });
  for (const x of r.exports.slice(0, 40)) {
    w.text(`${x.what}, version ${x.version}, ${utcText(x.at)}.`, { size: SIZE.small });
    w.text(`SHA-256 ${x.sha256}`, { font: "mono", size: SIZE.small, color: "muted", indent: 4 });
  }
  if (r.exports.length > 40) w.text(beyond(r.exports.length - 40, r.exportsCut, "file", "files"), { size: SIZE.small, color: "muted" });
  else if (r.exportsCut) w.text("Older exports weren't read for this report.", { size: SIZE.small, color: "muted" });

  w.gap(4);
  w.text("Farbaek prepares and checks survey plans. Machine checks aren't certification: the licensed surveyor reviews the plan and certifies it by signing the printed sheet.", { size: SIZE.small, color: "muted" });

  const total = w.pages.length;
  return w.pages.map((items, i) => {
    // The project's name gives way to the page number: cut to the room the rest of the footer leaves.
    const rest = `, version ${r.version}: checks and sources report, page ${i + 1} of ${total}`;
    const name = fitText(r.projectName, SIZE.small, PAGE.w - PAGE.margin * 2 - textWidth(rest, SIZE.small), "sans");
    return {
      widthMm: PAGE.w,
      heightMm: PAGE.h,
      role: i === 0 ? ("front" as const) : ("overleaf" as const),
      items: [
        ...items,
        { kind: "text" as const, x: PAGE.margin, y: PAGE.h - PAGE.margin + 2, text: `${name}${rest}`, size: SIZE.small, weight: "regular" as const, font: "sans" as const, anchor: "start" as const, rotate: 0, color: "faint" as const, layer: "SHEET" as const },
      ],
    };
  });
}
