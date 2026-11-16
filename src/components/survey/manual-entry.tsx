"use client";

import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { fieldBookText } from "@/core/survey/import/fieldbook";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";

type CoordRow = { point: string; n: string; e: string; z: string; code: string };
type LegRow = { from: string; to: string; bearing: string; distance: string; code: string };

const emptyCoord = (): CoordRow => ({ point: "", n: "", e: "", z: "", code: "" });
/** The next point number after a numeric one ("12" gives "13"), or empty. */
const nextNumber = (id: string) => (/^\d+$/.test(id.trim()) ? String(Number(id.trim()) + 1) : "");

/** The coordinate rows as the CSV the import reads, with names on the first line. */
export function coordinatesText(rows: readonly CoordRow[]): string {
  const clean = (s: string) => s.replace(/[\r\n,]/g, " ").trim();
  return ["Point,Northing,Easting,Height,Code", ...rows.filter((r) => r.point.trim() || r.n.trim() || r.e.trim()).map((r) => [r.point, r.n, r.e, r.z, r.code].map(clean).join(","))].join("\n");
}

/**
 * Typing the points in (stage 194), as in CAD: a keyboard-first table that writes the same text an upload would, so the same reader,
 * preview, checks and drawing apply.
 * - Coordinates: point, northing, easting, height, code. Pasting several rows from a spreadsheet into the first cell fills the table.
 * - Bearings and distances: from a starting point (new, or one already in the project), each leg's bearing and horizontal distance,
 *   like CAD's polar input. Enter on a leg's last cell starts the next leg from where this one ended.
 */
