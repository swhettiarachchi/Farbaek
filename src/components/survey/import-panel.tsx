"use client";

import { CheckCircleIcon, FileArrowUpIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useMemo, useState, useTransition } from "react";
import { isBoundaryMark, outlineFrom } from "@/core/survey/autodraft";
import { codeOf, lookupCode, type CodeEntry } from "@/core/survey/codes";
import { crsById } from "@/core/survey/crs";
import { suggestFeatures } from "@/core/survey/fieldToFinish";
import { suggestColumns, type ColumnGuess } from "@/core/survey/import/columns";
import { COLUMN_ORDERS, IMPORT_LIMITS, parseDelimited, previewDelimited, type ColumnOrder, type ColumnRole, type Delimiter, type ImportedPoint, type ImportIssue } from "@/core/survey/import/delimited";
import { detectFormat, type ImportFormat } from "@/core/survey/import/detect";
import { parseGeoJsonPoints } from "@/core/survey/import/geojson";
import type { SurveyPoint } from "@/core/survey/parcel";
import { importSurveyPointsAction, type SurveyFormState } from "@/app/app/survey/actions";
import { DrawnSummary } from "@/components/survey/draw-from-points";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses, textareaClasses } from "@/components/ui/field";

const ROLE_LABELS: Record<ColumnRole, string> = { point: "Point number", easting: "Easting", northing: "Northing", elevation: "Elevation", code: "Code or description", ignore: "Leave out" };
const DELIMITERS: { id: Delimiter; label: string }[] = [
  { id: ",", label: "Commas" },
  { id: "\t", label: "Tabs" },
  { id: ";", label: "Semicolons" },
  { id: "whitespace", label: "Spaces" },
];

/** The imported rows as survey points for the preview: ids from their line numbers, never saved. */
const asPoints = (pts: readonly ImportedPoint[]): SurveyPoint[] => pts.map((p) => ({ id: `line-${p.line}`, pointId: p.pointId, e: p.e, n: p.n, z: p.z, code: p.code }));

/**
 * The Import step (stage 194): drop the file the instrument exported, or paste rows from a spreadsheet. Farbaek reads the columns
 * itself and says why, shows the points on a small map with the lot it would draw, and, once the surveyor confirms the units and the
 * grid, imports the points and draws the plan from them in one go.
 */
