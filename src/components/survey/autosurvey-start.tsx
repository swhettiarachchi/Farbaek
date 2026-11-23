"use client";

import { CameraIcon, FileTextIcon, ImageIcon, InfoIcon, PencilSimpleIcon, UploadSimpleIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { readSketchesAction } from "@/app/app/survey/ai-actions";
import { generateSurveyPlanAction, type GenerateState } from "@/app/app/survey/actions";
import { commonCodes } from "@/core/survey/codes";
import { CRS_REGISTRY, LOCAL_CRS, crsById } from "@/core/survey/crs";
import { SKETCH_LIMITS } from "@/core/survey/autosurvey/sketch";
import { LIBRARY_LIMITS, librarySummary, looksLikeCodeLibrary, parseCodeLibrary, type LibraryRead } from "@/core/survey/codelib";
import { START_LIMITS, gridProblem, kindOfUpload, notReadYet, pointClashes, readSurveyFile, startName, drawsWithDsrList, type FileRead } from "@/core/survey/autosurvey/start";
import type { AdjustMethod } from "@/core/survey/adjust";
import { IMPORT_LIMITS } from "@/core/survey/import/delimited";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { shrink } from "./photo";
import { TraverseChoice } from "./traverse-choice";

const CRS_OPTIONS = [...CRS_REGISTRY, LOCAL_CRS];

/** One uploaded file and what Farbaek found in it, read here so the surveyor sees it at once. The server reads it all again. */
type Upload =
  | { key: string; name: string; size: number; kind: "survey-data"; content: string; read: FileRead | null; problem: string | null; encoding: string | null; adjust: AdjustMethod | null }
  /** A field sketch, shrunk as it's added so a photo this device can't open is said at once, not after the plan exists. */
  | { key: string; name: string; size: number; kind: "sketch"; photo: Blob | null; problem: string | null }
  | { key: string; name: string; size: number; kind: "document"; reason: string }
  /** An office code library (ADR 0237): read here to show, and again on the server. */
  | { key: string; name: string; size: number; kind: "code-library"; content: string; read: LibraryRead };

/**
 * After Generate Plan, when the screen stays to say something about the sketches: they couldn't be read, or nothing on them could
 * be read for certain. The plan exists either way, so Generate stays off and no second project is made.
 */
type Drawn = { next: string; failed: boolean; message: string };

const size = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

async function decode(file: File): Promise<{ content: string; encoding: string | null }> {
  // UTF-8 first, strictly; a file that isn't (CASS files are often in the Chinese GBK code page) is read as GB18030 and said.
  const bytes = await file.arrayBuffer();
  try {
    return { content: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: null };
  } catch {
    return { content: new TextDecoder("gb18030").decode(bytes), encoding: "Read as Chinese GB18030 text, the way CASS often writes it. Check the codes read right." };
  }
}

/** What a read file holds, in one line: its kind, how many points, and its first codes. */
function summary(r: FileRead): string {
  const codes = [...new Set(r.points.map((p) => (p.code ?? "").trim()).filter(Boolean))];
  const shown = codes.slice(0, 6).join(", ");
  const worked = r.reduction ? ` ${r.reduction.points} of them worked out from the instrument's observations, from ${r.reduction.stations} ${r.reduction.stations === 1 ? "station" : "stations"}.` : "";
  return `${r.formatLabel}, ${r.points.length} ${r.points.length === 1 ? "point" : "points"}${codes.length ? `, codes ${shown}${codes.length > 6 ? " and more" : ""}` : ", no codes"}.${worked}`;
}

/**
 * AutoSurvey's start (stage 222, ADR 0233): every file at once, what Farbaek found in each, the coordinate system the surveyor
 * confirmed last time, and one Generate Plan. Field sketches are read by Claude after the plan is drawn, only when the surveyor
 * agrees here (stage 223, ADR 0234); documents are listed and said plainly to be unread.
 * Anyone can add files and see what Farbaek finds in them (the demo too); only Generate Plan waits on being able to save.
 */
export function AutoSurveyStart({
  startingCrsId,
  surveyorName,
  disabledReason,
  sketchOff,
  aiCost,
  carried = { codes: null, sheet: null },
}: {
  startingCrsId: string | null;
  surveyorName: string | null;
  disabledReason: string | null;
  /** Why sketches can't be read here, or null when Claude can read them. */
  sketchOff: string | null;
  /** What reading them costs, in a sentence. */
  aiCost: string;
  /** What a new plan takes from this surveyor's own recent plans (ADR 0237). */
  carried?: { codes: { from: string; count: number } | null; sheet: { from: string; paper: string; orientation: string } | null };
}) {
  const router = useRouter();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<"drawing" | "reading">("drawing");
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  // Where the drawn plan opens while its sketches are read: the read goes on on the server if the surveyor opens it (ADR 0239).
  const [opening, setOpening] = useState<string | null>(null);
  const [crsId, setCrsId] = useState<string>(crsById(startingCrsId)?.id ?? "");
  const [changingCrs, setChangingCrs] = useState(!crsById(startingCrsId));
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<GenerateState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  // Once the surveyor has opened the plan or left this screen, a read that finishes later never pulls them back to it (ADR 0239).
  const left = useRef(false);
  useEffect(() => {
    left.current = false;
    return () => {
      left.current = true;
    };
  }, []);
  const crs = crsById(crsId);

  const reread = (list: Upload[], chosen = crs): Upload[] =>
    list.map((u) => {
      if (u.kind !== "survey-data") return u;
      const r = readSurveyFile(u.name, u.content, chosen, u.adjust);
      return r.ok ? { ...u, read: r.read, problem: null } : { ...u, read: null, problem: r.problem };
    });

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setResult({ status: "idle" });
    const added: Upload[] = [];
    for (const file of Array.from(files)) {
      counter.current += 1;
      const key = `${counter.current}-${file.name}`;
      const kind = kindOfUpload(file.name, file.type);
      if (kind === "document") {
        added.push({ key, name: file.name, size: file.size, kind, reason: notReadYet(file.name) });
        continue;
      }
      if (kind === "sketch") {
        const photo = await shrink(file).catch(() => null);
        const problem = !photo
          ? "This photo couldn't be opened here. Save it as a JPEG or PNG and add it again."
          : photo.size > SKETCH_LIMITS.photoBytes
            ? "This photo is still too large after shrinking. Take it again, or crop it to the sketch."
            : null;
        added.push({ key, name: file.name, size: file.size, kind, photo: problem ? null : photo, problem });
        continue;
      }
      if (file.size > IMPORT_LIMITS.maxBytes) {
        added.push({ key, name: file.name, size: file.size, kind, content: "", read: null, problem: `This file is larger than ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB. Export only this survey's points.`, encoding: null, adjust: null });
        continue;
      }
      const { content, encoding } = await decode(file);
      if (looksLikeCodeLibrary(file.name, content)) {
        added.push({ key, name: file.name, size: file.size, kind: "code-library", content, read: file.size > LIBRARY_LIMITS.bytes ? { ok: false, problem: `This code library is larger than ${LIBRARY_LIMITS.bytes / 1_000} KB.` } : parseCodeLibrary(content) });
        continue;
      }
      added.push({ key, name: file.name, size: file.size, kind, content, read: null, problem: null, encoding, adjust: null });
    }
    setUploads((now) => reread([...now, ...added].slice(0, START_LIMITS.files)));
  };

  const remove = (key: string) => {
    setResult({ status: "idle" });
    setUploads((now) => now.filter((u) => u.key !== key));
  };

  // A traverse's rule, chosen for one file (ADR 0241): that file is read again with it, so what's shown is what Generate sends.
  const chooseAdjust = (key: string, adjust: AdjustMethod | null) => {
    setResult({ status: "idle" });
    setUploads((now) => now.map((u) => (u.key === key && u.kind === "survey-data" ? reread([{ ...u, adjust }])[0]! : u)));
  };

  const chooseCrs = (id: string) => {
    setCrsId(id);
    setResult({ status: "idle" });
    setUploads((now) => reread(now, crsById(id)));
  };

  const data = uploads.filter((u): u is Extract<Upload, { kind: "survey-data" }> => u.kind === "survey-data");
  const reads = data.flatMap((u) => (u.read ? [u.read] : []));
  const points = reads.flatMap((r) => r.points);
  const clashes = pointClashes(reads);
  const grid = crs ? gridProblem(points, crs) : null;
  const problems = data.filter((u) => u.problem).length + clashes.length + (grid ? 1 : 0);
  const dataBytes = data.reduce((sum, u) => sum + u.content.length, 0);
  const sketches = uploads.filter((u): u is Extract<Upload, { kind: "sketch" }> => u.kind === "sketch");
  const libraries = uploads.filter((u): u is Extract<Upload, { kind: "code-library" }> => u.kind === "code-library");
  const library = libraries.length === 1 && libraries[0]!.read.ok ? libraries[0]! : null;
  const libraryBlock = libraries.length > 1 ? "Use one code library at a time: remove the others." : libraries.some((u) => !u.read.ok) ? "Remove the code library marked below, or fix it." : null;
  // Sketches are read only when Claude is available here and the surveyor agreed; otherwise they never hold up the plan.
  const reading = sketches.length > 0 && sketchOff === null && consent;
  const sketchBytes = sketches.reduce((sum, u) => sum + (u.photo?.size ?? 0), 0);
  const readable = sketches.filter((u) => u.photo).length;
  const sketchBlock = !reading
    ? null
    : sketches.some((u) => u.problem)
      ? "Remove the sketch marked below, or untick reading the sketches."
      : sketches.length > SKETCH_LIMITS.photos
        ? `Farbaek reads up to ${SKETCH_LIMITS.photos} sketches at a time. Remove some, or untick reading them.`
        : sketchBytes > SKETCH_LIMITS.totalBytes
          ? "The sketch photos are too large together. Remove some, or untick reading them."
          : null;

  const blocked =
    disabledReason ??
    (libraryBlock && !drawn
      ? libraryBlock
      : drawn
      ? "The plan is drawn. Open it below."
      : data.length === 0
      ? "Add at least one survey data file: a points file or an instrument's job export."
      : !crs
        ? "Choose the coordinate system the points are in."
        : problems > 0
          ? "Sort out what's marked below first."
          : dataBytes + (library?.content.length ?? 0) > START_LIMITS.dataBytes
            ? `The survey files hold more than ${START_LIMITS.dataBytes / 1024 / 1024} MB together. Generate from fewer, then import the rest.`
            : sketchBlock);

  const generate = () => {
    if (blocked || !crs) return;
    setResult({ status: "idle" });
    const toRead = reading ? sketches.flatMap((u) => (u.photo ? [{ name: u.name, photo: u.photo }] : [])) : [];
    startTransition(async () => {
      setPhase("drawing");
      // A request the server refuses before the action runs (too large to carry) comes back as a thrown error: said, not lost.
      const r = await generateSurveyPlanAction({ title, crsId: crs.id, files: data.map((u) => ({ name: u.name, content: u.content, adjust: u.adjust })), library: library ? { name: library.name, content: library.content } : null, sketches: reading ? sketches.filter((u) => u.photo).length : 0 }).catch(
        (): GenerateState => ({ status: "error", message: "The files couldn't be sent: they may be too large together. Generate from fewer files, then import the rest into the project.", problems: [] }),
      );
      if (r.status !== "done") {
        setResult(r);
        return;
      }
      if (toRead.length > 0) {
        setPhase("reading");
        setOpening(r.next);
        const form = new FormData();
        form.set("projectId", r.projectId);
        form.set("baseVersion", String(r.version));
        form.set("consent", "yes");
        form.set("jobId", r.jobId ?? "");
        for (const s of toRead) form.append("photo", s.photo, s.name);
        const read = await readSketchesAction(form).catch(() => ({ status: "error" as const, message: "The connection dropped while the sketches were sent." }));
        if (read.status === "error") {
          setDrawn({ next: r.next, failed: true, message: read.message });
          return;
        }
        // Nothing could be read for certain: said here, where the sketches are, before the plan opens.
        if (read.status === "done" && read.readings === 0) {
          setDrawn({ next: r.next, failed: false, message: read.message });
          return;
        }
      }
      if (!left.current) router.push(r.next);
    });
  };

  /** What each file is now, in a badge and one sentence. */
  const state = (u: Upload): { status: "done" | "attention" | "working" | "pending" | "off"; label: string; text: string } => {
    if (u.kind === "document") return { status: "off", label: "Not read", text: u.reason };
    if (u.kind === "code-library") {
      if (!u.read.ok) return { status: "attention", label: "Needs a look", text: u.read.problem };
      return { status: "done", label: "Read", text: librarySummary(u.read, points.map((p) => p.code ?? "")) };
    }
    if (u.kind === "sketch") {
      if (u.problem) return { status: "attention", label: "Needs a look", text: u.problem };
      if (sketchOff) return { status: "off", label: "Not read", text: sketchOff };
      if (drawn) return drawn.failed ? { status: "off", label: "Not read", text: "Not read. Open the plan to read it from its Draft step." } : { status: "done", label: "Read", text: "Read, but nothing on it could be read for certain." };
      if (!consent) return { status: "off", label: "Not read", text: "Tick the box below to have Claude read what's written on it." };
      if (pending && phase === "reading") return { status: "working", label: "Reading", text: "Claude is reading what's written on it." };
      return { status: "pending", label: "Read next", text: "Claude reads what's written on it once the plan is drawn, and Farbaek checks each measurement against your data." };
    }
    if (u.problem) return { status: "attention", label: "Needs a look", text: u.problem };
    if (u.read) return { status: "done", label: "Read", text: summary(u.read) };
    return { status: "working", label: "Reading", text: `${size(u.size)}.` };
  };

  const placeholder = startName("", data[0]?.name ?? null, new Date());
  const dsr = drawsWithDsrList(points, commonCodes());

  return (
    <div className="grid gap-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void add(e.dataTransfer.files);
        }}
        className={`grid justify-items-center gap-4 rounded-lg border-[1.5px] border-dashed px-5 py-8 text-center transition-colors duration-150 sm:py-10 ${dragging ? "border-accent bg-accent/[0.04]" : "border-line-strong/60 bg-surface"}`}
      >
        <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-canvas-2 text-ink-2">
          <UploadSimpleIcon size={24} />
        </span>
        <div className="grid gap-1">
          <p className="text-title-4 font-medium tracking-[-0.01em]">Drop your survey files and field sketches here</p>
          <p className="mx-auto max-w-[52ch] text-sm text-ink-2">Points files and instrument exports (CSV, TXT, DAT, Sokkia SDR, Leica GSI, LandXML, Trimble JobXML), with photos of your sketches. Farbaek sorts them itself.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => picker.current?.click()} className={buttonClasses("secondary", "md")}>
            <FileTextIcon size={16} weight="bold" aria-hidden /> Choose files
          </button>
          <button type="button" onClick={() => camera.current?.click()} className={buttonClasses("secondary", "md")}>
            <CameraIcon size={16} weight="bold" aria-hidden /> Take a photo
          </button>
        </div>
        <input ref={picker} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void add(e.target.files).then(() => (e.target.value = ""))} />
        <input ref={camera} type="file" accept="image/*" capture="environment" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void add(e.target.files).then(() => (e.target.value = ""))} />
      </div>

      {uploads.length > 0 ? (
        <ul aria-label="Your files" className="grid gap-2">
          {uploads.map((u) => (
            <li key={u.key} className="flex items-start gap-3 rounded-md border border-line bg-surface p-3 shadow-e1 sm:p-4">
              <span aria-hidden className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas-2 text-ink-2">
                {u.kind === "sketch" ? <ImageIcon size={20} /> : <FileTextIcon size={20} />}
              </span>
              <div className="grid min-w-0 flex-1 gap-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="min-w-0 truncate text-body font-medium">{u.name}</p>
                  <StatusBadge status={state(u).status} label={state(u).label} />
                </div>
                <p className="text-sm text-ink-2">{state(u).text}</p>
                {u.kind === "survey-data" && u.encoding ? <p className="text-sm text-ink-3">{u.encoding}</p> : null}
                {/* How points were worked out from observations, and their checks: said, as the reader wrote them (ADR 0236). */}
                {u.kind === "survey-data" && u.read?.reduction
                  ? u.read.notes
                      .filter((n) => n.code === "OBSERVATIONS_REDUCED" || n.code === "TRAVERSE_CLOSURE" || n.code === "OBSERVATION_CHECK" || n.code === "RECORDS_LEFT_OUT")
                      .slice(0, 5)
                      .map((n, i) => (
                        <p key={i} className="text-sm text-ink-3">
                          {n.message}
                        </p>
                      ))
                  : null}
                {/* A traverse that closes: kept as shot unless the surveyor chooses a rule (ADR 0241). Still offered when the chosen rule
                    can't be used, so they can choose again. */}
                {u.kind === "survey-data" && (u.adjust !== null || u.read?.reduction?.traverse) ? <TraverseChoice value={u.adjust} onChange={(m) => chooseAdjust(u.key, m)} disabled={pending || Boolean(drawn)} /> : null}
              </div>
              <button type="button" onClick={() => remove(u.key)} aria-label={`Remove ${u.name}`} className="tap -mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-canvas-2 hover:text-ink">
                <XIcon size={16} weight="bold" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {clashes.length > 0 || grid ? (
        <ul className="grid gap-2" aria-label="What needs you">
          {[...clashes, ...(grid ? [grid] : [])].map((p, n) => (
            <li key={n} className="flex items-start gap-2 text-sm text-ink">
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
              <span>
                {p.file ? <span className="font-medium">{p.file}: </span> : null}
                {p.problem}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-5 rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
        {changingCrs ? (
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Coordinate system of the points</span>
            <select value={crsId} onChange={(e) => chooseCrs(e.target.value)} className={inputClasses()}>
              <option value="" disabled>
                Choose one…
              </option>
              {CRS_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.epsg ? ` (EPSG:${c.epsg})` : ""}
                </option>
              ))}
            </select>
            <span className="text-sm text-ink-3">Farbaek never works this out from the numbers: several Sri Lankan and UTM grids overlap. It checks the points fit the one you choose.</span>
          </label>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-0.5">
              <span className={LABEL_CLASSES}>Coordinate system of the points</span>
              <p className="text-body text-ink">{crs?.name}</p>
              <p className="text-sm text-ink-3">The one you confirmed on your last survey.</p>
            </div>
            <button type="button" onClick={() => setChangingCrs(true)} className={buttonClasses("ghost", "sm")}>
              <PencilSimpleIcon size={16} weight="bold" aria-hidden /> Change
            </button>
          </div>
        )}

        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>
            Project name <span className="font-normal text-ink-3">(optional)</span>
          </span>
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} className={inputClasses()} />
        </label>

        <p className="text-sm text-ink-2">
          {surveyorName ? (
            <>
              Surveyor: <span className="font-medium text-ink">{surveyorName}</span>. The plan names you as responsible, for you to approve.
            </>
          ) : (
            <>
              No surveyor details yet: you can generate now, and add them once at{" "}
              <Link href="/app/survey/profile" className="font-medium text-accent underline-offset-2 hover:underline">
                Surveyor details
              </Link>{" "}
              before you approve a plan.
            </>
          )}
        </p>
        {library ? (
          <p className="text-sm text-ink-2">
            Codes: your office library, <span className="font-medium text-ink">{library.name}</span>, for you to check once on this plan.
          </p>
        ) : carried.codes ? (
          <p className="text-sm text-ink-2">
            Codes: the list you checked on <span className="font-medium text-ink">{carried.codes.from}</span> ({carried.codes.count} codes), for you to check once on this plan.
          </p>
        ) : null}
        {carried.sheet ? (
          <p className="text-sm text-ink-2">
            Sheet: laid out as on <span className="font-medium text-ink">{carried.sheet.from}</span> ({carried.sheet.paper === "auto" ? "paper chosen to fit" : carried.sheet.paper}, {carried.sheet.orientation}).
          </p>
        ) : null}
        {dsr && !library && !carried.codes ? <p className="text-sm text-ink-2">These files use the Survey Department&apos;s codes (Chapter XXII), so the plan is drawn with its code list.</p> : null}
        {sketches.length > 0 && !sketchOff ? (
          <label className="flex min-h-11 items-start gap-3 rounded-sm border border-line bg-canvas-2 p-3 text-sm text-ink">
            <input type="checkbox" checked={consent} disabled={pending || Boolean(drawn)} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
            <span className="grid gap-1">
              <span>
                Read my {readable === 1 ? "sketch" : readable > 1 ? `${readable} sketches` : "sketches"} with Claude. {readable === 1 ? "The photo goes" : "The photos go"} to Anthropic, outside Sri Lanka, to be read. When something is read, Farbaek keeps the photos with this plan, so your team can see what each reading came from, until they&apos;re read again or the workspace is deleted.
              </span>
              <span className="text-ink-3">Claude writes down what&apos;s written, as written. Farbaek&apos;s own checks compare every measurement with your survey data, and the plan shows only what differs. {aiCost}</span>
            </span>
          </label>
        ) : null}
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" onClick={generate} disabled={Boolean(blocked) || pending} aria-describedby="generate-note" className={buttonClasses("primary", "md", "w-full sm:w-auto")}>
            {pending ? (phase === "reading" ? "Reading your sketches…" : "Drawing your plan…") : "Generate Plan"}
          </button>
          <p id="generate-note" aria-live="polite" className="text-sm text-ink-3">
            {pending && phase === "reading"
              ? `The plan is drawn. Claude is reading ${readable === 1 ? "your sketch" : `${readable} sketches`}, which can take a minute.`
              : pending
              ? `Reading ${data.length} ${data.length === 1 ? "file" : "files"} again on Farbaek's server, importing ${points.length} ${points.length === 1 ? "point" : "points"} and drawing the plan${reading ? ", then reading the sketches" : ""}.`
              : blocked
                ? blocked
                : `Generate Plan confirms the points are in ${crs?.name}, and records that you confirmed it.`}
          </p>
        </div>
        {pending && phase === "reading" && opening ? (
          <p className="text-sm text-ink-2">
            <Link href={opening} onClick={() => (left.current = true)} className="font-medium text-accent underline-offset-2 hover:underline">
              Open the plan now
            </Link>
            : the reading carries on, and the plan shows it when it&apos;s done. Keep this tab open until then.
          </p>
        ) : null}
        {result.status === "error" ? (
          <div role="alert" className="grid gap-2 rounded-md border border-failed/35 bg-failed/[0.04] p-4">
            <p className="flex items-start gap-2 text-sm font-medium text-ink">
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
              {result.message}
            </p>
            {result.problems.length > 0 ? (
              <ul className="grid gap-1.5 pl-6 text-sm text-ink-2">
                {result.problems.map((p, n) => (
                  <li key={n}>
                    {p.file ? <span className="font-medium text-ink">{p.file}: </span> : null}
                    {p.problem}
                  </li>
                ))}
              </ul>
            ) : null}
            {result.projectId ? (
              <Link href={`/app/survey/${result.projectId}?step=import`} className="pl-6 text-sm font-medium text-accent underline-offset-2 hover:underline">
                Open the project
              </Link>
            ) : null}
          </div>
        ) : null}
        {drawn ? (
          <div role={drawn.failed ? "alert" : "status"} className={`grid gap-2 rounded-md border p-4 ${drawn.failed ? "border-caution/35 bg-caution/[0.04]" : "border-line bg-surface"}`}>
            <p className="flex items-start gap-2 text-sm font-medium text-ink">
              {drawn.failed ? <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden /> : <InfoIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-info" aria-hidden />}
              {drawn.failed ? <>Your plan is drawn and saved, but the sketches weren&apos;t read: {drawn.message}</> : <>Your plan is drawn and saved. {drawn.message}</>}
            </p>
            <p className="pl-6 text-sm text-ink-2">{drawn.failed ? "Open the plan, and read them again from its Draft step." : "Clearer photos, taken flat and close up, can be read from the plan's Draft step."}</p>
            <Link href={drawn.next} className="pl-6 text-sm font-medium text-accent underline-offset-2 hover:underline">
              Open the plan
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
