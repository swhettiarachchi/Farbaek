/**
 * Reading a point file's columns for the surveyor (stage 194): which column is
 * the point number, the easting, the northing, the elevation and the code,
 * each with the reason in a plain sentence. The guess is shown and can be
 * changed; where the file can't settle a question (two columns that both fit
 * the grid as eastings), it says so instead of picking silently.
 *
 * Column names decide first ("Point, Easting, Northing, Height, Code").
 * Without them, the values do: a column of distinct numbers or names first
 * is the point number, words are the code, the first two coordinate columns
 * are the horizontal pair and a third is the elevation. Which of the pair is
 * the easting is settled by the project's grid only when exactly one order
 * puts every point inside the grid's area; otherwise it's read northing first,
 * as the Survey Department's PNEZC coordinate file has it (Departmental Survey
 * Regulations, Chapter XXII, section 22.3), and the surveyor is asked to check.
 * X and Y headers are treated the same way: in some instruments' convention X
 * is the northing.
 */
import type { CrsRecord } from "../crs";
import { readNumber, type ColumnRole, type DelimitedPreview } from "./delimited";

export interface ColumnGuess {
  columns: ColumnRole[];
  /** Why each column was read as it was, in plain sentences. */
  reasons: string[];
  /** What the file couldn't settle, for the surveyor to check before importing. Empty when everything is clear. */
  unsure: string[];
  /** Set when the coordinates look like latitude and longitude: they can't be imported as grid metres. */
  latLong: boolean;
}

