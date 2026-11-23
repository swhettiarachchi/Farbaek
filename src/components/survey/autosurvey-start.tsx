"use client";

import { CameraIcon, FileTextIcon, ImageIcon, PencilSimpleIcon, UploadSimpleIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { generateSurveyPlanAction, type GenerateState } from "@/app/app/survey/actions";
import { commonCodes } from "@/core/survey/codes";
import { CRS_REGISTRY, LOCAL_CRS, crsById } from "@/core/survey/crs";
import { START_LIMITS, gridProblem, kindOfUpload, notReadYet, pointClashes, readSurveyFile, startName, drawsWithDsrList, type FileRead } from "@/core/survey/autosurvey/start";
import { IMPORT_LIMITS } from "@/core/survey/import/delimited";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";

const CRS_OPTIONS = [...CRS_REGISTRY, LOCAL_CRS];

/** One uploaded file and what Farbaek found in it, read here so the surveyor sees it at once. The server reads it all again. */
type Upload =
  | { key: string; name: string; size: number; kind: "survey-data"; content: string; read: FileRead | null; problem: string | null; encoding: string | null }
  | { key: string; name: string; size: number; kind: "sketch" | "document"; reason: string };

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
  return `${r.formatLabel}, ${r.points.length} ${r.points.length === 1 ? "point" : "points"}${codes.length ? `, codes ${shown}${codes.length > 6 ? " and more" : ""}` : ", no codes"}.`;
}

/**
 * AutoSurvey's start (stage 222, ADR 0233): every file at once, what Farbaek found in each, the coordinate system the surveyor
 * confirmed last time, and one Generate Plan. Pictures and documents are listed and said plainly to be unread in this part.
 * Anyone can add files and see what Farbaek finds in them (the demo too); only Generate Plan waits on being able to save.
 */
export function AutoSurveyStart({ startingCrsId, surveyorName, disabledReason }: { startingCrsId: string | null; surveyorName: string | null; disabledReason: string | null }) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [crsId, setCrsId] = useState<string>(crsById(startingCrsId)?.id ?? "");
  const [changingCrs, setChangingCrs] = useState(!crsById(startingCrsId));
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<GenerateState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const crs = crsById(crsId);

  const reread = (list: Upload[], chosen = crs): Upload[] =>
    list.map((u) => {
      if (u.kind !== "survey-data") return u;
      const r = readSurveyFile(u.name, u.content, chosen);
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
      if (kind !== "survey-data") {
        added.push({ key, name: file.name, size: file.size, kind, reason: notReadYet(kind, file.name) });
        continue;
      }
      if (file.size > IMPORT_LIMITS.maxBytes) {
        added.push({ key, name: file.name, size: file.size, kind, content: "", read: null, problem: `This file is larger than ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB. Export only this survey's points.`, encoding: null });
        continue;
      }
      const { content, encoding } = await decode(file);
      added.push({ key, name: file.name, size: file.size, kind, content, read: null, problem: null, encoding });
    }
    setUploads((now) => reread([...now, ...added].slice(0, START_LIMITS.files)));
  };

  const remove = (key: string) => {
    setResult({ status: "idle" });
    setUploads((now) => now.filter((u) => u.key !== key));
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

  const blocked =
    disabledReason ??
    (data.length === 0
      ? "Add at least one survey data file: a points file or an instrument's job export."
      : !crs
        ? "Choose the coordinate system the points are in."
        : problems > 0
          ? "Sort out what's marked below first."
          : dataBytes > START_LIMITS.dataBytes
            ? `The survey files hold more than ${START_LIMITS.dataBytes / 1024 / 1024} MB together. Generate from fewer, then import the rest.`
            : null);

  const generate = () => {
    if (blocked || !crs) return;
    setResult({ status: "idle" });
    startTransition(async () => {
      // On success the server sends the browser to the drawn plan; only a problem comes back here.
      const r = await generateSurveyPlanAction({ title, crsId: crs.id, files: data.map((u) => ({ name: u.name, content: u.content })) });
      if (r) setResult(r);
    });
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
                  {u.kind !== "survey-data" ? <StatusBadge status="off" label="Not read yet" /> : u.problem ? <StatusBadge status="attention" label="Needs a look" /> : u.read ? <StatusBadge status="done" label="Read" /> : <StatusBadge status="working" label="Reading" />}
                </div>
                <p className="text-sm text-ink-2">
                  {u.kind !== "survey-data" ? u.reason : u.problem ? u.problem : u.read ? summary(u.read) : `${size(u.size)}.`}
                </p>
                {u.kind === "survey-data" && u.encoding ? <p className="text-sm text-ink-3">{u.encoding}</p> : null}
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
        {dsr ? <p className="text-sm text-ink-2">These files use the Survey Department&apos;s codes (Chapter XXII), so the plan is drawn with its code list.</p> : null}
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" onClick={generate} disabled={Boolean(blocked) || pending} aria-describedby="generate-note" className={buttonClasses("primary", "md", "w-full sm:w-auto")}>
            {pending ? "Drawing your plan…" : "Generate Plan"}
          </button>
          <p id="generate-note" className="text-sm text-ink-3">
            {pending
              ? `Reading ${data.length} ${data.length === 1 ? "file" : "files"} again on Farbaek's server, importing ${points.length} ${points.length === 1 ? "point" : "points"} and drawing the plan.`
              : blocked
                ? blocked
                : `Generate Plan confirms the points are in ${crs?.name}, and records that you confirmed it.`}
          </p>
        </div>
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
      </div>
    </div>
  );
}