export function ImportPanel({ projectId, crsId, crsEpsg, crsName, codes, planHasLots, readOnly }: { projectId: string; crsId: string; crsEpsg: number | null; crsName: string; codes: CodeEntry[]; planHasLots: boolean; readOnly: string | null }) {
  const crs = crsById(crsId) ?? null;
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [format, setFormat] = useState<ImportFormat>("delimited");
  const [delimiter, setDelimiter] = useState<Delimiter>(",");
  const [hasHeader, setHasHeader] = useState(false);
  const [columns, setColumns] = useState<ColumnRole[]>([...COLUMN_ORDERS.PNEZD]);
  const [guess, setGuess] = useState<ColumnGuess | null>(null);
  const [confirmUnits, setConfirmUnits] = useState(false);
  const [drawPlan, setDrawPlan] = useState(true);
  const [result, setResult] = useState<SurveyFormState & { issues?: ImportIssue[] }>({ status: "idle" });
  const [pending, start] = useTransition();

  const load = (name: string, content: string) => {
    setFileName(name);
    setText(content);
    setResult({ status: "idle" });
    setConfirmUnits(false);
    const f = detectFormat(name, content);
    setFormat(f);
    if (f === "delimited") {
      const p = previewDelimited(content, 300);
      if (!("error" in p)) {
        setDelimiter(p.delimiter);
        setHasHeader(p.hasHeader);
        // Farbaek reads the columns itself; the surveyor can change any of them below.
        const g = suggestColumns(p, crs);
        setGuess(g);
        setColumns(g.columns.length >= 3 ? g.columns : [...COLUMN_ORDERS.PNEZD]);
      }
    } else setGuess(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > IMPORT_LIMITS.maxBytes) {
      setResult({ status: "error", message: `That file is over ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB. Import only the points this plan needs.` });
      return;
    }
    load(file.name, await file.text());
  };

  const preview = useMemo(() => {
    if (!text) return null;
    if (format === "geojson") {
      const r = parseGeoJsonPoints(text, crsEpsg);
      return { rows: r.points.slice(0, 8).map((p) => [p.pointId, String(p.e), String(p.n), p.z === null ? "" : String(p.z), p.code ?? ""]), header: ["Point", "Easting", "Northing", "Elevation", "Code"], parsed: r };
    }
    const p = previewDelimited(text);
    if ("error" in p) return { rows: [], header: [], parsed: { points: [] as ImportedPoint[], issues: [p.error] } };
    const parsed = parseDelimited(text, { delimiter, hasHeader, columns });
    return { rows: p.rows.slice(0, 8), header: p.header, parsed };
  }, [text, format, delimiter, hasHeader, columns, crsEpsg]);

  const points = useMemo(() => asPoints(preview?.parsed.points ?? []), [preview]);
  // What the plan would look like: the lot through the boundary marks, and the lines from the codes, by the same rules as the draft.
  const drawing = useMemo(() => {
    if (points.length === 0) return null;
    const marks = points.filter((p) => isBoundaryMark(lookupCode(codes, codeOf(p.code))));
    return { marks, outline: outlineFrom(marks), lines: suggestFeatures(points, codes) };
  }, [points, codes]);
  const codeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of points) {
      const c = codeOf(p.code);
      if (c) m.set(c, (m.get(c) ?? 0) + 1);
    }
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [points]);

  const errors = preview?.parsed.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = preview?.parsed.issues.filter((i) => i.severity === "warning") ?? [];
  const count = preview?.parsed.points.length ?? 0;
  const columnCount = Math.max(columns.length, ...(preview?.rows.map((r) => r.length) ?? [0]));
  const latLong = guess?.latLong ?? false;
  const willDraw = drawPlan && !planHasLots;

  const submit = () =>
    start(async () => {
      const r = await importSurveyPointsAction({ projectId, fileName: fileName || "pasted-points.txt", content: text, format, delimiter, hasHeader, columns, units: "metre", crsId, drawPlan: willDraw });
      setResult(r);
      if (r.status === "done") {
        setText("");
        setFileName("");
        setGuess(null);
        setConfirmUnits(false);
      }
    });

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-canvas-2 p-5 text-center text-sm text-ink-2 has-focus-visible:outline-2 has-focus-visible:outline-accent">
          <FileArrowUpIcon size={24} aria-hidden className="text-ink-3" />
          <span>
            <span className="font-medium text-ink">Choose the file from your instrument</span>
            <br />
            CSV, TXT, DAT or GeoJSON, up to {IMPORT_LIMITS.maxBytes / 1024 / 1024} MB
          </span>
          <input type="file" accept=".csv,.txt,.dat,.pnezd,.penzd,.xyz,.asc,.geojson,.json,text/csv,text/plain,application/geo+json,application/json" className="sr-only" disabled={Boolean(readOnly)} onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Or paste rows from a spreadsheet or file</span>
          <textarea value={text} rows={5} disabled={Boolean(readOnly)} spellCheck={false} placeholder={"1,700004.210,450012.345,21.43,CP\n2,700007.884,450043.912,21.88,CP"} onChange={(e) => load(fileName || "pasted-points.txt", e.target.value)} className={textareaClasses("font-mono text-sm")} />
        </label>
      </div>

      {preview ? (
        <div className="grid gap-5">
          {latLong ? (
            <p role="alert" className="flex items-start gap-2 rounded-sm bg-canvas-2 p-3 text-sm text-ink ring-1 ring-line">
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
              These look like latitude and longitude, not grid coordinates in metres. Export the points in {crsName} from the controller (most can project on export), then import that file.
            </p>
          ) : null}

          {format === "delimited" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1.5">
                <span className={LABEL_CLASSES}>Separated by</span>
                <select value={delimiter} onChange={(e) => setDelimiter(e.target.value as Delimiter)} className={inputClasses()}>
                  {DELIMITERS.map((d) => (
                    <option key={d.label} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className={LABEL_CLASSES}>Column order</span>
                <select value="" onChange={(e) => e.target.value && setColumns([...COLUMN_ORDERS[e.target.value as ColumnOrder]])} className={inputClasses()}>
                  <option value="">Choose a preset…</option>
                  {(Object.keys(COLUMN_ORDERS) as ColumnOrder[]).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-3 self-end text-sm text-ink">
                <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
                The first row is column names
              </label>
            </div>
          ) : null}

          {guess && (guess.reasons.length > 0 || guess.unsure.length > 0) ? (
            <div className="grid gap-1.5 text-sm">
              <h3 className="font-medium text-ink">How Farbaek read the columns</h3>
              <ul className="grid gap-1">
                {guess.reasons.map((r) => (
                  <li key={r} className="flex items-start gap-2 text-ink-2">
                    <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
                    {r}
                  </li>
                ))}
                {guess.unsure.map((r) => (
                  <li key={r} className="flex items-start gap-2 text-ink">
                    <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="overflow-x-auto rounded-md ring-1 ring-line">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="bg-canvas-2">
                  <tr>
                    {Array.from({ length: format === "geojson" ? 5 : columnCount }, (_, i) => (
                      <th key={i} scope="col" className="p-2 align-bottom font-medium text-ink-2">
                        {format === "geojson" ? (
                          preview.header?.[i]
                        ) : (
                          <label className="grid gap-1">
                            <span className="text-xs text-ink-3">{preview.header?.[i] ?? `Column ${i + 1}`}</span>
                            <select value={columns[i] ?? "ignore"} onChange={(e) => setColumns((c) => Object.assign([...c, ...Array<ColumnRole>(Math.max(0, i + 1 - c.length)).fill("ignore")], { [i]: e.target.value as ColumnRole }))} className={inputClasses("min-h-11 text-sm")}>
                              {(Object.keys(ROLE_LABELS) as ColumnRole[]).map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-t border-line">
                      {Array.from({ length: format === "geojson" ? 5 : columnCount }, (_, j) => (
                        <td key={j} className="p-2 font-mono text-ink tabular">
                          {row[j] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {points.length > 0 && !latLong ? <PointsMap points={points} outline={drawing?.outline?.ring ?? null} lines={drawing?.lines.map((l) => ({ closed: l.closed, ids: l.points })) ?? []} marks={new Set(drawing?.marks.map((m) => m.id))} /> : null}
          </div>

          <div className="grid gap-1 text-sm text-ink-2">
            <p>
              {count} {count === 1 ? "point" : "points"} read{errors.length ? `, ${errors.length} ${errors.length === 1 ? "row" : "rows"} can't be read` : ""}
              {warnings.length ? `, ${warnings.length} exact ${warnings.length === 1 ? "repeat" : "repeats"} kept once` : ""}.
              {drawing ? ` ${drawing.marks.length} boundary ${drawing.marks.length === 1 ? "mark" : "marks"}, ${drawing.lines.length} ${drawing.lines.length === 1 ? "line" : "lines"} from the codes.` : ""}
            </p>
            {codeCounts.length > 0 ? (
              <p>
                Codes:{" "}
                {codeCounts.slice(0, 12).map(([c, n], i) => {
                  const entry = lookupCode(codes, c);
                  return (
                    <span key={c}>
                      {i > 0 ? ", " : ""}
                      <span className={entry ? "text-ink" : "text-caution"}>{c}</span> {entry ? entry.meaning.toLowerCase() : "not in your code list"} ({n})
                    </span>
                  );
                })}
                {codeCounts.length > 12 ? `, and ${codeCounts.length - 12} more` : ""}.
              </p>
            ) : null}
          </div>
          {errors.length > 0 ? (
            <ul className="grid max-h-48 gap-1 overflow-y-auto rounded-md bg-surface p-3 text-sm ring-1 ring-line">
              {errors.slice(0, 50).map((x, i) => (
                <li key={i} className="flex gap-2 text-ink">
                  <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
                  {x.message}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="grid gap-2">
            <label className="flex min-h-11 items-start gap-3 rounded-sm border border-line bg-canvas-2 p-3 text-sm text-ink">
              <input type="checkbox" checked={confirmUnits} onChange={(e) => setConfirmUnits(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
              <span>These coordinates are in metres, in {crsName}, and the columns are read right. Farbaek stores them exactly as written and never converts, moves or rounds them.</span>
            </label>
            {planHasLots ? (
              <p className="text-sm text-ink-3">The plan already has lots, so these points are added to the point list for you to use on the Lots step.</p>
            ) : (
              <label className="flex min-h-11 items-start gap-3 p-3 text-sm text-ink">
                <input type="checkbox" checked={drawPlan} onChange={(e) => setDrawPlan(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
                <span>Draw the plan from these points: the lot through the boundary marks, the lines and buildings from their codes, and the road. Everything drawn waits for your check before approval.</span>
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={submit} disabled={Boolean(readOnly) || pending || count === 0 || errors.length > 0 || !confirmUnits || latLong} className={buttonClasses("primary", "md")}>
              {pending ? "Importing…" : `Import ${count} ${count === 1 ? "point" : "points"}${willDraw ? " and draw the plan" : ""}`}
            </button>
            {readOnly ? <span className="text-sm text-ink-3">{readOnly}</span> : errors.length > 0 ? <span className="text-sm text-ink-3">Fix the rows that can&apos;t be read first: nothing half-imports.</span> : null}
          </div>
        </div>
      ) : null}

      {result.status === "error" ? (
        <div role="alert" className="grid gap-2 text-sm">
          <p className="flex items-start gap-2 text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            {result.message}
          </p>
          {result.issues?.length ? (
            <ul className="grid gap-1 pl-6 text-ink-2">
              {result.issues.slice(0, 10).map((x, i) => (
                <li key={i}>{x.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {result.status === "done" ? (
        <div role="status" className="grid gap-3 rounded-md bg-surface p-4 ring-1 ring-line">
          <p className="flex items-start gap-2 text-sm font-medium text-ink">
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            {result.message}
          </p>
          {result.drawn || result.notDrawn ? <DrawnSummary drawn={result.drawn ?? []} notDrawn={result.notDrawn ?? []} /> : null}
          <div className="flex flex-wrap gap-2">
            <a href={`/app/survey/${projectId}?step=${result.version ? "plan" : "points"}`} className={buttonClasses("primary", "md", "w-fit")}>
              {result.version ? "Check the plan" : "See the points"}
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The points on a small map, north up: boundary marks larger, the lot that would be drawn dashed, and the lines from the codes. */
function PointsMap({ points, outline, lines, marks }: { points: SurveyPoint[]; outline: SurveyPoint[] | null; lines: { closed: boolean; ids: string[] }[]; marks: Set<string> }) {
  const es = points.map((p) => p.e);
  const ns = points.map((p) => p.n);
  const [minE, maxE, minN, maxN] = [Math.min(...es), Math.max(...es), Math.min(...ns), Math.max(...ns)];
  const w = Math.max(maxE - minE, 1);
  const h = Math.max(maxN - minN, 1);
  const pad = Math.max(w, h) * 0.08;
  const x = (e: number) => e - minE + pad;
  const y = (n: number) => maxN - n + pad;
  const s = Math.max(w, h) / 120;
  const byId = new Map(points.map((p) => [p.id, p]));
  const path = (ids: readonly string[], closed: boolean) => ids.map((id, i) => `${i ? "L" : "M"}${x(byId.get(id)!.e)},${y(byId.get(id)!.n)}`).join(" ") + (closed ? " Z" : "");
  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 ${w + 2 * pad} ${h + 2 * pad}`} role="img" aria-label={outline ? `The ${points.length} points, with the lot Farbaek would draw through ${outline.length} boundary marks` : `The ${points.length} points`} className="h-auto max-h-80 w-full rounded-md bg-surface ring-1 ring-line">
        {lines.map((l, i) => (
          <path key={i} d={path(l.ids, l.closed)} fill="none" stroke="var(--color-ink-3)" strokeWidth={s * 0.8} />
        ))}
        {outline ? <path d={path(outline.map((p) => p.id), true)} fill="color-mix(in oklab, var(--color-accent) 8%, transparent)" stroke="var(--color-accent)" strokeWidth={s * 1.2} strokeDasharray={`${s * 4} ${s * 2.5}`} /> : null}
        {points.map((p) => (
          <circle key={p.id} cx={x(p.e)} cy={y(p.n)} r={marks.has(p.id) ? s * 2 : s * 1.1} fill={marks.has(p.id) ? "var(--color-ink)" : "var(--color-ink-3)"} />
        ))}
      </svg>
      <figcaption className="text-sm text-ink-3">{outline ? "The dashed outline is the lot Farbaek would draw. Check it after the import." : "No lot outline yet: the boundary marks don't make one, so you'll give the lot's corners after the import."}</figcaption>
    </figure>
  );
}
