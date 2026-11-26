"use client";

import { CheckCircleIcon, FileArrowUpIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useMemo, useState, useTransition } from "react";
import { isBoundaryMark, isRoadEdgeCode, outlineFrom, roadEdges } from "@/core/survey/autodraft";
import { codeBase, codeOf, dsrCodes, dsrCodesIn, entryFor, type CodeEntry } from "@/core/survey/codes";
import { crsById } from "@/core/survey/crs";
import { suggestFeatures } from "@/core/survey/fieldToFinish";
import { suggestColumns, type ColumnGuess } from "@/core/survey/import/columns";
import { COLUMN_ORDERS, IMPORT_LIMITS, parseDelimited, previewDelimited, type ColumnOrder, type ColumnRole, type Delimiter, type ImportedPoint, type ImportIssue } from "@/core/survey/import/delimited";
import { IMPORT_FORMATS, detectFormat, printoutSource, unreadableFile, type ImportFormat } from "@/core/survey/import/detect";
import { readPoints } from "@/core/survey/import/read";
import { ADJUST_NAMES, type AdjustMethod } from "@/core/survey/adjust";
import { GRAMMAR, type GrammarId } from "@/core/survey/grammar";
import type { SurveyPoint } from "@/core/survey/parcel";
import { importSurveyPointsAction, type SurveyFormState } from "@/app/app/survey/actions";
import { DrawnSummary } from "@/components/survey/draw-from-points";
import { ManualEntry } from "@/components/survey/manual-entry";
import { useHandoff } from "@/components/survey/assistant/handoff";
import { StatusBadge } from "@/components/ui/status-badge";
import { PointsTable } from "@/components/survey/points-table";
import { TraverseChoice } from "@/components/survey/traverse-choice";
import { buttonClasses } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { LABEL_CLASSES, inputClasses, textareaClasses } from "@/components/ui/field";

const ROLE_LABELS: Record<ColumnRole, string> = { point: "Point number", easting: "Easting", northing: "Northing", elevation: "Elevation", code: "Code or description", ignore: "Leave out" };
const DELIMITERS: { id: Delimiter; label: string }[] = [
  { id: ",", label: "Commas" },
  { id: "\t", label: "Tabs" },
  { id: ";", label: "Semicolons" },
  { id: "whitespace", label: "Spaces" },
];

/** A coordinate as read, to the millimetre at least: 450000 shows as 450000.000, 450012.3456 keeps its tenth of a millimetre. */
const metres = (v: number) => v.toFixed(Math.min(4, Math.max(3, String(v).split(".")[1]?.length ?? 0)));

/** The first line with anything on it: when it changes, the pasted text is another file, not an edit of this one. */
const firstLine = (t: string) => t.split(/\r\n|\r|\n/, 50).find((l) => l.trim() !== "")?.trim() ?? "";

/** The imported rows as survey points for the preview: ids by their place in the file (an XML file can hold every point on one line), never saved. */
const asPoints = (pts: readonly ImportedPoint[]): SurveyPoint[] => pts.map((p, i) => ({ id: `row-${i}`, pointId: p.pointId, e: p.e, n: p.n, z: p.z, code: p.code }));

/**
 * The Import step (stage 194): drop the file the instrument exported, or paste rows from a spreadsheet. Farbaek reads the columns
 * itself and says why, shows the points on a small map with the lot it would draw, and, once the surveyor confirms the units and the
 * grid, imports the points and draws the plan from them in one go.
 */