const SYNONYMS: { role: ColumnRole; re: RegExp }[] = [
  { role: "point", re: /^(?:pt|pnt|point|points|point ?(?:no|num|number|id|name)\.?|name|pt ?(?:no|id)\.?|id|station|stn|no\.?|#|pid)$/i },
  { role: "easting", re: /^(?:e|east|easting|eastings|e ?\(m\)|easting ?\(m\))$/i },
  { role: "northing", re: /^(?:n|north|northing|northings|n ?\(m\)|northing ?\(m\))$/i },
  { role: "elevation", re: /^(?:z|h|ht|elev|elevation|height|rl|level|r\.l\.|elevation ?\(m\)|height ?\(m\))$/i },
  { role: "code", re: /^(?:code|codes|desc|description|descriptor|remark|remarks|feature|attr|attribute|note|notes|field code)$/i },
];

const roleOfHeader = (h: string): ColumnRole | "x" | "y" | null => {
  const t = h.trim().replace(/^["']|["']$/g, "");
  if (/^x(?: ?\(m\))?$/i.test(t)) return "x";
  if (/^y(?: ?\(m\))?$/i.test(t)) return "y";
  return SYNONYMS.find((s) => s.re.test(t))?.role ?? null;
};

/** Which order of a coordinate pair puts every point inside the grid's area: "en", "ne", "both" or "neither" (or "unknown" for a local grid). */
function pairOrder(a: number[], b: number[], crs: CrsRecord | null): "en" | "ne" | "both" | "neither" | "unknown" {
  const r = crs?.plausibleRange;
  if (!r || a.length === 0) return "unknown";
  const inside = (e: number[], n: number[]) => e.every((x, i) => x >= r.minE && x <= r.maxE && n[i]! >= r.minN && n[i]! <= r.maxN);
  const en = inside(a, b);
  const ne = inside(b, a);
  return en && ne ? "both" : en ? "en" : ne ? "ne" : "neither";
}

const ordinal = (i: number) => `column ${i + 1}`;

/** The column roles for a previewed file (use a preview of a few hundred rows), with reasons. */
export function suggestColumns(preview: DelimitedPreview, crs: CrsRecord | null): ColumnGuess {
  const width = preview.columnCount;
  const rows = preview.rows.filter((r) => r.length >= Math.min(width, 3));
  const cols = Array.from({ length: width }, (_, j) => rows.map((r) => (r[j] ?? "").trim()));
  const nums = cols.map((c) => c.map((v) => readNumber(v)));
  const numeric = nums.map((c) => c.filter((v) => v !== null).length / Math.max(1, c.length));
  const columns: ColumnRole[] = Array<ColumnRole>(width).fill("ignore");
  const reasons: string[] = [];
  const unsure: string[] = [];
  const name = crs?.name ?? "the project's grid";

  // Latitude and longitude: two columns of small numbers with many decimals, inside ±90 and ±180.
  const degrees = (j: number, max: number) => numeric[j]! > 0.9 && nums[j]!.every((v) => v === null || Math.abs(v) <= max) && cols[j]!.some((v) => /\.\d{6,}$/.test(v));
  const latLong = Array.from({ length: width }, (_, j) => j).some((j) => degrees(j, 90) && Array.from({ length: width }, (_, k) => k).some((k) => k !== j && degrees(k, 180) && cols[k]!.some((v) => Math.abs(Number(v)) > 1)));

  // Resolves a horizontal pair (columns a then b) to easting and northing, or says it can't.
  const settlePair = (a: number, b: number, why: string) => {
    const order = pairOrder(nums[a]!.filter((v): v is number => v !== null), nums[b]!.filter((v): v is number => v !== null), crs);
    if (order === "ne") {
      columns[a] = "northing";
      columns[b] = "easting";
      reasons.push(`${ordinal(a)} is the northing and ${ordinal(b)} the easting: ${why}in that order every point lies inside ${name}, and the other way round they don't.`);
    } else if (order === "en") {
      columns[a] = "easting";
      columns[b] = "northing";
      reasons.push(`${ordinal(a)} is the easting and ${ordinal(b)} the northing: ${why}in that order every point lies inside ${name}, and the other way round they don't.`);
    } else {
      // Unsettled: northing first, as in the Survey Department's PNEZC file, and said.
      columns[a] = "northing";
      columns[b] = "easting";
      const pnezc = "Farbaek reads them northing first, as the Survey Department's PNEZC coordinate file has them";
      if (order === "both") unsure.push(`Both orders of ${ordinal(a)} and ${ordinal(b)} fit inside ${name}, so the grid can't tell the easting from the northing. ${pnezc}: check that against your instrument's export setting.`);
      else if (order === "neither") unsure.push(`${ordinal(a)} and ${ordinal(b)} don't fit inside ${name} in either order. Check the project's coordinate system, or that these are grid coordinates in metres.`);
      else unsure.push(`A local grid can't tell the easting from the northing. ${pnezc}: check that against your instrument's export setting.`);
    }
  };

  // Column names, when the file has them.
  if (preview.header) {
    const roles = preview.header.map(roleOfHeader);
    const xs = roles.indexOf("x");
    const ys = roles.indexOf("y");
    roles.forEach((r, j) => {
      if (r && r !== "x" && r !== "y" && j < width && !columns.includes(r)) columns[j] = r;
    });
    if (xs >= 0 && ys >= 0 && !columns.includes("easting") && !columns.includes("northing")) settlePair(Math.min(xs, ys), Math.max(xs, ys), "the columns are named X and Y, which instruments use either way round; ");
    if (columns.includes("point") && columns.includes("easting") && columns.includes("northing")) {
      reasons.unshift(`Read from the column names: ${preview.header.slice(0, width).map((h) => h.trim() || "(blank)").join(", ")}.`);
      return { columns, reasons, unsure, latLong };
    }
    columns.fill("ignore");
    reasons.length = 0;
    unsure.length = 0;
  }

  // From the values.
  const used = new Set<number>();
  const distinct = (j: number) => new Set(cols[j]).size === cols[j]!.length && cols[j]!.every((v) => v !== "");
  const point = Array.from({ length: width }, (_, j) => j).find((j) => distinct(j) && (numeric[j]! < 0.5 || nums[j]!.every((v) => v !== null && Number.isInteger(v) && Math.abs(v) < 1e7)));
  if (point !== undefined) {
    columns[point] = "point";
    used.add(point);
    reasons.push(`${ordinal(point)} is the point number: each row has a different one.`);
  } else unsure.push("No column has a different value on every row, so the point number isn't clear. Choose its column.");
  const textual = Array.from({ length: width }, (_, j) => j).filter((j) => !used.has(j) && numeric[j]! < 0.5);
  const code = textual.find((j) => cols[j]!.some((v) => /[A-Za-z]/.test(v)));
  if (code !== undefined) {
    columns[code] = "code";
    used.add(code);
    reasons.push(`${ordinal(code)} is the code: it holds words such as ${[...new Set(cols[code]!.filter(Boolean).map((v) => v.split(/\s+/)[0]))].slice(0, 3).join(", ")}.`);
  }
  const coords = Array.from({ length: width }, (_, j) => j).filter((j) => !used.has(j) && numeric[j]! >= 0.9);
  if (coords.length >= 2) {
    // Grid coordinates are the large numbers; a third, much smaller column beside them is the elevation.
    const big = (j: number) => {
      const v = nums[j]!.filter((x): x is number => x !== null);
      return v.length > 0 ? v.reduce((s, x) => s + Math.abs(x), 0) / v.length : 0;
    };
    const ordered = [...coords];
    const [a, b] = ordered.slice(0, 2) as [number, number];
    settlePair(a, b, "");
    const z = ordered[2];
    if (z !== undefined) {
      columns[z] = "elevation";
      reasons.push(big(z) < Math.min(big(a), big(b)) / 10 || crs?.plausibleRange === null ? `${ordinal(z)} is the elevation: the third coordinate.` : `${ordinal(z)} is read as the elevation, the third coordinate. Check it: its numbers are as large as the easting's.`);
    }
  } else unsure.push("Fewer than two columns hold numbers on every row, so the coordinates aren't clear. Choose their columns.");
  const sentence = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  return { columns, reasons: reasons.map(sentence), unsure: unsure.map(sentence), latLong };
}
