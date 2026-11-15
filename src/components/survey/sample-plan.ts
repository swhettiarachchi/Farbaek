import { formatDms, toDms } from "@/core/survey/angles";
import { SAMPLE_POINTS, sampleDocument } from "@/core/survey/fixtures";
import { fmt } from "@/core/survey/sheet/compose";
import type { SceneItem, SceneText, SheetPage } from "@/core/survey/sheet/scene";
import { SRI_LANKA_CADASTRAL_V1 } from "@/core/survey/sheet/template";
import { HECTARE_M2, formatArp, toArp } from "@/core/survey/units";
import { buildPlan } from "@/core/survey/view";

/**
 * The Sample plan, composed by the same tested engine as real plans, so the
 * picture is the product rather than an illustration. SYNTHETIC points
 * (src/core/survey/fixtures.ts), always shown labelled Sample. The figures
 * are the engine's own output for those points, formatted as on the sheet.
 */
export function samplePlan() {
  const document = sampleDocument();
  const view = buildPlan({ points: SAMPLE_POINTS, document, crsId: "EPSG:5235", crsConfirmation: "Sample data: no real survey", surveyor: null, approval: null });
  const page = view.sheet.pages[0]!;
  const { secondDecimals, distanceDecimals, perchDecimals } = document.settings;
  const parcel = view.parcel;
  const detail = detailBox(page);
  return {
    page,
    scale: view.sheet.scale,
    detail,
    /** Only what reaches the close-up's window, so the page holds no hidden text beyond it. */
    detailPage: { ...page, items: page.items.filter((i) => reaches(i, detail)) },
    legs:
      parcel?.legs.map((l) => ({
        from: l.from.pointId,
        to: l.to.pointId,
        bearing: l.bearing === null ? "None" : formatDms(toDms(l.bearing, secondDecimals)),
        distance: fmt(l.distance, distanceDecimals),
      })) ?? [],
    area: parcel ? { m2: fmt(parcel.areaM2, 2), ha: fmt(parcel.areaM2 / HECTARE_M2, 4), arp: formatArp(toArp(parcel.areaM2, perchDecimals)), perimeter: fmt(parcel.perimeterM, distanceDecimals) } : null,
  };
}

/**
 * A 4:3 magnifier window on the sheet, in millimetres: the Extent and
 * Boundaries block of the title panel, stopping above References. 52 mm wide
 * keeps its 2.4 mm text near 15 px on a 320 px card. Falls back to the whole
 * sheet.
 */
function reaches(item: SceneItem, [x, y, w, h]: [number, number, number, number]): boolean {
  const inside = (px: number, py: number) => px >= x && px <= x + w && py >= y && py <= y + h;
  if (item.kind === "text") return inside(item.x, item.y);
  if (item.kind === "circle") return inside(item.cx, item.cy);
  const xs = item.points.map((p) => p[0]);
  const ys = item.points.map((p) => p[1]);
  return Math.max(...xs) >= x && Math.min(...xs) <= x + w && Math.max(...ys) >= y && Math.min(...ys) <= y + h;
}

function detailBox(page: SheetPage): [number, number, number, number] {
  const caption = page.items.find((i): i is SceneText => i.kind === "text" && i.text === SRI_LANKA_CADASTRAL_V1.captions.extent);
  if (!caption) return [0, 0, page.widthMm, page.heightMm];
  return [caption.x - 6, caption.y - 4.6, 52, 39];
}