export function ManualEntry({
  mode,
  onText,
  knownIds,
  disabled,
  initialCoords,
  initialLegs,
}: {
  mode: "coordinates" | "bearings";
  onText: (name: string, text: string) => void;
  knownIds: readonly string[];
  disabled: boolean;
  /** Rows the drafting assistant read from what was said (stage 195), to check here before importing. */
  initialCoords?: CoordRow[];
  initialLegs?: LegRow[];
}) {
  const [coords, setCoords] = useState<CoordRow[]>(initialCoords?.length ? [...initialCoords, emptyCoord()] : [emptyCoord(), emptyCoord(), emptyCoord()]);
  const [start, setStart] = useState({ pointId: "", n: "", e: "" });
  const [legs, setLegs] = useState<LegRow[]>(initialLegs?.length ? initialLegs : [{ from: "", to: "", bearing: "", distance: "", code: "" }]);

  const pushCoords = (next: CoordRow[]) => {
    setCoords(next);
    onText("typed-points.csv", coordinatesText(next));
  };
  const pushLegs = (s: typeof start, next: LegRow[]) => {
    setStart(s);
    setLegs(next);
    onText("field-book.txt", fieldBookText(s.pointId.trim() && !knownIds.includes(s.pointId.trim()) ? s : null, next.map((l, i) => ({ ...l, from: l.from.trim() || (i === 0 ? s.pointId : next[i - 1]!.to) }))));
  };

  // Rows handed over by the assistant go to the preview at once, as if typed.
  useEffect(() => {
    if (mode === "coordinates" && initialCoords?.length) onText("typed-points.csv", coordinatesText(coords));
    if (mode === "bearings" && initialLegs?.length) onText("field-book.txt", fieldBookText(null, legs.map((l, i) => ({ ...l, from: l.from.trim() || (i === 0 ? "" : legs[i - 1]!.to) }))));
    // Once, when the handed-over rows arrive; the table's own edits push from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Several rows pasted into one cell (from a spreadsheet or a text file) fill the table from there.
  const onPaste = (i: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/[\r\n]/.test(text.trim())) return;
    e.preventDefault();
    const rows = text.trim().split(/\r\n|\r|\n/).map((l) => l.split(/\t|,|;/).map((c) => c.trim()));
    const parsed = rows.map((c): CoordRow => ({ point: c[0] ?? "", n: c[1] ?? "", e: c[2] ?? "", z: c[3] ?? "", code: c.slice(4).join(" ") }));
    pushCoords([...coords.slice(0, i), ...parsed, ...coords.slice(i + parsed.length)].slice(0, 2000));
  };
  const addCoordRow = (after: number) => pushCoords([...coords.slice(0, after + 1), { ...emptyCoord(), point: nextNumber(coords[after]?.point ?? "") }, ...coords.slice(after + 1)]);
  const addLeg = (after: number) => {
    const prev = legs[after]!;
    pushLegs(start, [...legs.slice(0, after + 1), { from: prev.to, to: nextNumber(prev.to), bearing: "", distance: "", code: "" }, ...legs.slice(after + 1)]);
  };
  const enterAdds = (add: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
      // Focus moves to the new row's first editable cell after it renders.
      const row = e.currentTarget.closest("tr");
      requestAnimationFrame(() => (row?.nextElementSibling?.querySelector("input") as HTMLInputElement | null)?.focus());
    }
  };

  const cell = "min-w-0 font-mono";
  // On a phone each row is a card, its fields in a small grid with their names above them (stage 196): a 640px table of 44px
  // fields doesn't fit a phone even when it scrolls. From sm it's the table.
  const TABLE = "w-full text-left text-sm max-sm:block sm:min-w-[40rem]";
  const HEAD = "bg-canvas-2 text-ink-2 max-sm:sr-only";
  const BODY = "max-sm:grid max-sm:gap-2 max-sm:p-2";
  const ROW = "border-t border-line max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] max-sm:gap-2 max-sm:rounded-sm max-sm:border max-sm:bg-surface max-sm:p-2.5";
  const CELL = "p-1 max-sm:grid max-sm:gap-1 max-sm:p-0 max-sm:before:text-xs max-sm:before:text-ink-3 max-sm:before:content-[attr(data-label)]";
  const AREA: Record<string, string> = {
    point: "max-sm:[grid-area:1/1]",
    from: "max-sm:[grid-area:1/1]",
    to: "max-sm:[grid-area:1/2]",
    code: "max-sm:[grid-area:3/1/4/3]",
    n: "max-sm:[grid-area:2/1]",
    bearing: "max-sm:[grid-area:2/1]",
    e: "max-sm:[grid-area:2/2/3/4]",
    distance: "max-sm:[grid-area:2/2/3/4]",
    z: "max-sm:[grid-area:1/2]",
  };
  const REMOVE = "p-1 max-sm:self-end max-sm:p-0 max-sm:[grid-area:1/3]";
  if (mode === "coordinates") {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-ink-2">Type or paste the points: point, northing, easting, height and code, in metres in the project&apos;s grid. Enter in the last cell adds a row; rows pasted from a spreadsheet fill the table.</p>
        <div className="overflow-x-auto rounded-md ring-1 ring-line">
          <table className={TABLE}>
            <thead className={HEAD}>
              <tr>
                {["Point", "Northing", "Easting", "Height", "Code"].map((h) => (
                  <th key={h} scope="col" className="p-2 font-medium">
                    {h}
                  </th>
                ))}
                <th scope="col" className="p-2">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody className={BODY}>
              {coords.map((r, i) => (
                <tr key={i} className={ROW}>
                  {(["point", "n", "e", "z", "code"] as const).map((k) => (
                    <td key={k} data-label={{ point: "Point", n: "Northing", e: "Easting", z: "Height", code: "Code" }[k]} className={`${CELL} ${AREA[k]}`}>
                      <input
                        aria-label={`${{ point: "Point", n: "Northing", e: "Easting", z: "Height", code: "Code" }[k]}, row ${i + 1}`}
                        value={r[k]}
                        disabled={disabled}
                        inputMode={k === "n" || k === "e" || k === "z" ? "decimal" : "text"}
                        onChange={(e) => pushCoords(coords.map((x, j) => (j === i ? { ...x, [k]: e.target.value.slice(0, 64) } : x)))}
                        onPaste={k === "point" ? onPaste(i) : undefined}
                        onKeyDown={k === "code" ? enterAdds(() => addCoordRow(i)) : undefined}
                        className={inputClasses(cell)}
                      />
                    </td>
                  ))}
                  <td className={REMOVE}>
                    <button type="button" aria-label={`Remove row ${i + 1}`} disabled={disabled || coords.length <= 1} onClick={() => pushCoords(coords.filter((_, j) => j !== i))} className={buttonClasses("ghost", "icon")}>
                      <TrashIcon size={16} weight="bold" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" disabled={disabled || coords.length >= 2000} onClick={() => addCoordRow(coords.length - 1)} className={buttonClasses("secondary", "sm", "w-fit")}>
          <PlusIcon size={16} weight="bold" aria-hidden />
          Add a row
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-ink-2">
        From a starting point, give each leg&apos;s whole-circle bearing from grid north (45 30 00, 45°30&apos;00&quot;, 45.5 or N 45 30 00 E) and its horizontal distance in metres, as in your field book. A leg that ends on a known point checks the closure. Enter on a leg&apos;s last cell starts the next leg from its end.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Starting point</span>
          <input value={start.pointId} disabled={disabled} list="survey-known-points" onChange={(e) => pushLegs({ ...start, pointId: e.target.value.slice(0, 32) }, legs)} placeholder="9001" className={inputClasses("font-mono")} />
          <datalist id="survey-known-points">
            {knownIds.slice(0, 500).map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        </label>
        {knownIds.includes(start.pointId.trim()) ? (
          <p className="self-end text-sm text-ink-2 sm:col-span-2">Point {start.pointId.trim()} is already in the project: the legs start from its coordinates.</p>
        ) : (
          <>
            <label className="grid gap-1.5">
              <span className={LABEL_CLASSES}>Its northing</span>
              <input value={start.n} disabled={disabled} inputMode="decimal" onChange={(e) => pushLegs({ ...start, n: e.target.value.slice(0, 20) }, legs)} className={inputClasses("font-mono")} />
            </label>
            <label className="grid gap-1.5">
              <span className={LABEL_CLASSES}>Its easting</span>
              <input value={start.e} disabled={disabled} inputMode="decimal" onChange={(e) => pushLegs({ ...start, e: e.target.value.slice(0, 20) }, legs)} className={inputClasses("font-mono")} />
            </label>
          </>
        )}
      </div>
      <div className="overflow-x-auto rounded-md ring-1 ring-line">
        <table className={TABLE}>
          <thead className={HEAD}>
            <tr>
              {["From", "To", "Bearing", "Distance (m)", "Code"].map((h) => (
                <th key={h} scope="col" className="p-2 font-medium">
                  {h}
                </th>
              ))}
              <th scope="col" className="p-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody className={BODY}>
            {legs.map((l, i) => (
              <tr key={i} className={ROW}>
                {(["from", "to", "bearing", "distance", "code"] as const).map((k) => (
                  <td key={k} data-label={{ from: "From", to: "To", bearing: "Bearing", distance: "Distance (m)", code: "Code" }[k]} className={`${CELL} ${AREA[k]}`}>
                    <input
                      aria-label={`${{ from: "From", to: "To", bearing: "Bearing", distance: "Distance", code: "Code" }[k]}, leg ${i + 1}`}
                      value={l[k]}
                      disabled={disabled}
                      placeholder={k === "from" ? (i === 0 ? start.pointId : legs[i - 1]!.to) : undefined}
                      inputMode={k === "distance" ? "decimal" : "text"}
                      onChange={(e) => pushLegs(start, legs.map((x, j) => (j === i ? { ...x, [k]: e.target.value.slice(0, 64) } : x)))}
                      onKeyDown={k === "code" ? enterAdds(() => addLeg(i)) : undefined}
                      className={inputClasses(cell)}
                    />
                  </td>
                ))}
                <td className={REMOVE}>
                  <button type="button" aria-label={`Remove leg ${i + 1}`} disabled={disabled || legs.length <= 1} onClick={() => pushLegs(start, legs.filter((_, j) => j !== i))} className={buttonClasses("ghost", "icon")}>
                    <TrashIcon size={16} weight="bold" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" disabled={disabled || legs.length >= 2000} onClick={() => addLeg(legs.length - 1)} className={buttonClasses("secondary", "sm", "w-fit")}>
        <PlusIcon size={16} weight="bold" aria-hidden />
        Add a leg
      </button>
    </div>
  );
}
