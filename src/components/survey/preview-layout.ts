/**
 * Where AutoSurvey's start draws the points it read (stage 293): north up, at one scale both ways, in screen pixels so point numbers
 * stay 12 px on a phone. Numbers are placed beside their point where they don't cover another number or point; the rest are left off
 * and counted (every point is in the list under the drawing). Presentation only: no coordinate is changed.
 */

export interface PreviewPoint {
  id: string;
  e: number;
  n: number;
}

export interface PreviewLayout {
  width: number;
  height: number;
  dots: { id: string; x: number; y: number; station: boolean }[];
  labels: { id: string; x: number; y: number; anchor: "start" | "middle" | "end" }[];
  /** Numbers left off where points crowd. */
  hidden: number;
  /** The points' spread on the ground, in metres. */
  across: number;
  along: number;
  /** Where grid north's arrow stands (its tip), at the top right. */
  north: { x: number; y: number };
  /** A scale bar of a round length, starting at the bottom left; none when no round length fits or the points share one place. */
  bar: { x: number; y: number; metres: number; pixels: number } | null;
}

const PAD = 28;
/** More room on the right, so no point sits under the north arrow at the top right. */
const PAD_RIGHT = PAD + 18;
const TEXT = 12;
/** Geist's figures are about 0.62 em wide. */
const charWidth = TEXT * 0.62;
/** Numbers are placed only up to this many points; past it the drawing is dots. */
export const LABELLED_POINTS = 400;

type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const ROUND = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

/** The scale bar's words ("10 m", "5 cm"). */
export const barWords = (metres: number) => (metres >= 1 ? `${metres} m` : `${Math.round(metres * 100)} cm`);

export function layoutPreview(points: readonly PreviewPoint[], stations: ReadonlySet<string>, width: number): PreviewLayout | null {
  if (points.length === 0 || !(width > 0)) return null;
  const es = points.map((p) => p.e);
  const ns = points.map((p) => p.n);
  const [minE, maxE, minN, maxN] = [Math.min(...es), Math.max(...es), Math.min(...ns), Math.max(...ns)];
  const across = maxE - minE;
  const along = maxN - minN;
  // A tall survey is drawn taller, within what a phone shows at once.
  const inner = Math.max(1, width - PAD - PAD_RIGHT);
  const shape = across > 0 ? along / across : 1;
  const height = Math.round(Math.min(420, Math.max(220, inner * Math.min(shape, 1.2) + 2 * PAD)));
  const spanE = Math.max(across, 1e-6);
  const spanN = Math.max(along, 1e-6);
  const scale = across === 0 && along === 0 ? 1 : Math.min(inner / spanE, (height - 2 * PAD) / spanN);
  const offX = PAD + (inner - spanE * scale) / 2;
  const offY = (height - spanN * scale) / 2;
  const dots = points.map((p) => ({ id: p.id, x: across === 0 ? width / 2 : offX + (p.e - minE) * scale, y: along === 0 ? height / 2 : offY + (maxN - p.n) * scale, station: stations.has(p.id) }));

  // The longest round length no wider than a quarter of the drawing; none when the points share one place or nothing fits.
  const north = { x: width - 22, y: 14 };
  const metres = across === 0 && along === 0 ? null : ([...ROUND].reverse().find((m) => m * scale <= width / 4) ?? null);
  const bar = metres === null ? null : { x: 16, y: height - 14, metres, pixels: metres * scale };

  const labels: PreviewLayout["labels"] = [];
  let hidden = 0;
  if (dots.length <= LABELLED_POINTS) {
    const taken: Box[] = dots.map((d) => ({ x0: d.x - 4, y0: d.y - 4, x1: d.x + 4, y1: d.y + 4 }));
    // The north arrow and its N, and the scale bar with its words, are never covered by a number.
    taken.push({ x0: north.x - 7, y0: north.y - 2, x1: north.x + 7, y1: north.y + 30 });
    if (bar) taken.push({ x0: bar.x - 2, y0: bar.y - 12, x1: bar.x + bar.pixels + 8 + barWords(bar.metres).length * charWidth, y1: bar.y + 8 });
    // Stations' numbers first: they're what a surveyor looks for.
    const order = [...dots].sort((a, b) => Number(b.station) - Number(a.station));
    for (const d of order) {
      const w = d.id.length * charWidth + 2;
      const tries: { x: number; y: number; anchor: "start" | "middle" | "end"; box: Box }[] = [
        { x: d.x + 6, y: d.y + 4, anchor: "start", box: { x0: d.x + 5, y0: d.y - 6, x1: d.x + 6 + w, y1: d.y + 6 } },
        { x: d.x - 6, y: d.y + 4, anchor: "end", box: { x0: d.x - 6 - w, y0: d.y - 6, x1: d.x - 5, y1: d.y + 6 } },
        { x: d.x, y: d.y - 8, anchor: "middle", box: { x0: d.x - w / 2, y0: d.y - 19, x1: d.x + w / 2, y1: d.y - 6 } },
        { x: d.x, y: d.y + 17, anchor: "middle", box: { x0: d.x - w / 2, y0: d.y + 6, x1: d.x + w / 2, y1: d.y + 19 } },
      ];
      const fit = tries.find((t) => t.box.x0 >= 0 && t.box.x1 <= width && t.box.y0 >= 0 && t.box.y1 <= height && !taken.some((b) => overlaps(b, t.box)));
      if (!fit) {
        hidden++;
        continue;
      }
      taken.push(fit.box);
      labels.push({ id: d.id, x: fit.x, y: fit.y, anchor: fit.anchor });
    }
  } else hidden = dots.length;

  return { width, height, dots, labels, hidden, across, along, north, bar };
}
