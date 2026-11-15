"use client";

import { CheckCircleIcon, FileArrowUpIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { COLUMN_ORDERS, IMPORT_LIMITS, parseDelimited, previewDelimited, type ColumnOrder, type ColumnRole, type Delimiter, type ImportIssue } from "@/core/survey/import/delimited";
import { detectFormat, type ImportFormat } from "@/core/survey/import/detect";
import { parseGeoJsonPoints } from "@/core/survey/import/geojson";
import { importSurveyPointsAction } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses, textareaClasses } from "@/components/ui/field";

const ROLE_LABELS: Record<ColumnRole, string> = { point: "Point number", easting: "Easting", northing: "Northing", elevation: "Elevation", code: "Code or description", ignore: "Leave out" };
const DELIMITERS: { id: Delimiter; label: string }[] = [
  { id: ",", label: "Commas" },
  { id: "\t", label: "Tabs" },
  { id: ";", label: "Semicolons" },
  { id: "whitespace", label: "Spaces" },
];

export function ImportPanel({ projectId, crsId, crsEpsg, crsName, readOnly }: { projectId: string; crsId: string; crsEpsg: number | null; crsName: string; readOnly: string | null }) {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [format, setFormat] = useState<ImportFormat>("delimited");
  const [delimiter, setDelimiter] = useState<Delimiter>(",");
  const [hasHeader, setHasHeader] = useState(false);
  const [columns, setColumns] = useState<ColumnRole[]>([...COLUMN_ORDERS.PNEZD]);
  const [confirmUnits, setConfirmUnits] = useState(false);
  const [result, setResult] = useState<{ tone: "done" | "error"; text: string; issues?: ImportIssue[] } | null>(null);
  const [pending, start] = useTransition();

  const load = (name: string, content: string) => {
    setFileName(name);
    setText(content);
    setResult(null);
    const f = detectFormat(name, content);
    setFormat(f);
    if (f === "delimited") {
      const p = previewDelimited(content);
      if (!("error" in p)) {
        setDelimiter(p.delimiter);
        setHasHeader(p.hasHeader);
        setColumns((cur) => (cur.length >= p.columnCount ? cur.slice(0, Math.max(p.columnCount, 3)) : [...cur, ...Array<ColumnRole>(p.columnCount - cur.length).fill("ignore")]));
      }
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > IMPORT_LIMITS.maxBytes) {
      setResult({ tone: "error", text: `That file is over ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB. Import only the points this plan needs.` });
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
    if ("error" in p) return { rows: [], header: [], parsed: { points: [], issues: [p.error] } };
    const parsed = parseDelimited(text, { delimiter, hasHeader, columns });
    return { rows: p.rows.slice(0, 8), header: p.header, parsed };
  }, [text, format, delimiter, hasHeader, columns, crsEpsg]);

  const errors = preview?.parsed.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = preview?.parsed.issues.filter((i) => i.severity === "warning") ?? [];
  const count = preview?.parsed.points.length ?? 0;
  const columnCount = Math.max(columns.length, ...(preview?.rows.map((r) => r.length) ?? [0]));

  const submit = () =>
    start(async () => {
      const r = await importSurveyPointsAction({ projectId, fileName: fileName || "pasted-points.txt", content: text, format, delimiter, hasHeader, columns, units: "metre", crsId });
      if (r.status === "done") {
        setResult({ tone: "done", text: r.message });
        setText("");
        setFileName("");
        setConfirmUnits(false);
        router.refresh();
      } else if (r.status === "error") setResult({ tone: "error", text: r.message, issues: r.issues });
    });

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-canvas-2 p-5 text-center text-sm text-ink-2 has-focus-visible:outline-2 has-focus-visible:outline-accent">
          <FileArrowUpIcon size={24} aria-hidden className="text-ink-3" />
          <span>
            <span className="font-medium text-ink">Choose a point file</span>
            <br />
            CSV, TXT or GeoJSON, up to {IMPORT_LIMITS.maxBytes / 1024 / 1024} MB
          </span>
          <input type="file" accept=".csv,.txt,.pnezd,.penzd,.xyz,.asc,.geojson,.json,text/csv,text/plain,application/geo+json,application/json" className="sr-only" disabled={Boolean(readOnly)} onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Or paste the points</span>
          <textarea value={text} rows={5} disabled={Boolean(readOnly)} spellCheck={false} placeholder={"1,600004.210,500012.345,21.43,CP\n2,600007.884,500043.912,21.88,CP"} onChange={(e) => load(fileName || "pasted-points.txt", e.target.value)} className={textareaClasses("font-mono text-sm")} />
        </label>
      </div>

      {preview ? (
        <div className="grid gap-4">
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

          <p className="text-sm text-ink-2">
            {count} {count === 1 ? "point" : "points"} read{errors.length ? `, ${errors.length} ${errors.length === 1 ? "row" : "rows"} can't be read` : ""}
            {warnings.length ? `, ${warnings.length} exact ${warnings.length === 1 ? "repeat" : "repeats"} kept once` : ""}.
          </p>
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

          <label className="flex min-h-11 items-start gap-3 rounded-sm border border-line bg-canvas-2 p-3 text-sm text-ink">
            <input type="checkbox" checked={confirmUnits} onChange={(e) => setConfirmUnits(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
            <span>
              These coordinates are in metres, in {crsName}. Farbaek stores them exactly as written and never converts, moves or rounds them.
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={submit} disabled={Boolean(readOnly) || pending || count === 0 || errors.length > 0 || !confirmUnits} className={buttonClasses("primary", "md")}>
              {pending ? "Importing…" : `Import ${count} ${count === 1 ? "point" : "points"}`}
            </button>
            {readOnly ? <span className="text-sm text-ink-3">{readOnly}</span> : errors.length > 0 ? <span className="text-sm text-ink-3">Fix the rows that can&apos;t be read first: nothing half-imports.</span> : null}
          </div>
        </div>
      ) : null}

      {result ? (
        <div role={result.tone === "error" ? "alert" : "status"} className="grid gap-2 text-sm">
          <p className={`flex items-start gap-2 ${result.tone === "error" ? "text-failed" : "text-ink"}`}>
            {result.tone === "error" ? <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> : <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />}
            {result.text}
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
    </div>
  );
}