export function ImportPanel({
  projectId,
  crsId,
  crsName,
  codes,
  grammar = "farbaek",
  planHasLots,
  known,
  readOnly,
}: {
  projectId: string;
  crsId: string;
  crsName: string;
  codes: CodeEntry[];
  /** How the plan reads line codes (ADR 0243), so the preview draws lines as the draft will. */
  grammar?: GrammarId;
  planHasLots: boolean;
  /** The project's points, which typed legs may start from or close on. */
  known: { pointId: string; e: number; n: number }[];
  readOnly: string | null;
}) {
  const crs = crsById(crsId) ?? null;
  const [entry, setEntry] = useState<"file" | "coordinates" | "bearings">("file");
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [format, setFormat] = useState<ImportFormat>("delimited");
  // True once the surveyor picks the format: typing then never changes it back.
  const [formatChosen, setFormatChosen] = useState(false);
  const [delimiter, setDelimiter] = useState<Delimiter>(",");
  const [hasHeader, setHasHeader] = useState(false);
  const [columns, setColumns] = useState<ColumnRole[]>([...COLUMN_ORDERS.PNEZD]);
  const [guess, setGuess] = useState<ColumnGuess | null>(null);
  const [confirmUnits, setConfirmUnits] = useState(false);
  const [drawPlan, setDrawPlan] = useState(true);
  const [useDsr, setUseDsr] = useState<boolean | null>(null);
  const [encoding, setEncoding] = useState<string | null>(null);
  // The rule chosen for a traverse that closes (ADR 0241): none until the surveyor picks one, and cleared with a new file.
  const [adjust, setAdjust] = useState<AdjustMethod | null>(null);
  // The rule counts only while the file is read as a Sokkia SDR job: another format, a typed table or the assistant's rows never carry it.
  const rule = format === "sdr" ? adjust : null;
  const [result, setResult] = useState<SurveyFormState & { issues?: ImportIssue[] }>({ status: "idle" });
  const [pending, start] = useTransition();
  // Rows the drafting assistant read from what was said (stage 195): shown in the typed table for checking, never imported unseen.
  const { handoff, clear: clearHandoff } = useHandoff(projectId);
  const handed = handoff?.kind === "entry" ? handoff.op : null;
  const shownEntry = handed ? (handed.mode === "bearings" ? "bearings" : "coordinates") : entry;

  // Farbaek reads the columns itself; the surveyor can change any of them below.
  const guessColumns = (content: string) => {
    const p = previewDelimited(content, 300);
    if ("error" in p) return;
    setDelimiter(p.delimiter);
    setHasHeader(p.hasHeader);
    const g = suggestColumns(p, crs);
    setGuess(g);
    setColumns(g.columns.length >= 3 ? g.columns : [...COLUMN_ORDERS.PNEZD]);
  };

  /**
   * A new file (`fresh`) starts over: the format and columns are read again and the confirmation is cleared. Typing into the box or
   * the entry tables keeps the surveyor's choices, and the columns are read again only when the text was empty or the format changes.
   */
  const load = (name: string, content: string, fresh = true) => {
    const wasEmpty = text.trim() === "";
    setFileName(name);
    setText(content);
    setResult({ status: "idle" });
    if (fresh) {
      setConfirmUnits(false);
      setUseDsr(null);
      setEncoding(null);
      setFormatChosen(false);
      setAdjust(null);
    }
    const f = !fresh && formatChosen ? format : detectFormat(name || "pasted-points.txt", content);
    const changed = f !== format;
    setFormat(f);
    if (f !== "delimited") setGuess(null);
    else if (fresh || wasEmpty || changed) guessColumns(content);
    if (changed && !fresh) setConfirmUnits(false);
  };

  const chooseFormat = (f: ImportFormat) => {
    setFormat(f);
    setFormatChosen(true);
    setConfirmUnits(false);
    setAdjust(null);
    if (f === "delimited") guessColumns(text);
    else setGuess(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > IMPORT_LIMITS.maxBytes) {
      setResult({ status: "error", message: `That file is over ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB. Import only the points this plan needs.` });
      return;
    }
    // UTF-8 first, strictly; a file that isn't (CASS files are often written in the Chinese GBK code page) is read as GB18030 and said.
    const bytes = await file.arrayBuffer();
    let content: string;
    let decoded: string | null = null;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      content = new TextDecoder("gb18030").decode(bytes);
      decoded = "The file isn't UTF-8 text, so it was read as Chinese GB18030 text, the way CASS often writes it. Check that the codes read right before importing.";
    }
    load(file.name, content, true);
    setEncoding(decoded);
  };

  const unreadable = text ? unreadableFile(fileName, text) : null;
  // A printout names the job file it came from (stage 198): its path is shown to copy.
  const sourcePath = unreadable ? (printoutSource(text)?.path ?? null) : null;
  const preview = useMemo(() => {
    if (!text || unreadable) return null;
    if (format !== "delimited") {
      // Formats that say what each value is (GeoJSON, GSI): no columns to map, the points as read.
      const r = readPoints(format, text, { delimiter, hasHeader, columns, crs, known, adjust: rule });
      return { rows: r.points.slice(0, 8).map((p) => [p.pointId, metres(p.e), metres(p.n), p.z === null ? "" : metres(p.z), p.code ?? ""]), header: ["Point", "Easting", "Northing", "Elevation", "Code"], parsed: r, closure: r.reduction?.traverse ?? null };
    }
    const p = previewDelimited(text);
    if ("error" in p) return { rows: [], header: [], parsed: { points: [] as ImportedPoint[], issues: [p.error] }, closure: null };
    const parsed = parseDelimited(text, { delimiter, hasHeader, columns });
    return { rows: p.rows.slice(0, 8), header: p.header, parsed, closure: null };
  }, [text, unreadable, format, delimiter, hasHeader, columns, crs, known, rule]);

  const points = useMemo(() => asPoints(preview?.parsed.points ?? []), [preview]);
  // A file written in the Survey Department's codes (DSR Chapter XXII): offer its list for drawing this plan.
  const dsrSeen = useMemo(() => dsrCodesIn(points.map((p) => codeBase(codeOf(p.code))).filter(Boolean), codes), [points, codes]);
  const dsrOffered = !planHasLots && dsrSeen.length >= 2;
  const dsrOn = dsrOffered && (useDsr ?? true);
  const library = useMemo(() => (dsrOn ? dsrCodes() : codes), [dsrOn, codes]);
  // What the plan would look like: the lot through the boundary marks, and the lines from the codes, by the same rules as the draft.
  const drawing = useMemo(() => {
    if (points.length === 0) return null;
    const marks = points.filter((p) => isBoundaryMark(entryFor(library, p.code)));
    const road = roadEdges(points);
    return { marks, outline: outlineFrom(marks), lines: suggestFeatures(points, library, GRAMMAR[grammar]), road };
  }, [points, library, grammar]);
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
  const repeats = warnings.filter((w) => w.code === "DUPLICATE_POINT_SAME" && w.line !== null).length;
  // Everything else a reader wants the surveyor to know: a field book's closure, records left out, a display setting.
  const notes = warnings.filter((w) => !(w.code === "DUPLICATE_POINT_SAME" && w.line !== null));
  const count = preview?.parsed.points.length ?? 0;
  const closure = preview?.closure ?? null;
  const columnCount = Math.max(columns.length, ...(preview?.rows.map((r) => r.length) ?? [0]));
  const latLong = guess?.latLong ?? false;
  const willDraw = drawPlan && !planHasLots;

  const submit = () =>
    start(async () => {
      const r = await importSurveyPointsAction({ projectId, fileName: fileName || "pasted-points.txt", content: text, format, delimiter, hasHeader, columns, units: "metre", crsId, drawPlan: willDraw, codeList: dsrOn ? "dsr" : "project", adjust: rule });
      setResult(r);
      if (r.status === "done") {
        clearHandoff();
        setText("");
        setFileName("");
        setGuess(null);
        setConfirmUnits(false);
        setAdjust(null);
      }
    });

  // Another way in starts over: nothing chosen or confirmed for one carries to the next.
  const chooseEntry = (next: typeof entry) => {
    clearHandoff();
    setEntry(next);
    setText("");
    setFileName("");
    setGuess(null);
    setResult({ status: "idle" });
    setFormat("delimited");
    setFormatChosen(false);
    setConfirmUnits(false);
    setEncoding(null);
    setUseDsr(null);
    setAdjust(null);
  };

  return (
    <div className="grid gap-5">
      <div role="group" aria-label="How the points come in" className="grid grid-cols-3 gap-1 rounded-full bg-canvas-2 p-1 ring-1 ring-line max-[18em]:grid-cols-1 max-[18em]:rounded-md sm:inline-flex sm:w-fit">
        {(
          [
            ["file", "Upload or paste", "A file"],
            ["coordinates", "Type coordinates", "Coordinates"],
            ["bearings", "Bearings and distances", "Bearings"],
          ] as const
        ).map(([id, label, short]) => (
          <button key={id} type="button" aria-pressed={shownEntry === id} onClick={() => chooseEntry(id)} className={`tap inline-flex min-h-10 items-center justify-center rounded-full px-2 text-label font-medium transition-colors duration-150 sm:px-4 sm:text-sm ${shownEntry === id ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}>
            <span className="sm:hidden">{short}</span>
            <span className="max-sm:hidden">{label}</span>
          </button>
        ))}
      </div>
      {handed ? (
        <div className="flex flex-wrap items-start gap-3 rounded-sm bg-canvas-2 p-3 ring-1 ring-line">
          <StatusBadge status="approval" label="From the assistant" />
          <p className="min-w-0 flex-1 text-sm text-ink-2">
            {handed.rows.length} {handed.rows.length === 1 ? "row" : "rows"} read from what you said. Check every value against your field book, then confirm the units and grid and import, as for anything typed.
          </p>
          {/* Starts the same table afresh: the dictated rows go, from the table and from what would be imported. */}
          <button type="button" onClick={() => chooseEntry(shownEntry)} className={buttonClasses("ghost", "sm")}>
            Clear them
          </button>
        </div>
      ) : null}
      {shownEntry !== "file" ? (
        <ManualEntry
          key={handed ? "assistant" : shownEntry}
          mode={shownEntry}
          onText={(name, t) => load(name, t, false)}
          knownIds={known.map((p) => p.pointId)}
          disabled={Boolean(readOnly)}
          initialCoords={handed?.mode === "coordinates" ? handed.rows : undefined}
          initialLegs={handed?.mode === "bearings" ? handed.rows : undefined}
        />
      ) : null}
      <div className={shownEntry === "file" ? "grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "hidden"}>
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-canvas-2 p-4 sm:p-5 text-center text-sm text-ink-2 has-focus-visible:outline-2 has-focus-visible:outline-accent">
          <FileArrowUpIcon size={24} weight="bold" aria-hidden className="text-ink-3" />
          <span>
            <span className="font-medium text-ink">Choose the file from your instrument</span>
            <br />
            CSV, TXT, DAT, Leica GSI, Sokkia SDR, LandXML, Trimble JobXML or GeoJSON, up to {IMPORT_LIMITS.maxBytes / 1024 / 1024} MB
          </span>
          <input type="file" accept=".csv,.txt,.dat,.gsi,.sdr,.xml,.landxml,.jxl,.jobxml,.dc,.dxf,.pnezd,.penzd,.xyz,.asc,.geojson,.json,text/csv,text/plain,application/geo+json,application/json" className="sr-only" disabled={Boolean(readOnly)} onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Or paste rows from a spreadsheet or file</span>
          <textarea value={text} rows={5} disabled={Boolean(readOnly)} spellCheck={false} placeholder={"1,700004.210,450012.345,21.43,CP\n2,700007.884,450043.912,21.88,CP"} onChange={(e) => load("", e.target.value, firstLine(e.target.value) !== firstLine(text))} className={textareaClasses("font-mono")} />
        </label>
      </div>
      {shownEntry === "file" ? <WhatToUpload /> : null}

      {encoding ? (
        <p role="status" className="flex items-start gap-2 text-sm text-ink">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
          {encoding}
        </p>
      ) : null}
      {unreadable ? (
        <div role="alert" className="grid gap-3 rounded-sm bg-canvas-2 p-3 text-sm text-ink ring-1 ring-line">
          <p className="flex items-start gap-2">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
            <span>{unreadable}</span>
          </p>
          {sourcePath ? <CopyPath path={sourcePath} /> : null}
        </div>
      ) : null}
      {preview ? (
        <div className="grid gap-5">
          <div className="grid gap-1.5 sm:max-w-sm">
            <label className="grid gap-1.5">
              <span className={LABEL_CLASSES}>Read the file as</span>
              <select value={format} disabled={Boolean(readOnly)} onChange={(e) => chooseFormat(e.target.value as ImportFormat)} className={inputClasses()}>
                {IMPORT_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-ink-3">{formatChosen ? "As you chose." : "Farbaek recognised it from its contents."} {IMPORT_FORMATS.find((f) => f.id === format)?.detail}</p>
          </div>
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
                    {Array.from({ length: format !== "delimited" ? 5 : columnCount }, (_, i) => (
                      <th key={i} scope="col" className="p-2 align-bottom font-medium text-ink-2">
                        {format !== "delimited" ? (
                          preview.header?.[i]
                        ) : (
                          <label className="grid gap-1">
                            <span className="text-xs text-ink-3">{preview.header?.[i] ?? `Column ${i + 1}`}</span>
                            <select value={columns[i] ?? "ignore"} onChange={(e) => setColumns((c) => Object.assign([...c, ...Array<ColumnRole>(Math.max(0, i + 1 - c.length)).fill("ignore")], { [i]: e.target.value as ColumnRole }))} className={inputClasses()}>
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
                      {Array.from({ length: format !== "delimited" ? 5 : columnCount }, (_, j) => (
                        <td key={j} className="p-2 font-mono text-ink tabular">
                          {row[j] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {points.length > 0 && !latLong ? <PointsMap points={points} willDraw={willDraw} outline={willDraw ? (drawing?.outline?.ring ?? null) : null} lines={willDraw ? [...(drawing?.lines.map((l) => ({ closed: l.closed, ids: l.points })) ?? []), ...(drawing?.road ?? []).map((edge) => ({ closed: false, ids: edge.map((p) => p.id) }))] : []} marks={new Set(drawing?.marks.map((m) => m.id))} /> : null}
          </div>

          {count > 0 && !latLong ? <PointsTable points={preview.parsed.points} issues={preview.parsed.issues} codes={library} /> : null}

          <div className="grid gap-1 text-sm text-ink-2">
            <p>
              {count} {count === 1 ? "point" : "points"} read{errors.length ? `, ${errors.length} ${errors.length === 1 ? "row" : "rows"} can't be read` : ""}
              {repeats ? `, ${repeats} exact ${repeats === 1 ? "repeat" : "repeats"} kept once` : ""}.
              {drawing ? ` ${drawing.marks.length} boundary ${drawing.marks.length === 1 ? "mark" : "marks"}, ${drawing.lines.length} ${drawing.lines.length === 1 ? "line" : "lines"} from the codes${drawing.road ? ", and a road from its two edges" : ""}.` : ""}
            </p>
            {codeCounts.length > 0 ? (
              <p>
                Codes:{" "}
                {codeCounts.slice(0, 12).map(([c, n], i) => {
                  const entry = entryFor(library, c);
                  const road = !entry && isRoadEdgeCode(c);
                  return (
                    <span key={c}>
                      {i > 0 ? ", " : ""}
                      <span className={entry || road ? "text-ink" : "text-caution"}>{c}</span> {entry ? entry.meaning.toLowerCase() : road ? "road edge" : "not in your code list"} ({n})
                    </span>
                  );
                })}
                {codeCounts.length > 12 ? `, and ${codeCounts.length - 12} more` : ""}.
              </p>
            ) : null}
          </div>
          {notes.length > 0 ? (
            <ul className="grid gap-1 text-sm">
              {notes.slice(0, 20).map((x, i) => (
                <li key={i} className="flex gap-2 text-ink">
                  <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
                  {x.message}
                </li>
              ))}
            </ul>
          ) : null}
          {/* Still offered when the chosen rule can't be used, so the surveyor can choose again (ADR 0241). */}
          {format === "sdr" && (adjust !== null || closure) ? (
            <TraverseChoice
              value={adjust}
              onChange={(m) => {
                setAdjust(m);
                // What the confirmation below says changes with the rule, so it's asked again.
                setConfirmUnits(false);
              }}
              disabled={pending}
            />
          ) : null}
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
              <span>These coordinates are in metres, in {crsName}{format === "delimited" ? ", and the columns are read right" : ""}.{rule ? ` Farbaek never converts or rounds them. The traverse's points are placed by ${ADJUST_NAMES[rule]}, as you chose, and the file keeps the observations as shot.` : " Farbaek stores them exactly as written and never converts, moves or rounds them."}</span>
            </label>
            {dsrOffered ? (
              <label className="flex min-h-11 items-start gap-3 p-3 text-sm text-ink">
                <input type="checkbox" checked={dsrOn} onChange={(e) => setUseDsr(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
                <span>
                  Draw with the Survey Department&apos;s code list: this file uses its codes ({dsrSeen.slice(0, 6).join(", ")}), as Chapter XXII of the Departmental Survey Regulations defines them. In that list MW is a mark on a wall, not a masonry wall.
                </span>
              </label>
            ) : null}
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
            <button type="button" onClick={submit} disabled={Boolean(readOnly) || pending || count === 0 || errors.length > 0 || !confirmUnits || latLong} className={buttonClasses("primary", "md", "w-full sm:w-auto")}>
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
          {result.drawError ? (
            <p className="flex items-start gap-2 text-sm text-ink">
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
              {result.drawError}
            </p>
          ) : null}
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
function PointsMap({ points, willDraw, outline, lines, marks }: { points: SurveyPoint[]; willDraw: boolean; outline: SurveyPoint[] | null; lines: { closed: boolean; ids: string[] }[]; marks: Set<string> }) {
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
      <figcaption className="text-sm text-ink-3">{!willDraw ? "The points as read, boundary marks larger. Nothing is drawn from them on import." : outline ? "The dashed outline is the lot Farbaek would draw. Check it after the import." : "No lot outline yet: the boundary marks don't make one, so you'll give the lot's corners after the import."}</figcaption>
    </figure>
  );
}

/** The job file's path from a printout, to copy (stage 198): it's something people copy, so it's in mono. */
function CopyPath({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <code className="block rounded-sm border border-line bg-surface px-3 py-2 font-mono text-label break-all">{path}</code>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void copy()} className={buttonClasses("secondary", "sm")}>
          Copy the path
        </button>
        <span role="status" className="text-sm text-ink-3">
          {copied ? "Copied" : ""}
        </span>
      </div>
    </div>
  );
}

/** What to upload from each instrument family (stage 198): only formats Farbaek reads, and what won't work. */
function WhatToUpload() {
  return (
    <Disclosure summary="What to upload from your instrument" icon={<FileArrowUpIcon size={20} weight="bold" aria-hidden />}>
      <ul className="grid list-disc gap-2 pl-5 text-sm text-ink-2">
        <li>
          <span className="font-medium text-ink">Sokkia:</span> the job&apos;s <code className="font-mono text-label">.sdr</code> file, from the instrument or from the job&apos;s folder in Sokkia Link. Not Sokkia Link&apos;s printout.
        </li>
        <li>
          <span className="font-medium text-ink">Leica:</span> a GSI file (<code className="font-mono text-label">.gsi</code>, GSI-8 or GSI-16) with the points&apos; coordinates.
        </li>
        <li>
          <span className="font-medium text-ink">Trimble:</span> the job exported from Trimble Access as JobXML (<code className="font-mono text-label">.jxl</code>).
        </li>
        <li>
          <span className="font-medium text-ink">Any other software:</span> LandXML with the points, or a CSV, TXT or DAT file with one point a line: point, northing, easting, height and code (PNEZC), as the Survey Department asks.
        </li>
        <li>
          <span className="font-medium text-ink">Won&apos;t work:</span> a printout or PDF, the instrument&apos;s own job database, or a job of angles and distances only. Compute the coordinates first, on the instrument or in its software.
        </li>
      </ul>
    </Disclosure>
  );
}
