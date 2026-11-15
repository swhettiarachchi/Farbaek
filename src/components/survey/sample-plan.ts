import { formatDms, toDms } from "@/core/survey/angles";
import { lotName } from "@/core/survey/document";
import { SAMPLE_POINTS, sampleDocument } from "@/core/survey/fixtures";
import { arpClassic, hectares } from "@/core/survey/formats";
import type { SceneItem, SheetPage } from "@/core/survey/sheet/scene";
import { fmt, toArp } from "@/core/survey/units";
import { buildPlan } from "@/core/survey/view";

/**
 * The Sample plan, composed by the same tested engine as real plans, so the
 * picture is the product rather than an illustration. SYNTHETIC points
 * (src/core/survey/fixtures.ts), always shown labelled Sample. The figures
 * are the engine's own output for those points, formatted as on the sheet.
 */
export function samplePlan() {
  const document = sampleDocument();
  const view = buildPlan({ points: SAMPLE_POINTS, document, crsId: "EPSG:5235", crsConfirmation: "Sample data: no real survey", surveyor: null, approval: null, version: 1 });
  const page = view.sheet.pages[0]!;
  const { secondDecimals, distanceDecimals, perchDecimals } = document.settings;
  const lots = view.lots.lots
    .filter((r) => r.parcel)
    .map((r) => ({
      name: lotName(r.lot),
      label: r.lot.label,
      sup: r.lot.sup,
      legs: r.parcel!.legs.map((l) => ({ from: l.from.pointId, to: l.to.pointId, bearing: l.bearing === null ? "None" : formatDms(toDms(l.bearing, secondDecimals)), distance: fmt(l.distance, distanceDecimals) })),
      m2: fmt(r.parcel!.areaM2, 2),
      ha: hectares(r.parcel!.areaM2),
      arp: arpClassic(toArp(r.parcel!.areaM2, perchDecimals)),
    }));
  const total = view.lots.outlineAreaM2;
  const detail = detailBox(page);
  return {
    page,
    scale: view.sheet.scale,
    paper: view.sheet.paper,
    detail,
    /** Only what reaches the close-up's window, so the page holds no hidden text beyond it. */
    detailPage: { ...page, items: page.items.filter((i) => reaches(i, detail)) },
    lots,
    total: total === null ? null : { m2: fmt(total, 2), ha: hectares(total), arp: arpClassic(toArp(total, perchDecimals)) },
  };
}

function reaches(item: SceneItem, [x, y, w, h]: [number, number, number, number]): boolean {
  const inside = (px: number, py: number) => px >= x && px <= x + w && py >= y && py <= y + h;
  if (item.kind === "text") return inside(item.x, item.y);
  if (item.kind === "circle") return inside(item.cx, item.cy);
  const xs = item.points.map((p) => p[0]);
  const ys = item.points.map((p) => p[1]);
  return Math.max(...xs) >= x && Math.min(...xs) <= x + w && Math.max(...ys) >= y && Math.min(...ys) <= y + h;
}

/**
 * A 4:3 close-up of the drawing: the lots' labels and the road's name and
 * width, with a little room around them, so the lettering reads at the size
 * of a small card. Falls back to the whole sheet.
 */
function detailBox(page: SheetPage): [number, number, number, number] {
  const marks = page.items.filter((i) => i.kind === "text" && (i.layer === "LOT_TEXT" || i.layer === "ROADS"));
  if (marks.length === 0) return [0, 0, page.widthMm, page.heightMm];
  const xs = marks.map((i) => (i.kind === "text" ? i.x : 0));
  const ys = marks.map((i) => (i.kind === "text" ? i.y : 0));
  let w = Math.max(...xs) - Math.min(...xs) + 24;
  let h = Math.max(...ys) - Math.min(...ys) + 16;
  if (w / h > 4 / 3) h = (w * 3) / 4;
  else w = (h * 4) / 3;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  return [cx - w / 2, cy - h / 2, w, h];
}
