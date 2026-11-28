"use client";

import { CheckCircleIcon, FileTextIcon, ImageIcon, UploadSimpleIcon, WarningCircleIcon, XIcon } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { readSketchesAction, readTitleIntoPlanAction } from "@/app/app/survey/ai-actions";
import { addToSurveyPlanAction, type AddState } from "@/app/app/survey/actions";
import { SKETCH_LIMITS, sketchTooSmall } from "@/core/survey/autosurvey/sketch";
import { START_LIMITS, kindOfUpload, notReadYet, readSurveyFile, type FileRead } from "@/core/survey/autosurvey/start";
import { conflictSaid, pointConflicts } from "@/core/survey/autosurvey/update";
import type { AdjustMethod } from "@/core/survey/adjust";
import { crsById } from "@/core/survey/crs";
import { IMPORT_LIMITS } from "@/core/survey/import/delimited";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { photoSize, shrink } from "./photo";
import { DEED_LIMITS, decodeSurveyText } from "./start-uploads";
import { TraverseChoice } from "./traverse-choice";
import { PLAN_UNSAVED_REASON, usePlanUnsaved } from "./unsaved-plan";

type Item =
  | { key: string; name: string; kind: "data"; content: string; read: FileRead | null; problem: string | null; fresh: number; repeats: number; adjust: AdjustMethod | null }
  | { key: string; name: string; kind: "photo"; photo: Blob | null; problem: string | null; deed: boolean; pdf: boolean }
  | { key: string; name: string; kind: "unread"; reason: string };

interface Known {
  pointId: string;
  e: number;
  n: number;
  z: number | null;
  code: string | null;
}

type Outcome = { said: string[]; kept: string[]; failed: string[]; before: number; version: number };

/**
 * "Add to this plan" (stage 306, ADR 0311): a surveyor back with more survey files, another sketch or the deed. What each file holds is
 * shown at once, against the points the plan has: how many are new, which are already here, and any point it gives somewhere else. One
 * press adds the files and updates only what the new points change, reads the sketches again with the ones the plan keeps, and the deed
 * into the title. What changed is then said, with the plan's comparison one press away.
 */
export function AddToPlan({ projectId, baseVersion, crsId, known, keptSketches, readOnly, photosOff }: { projectId: string; baseVersion: number; crsId: string; known: readonly Known[]; keptSketches: number; readOnly: string | null; photosOff: string | null }) {
  const router = useRouter();
  const unsaved = usePlanUnsaved();
  const [items, setItems] = useState<Item[]>([]);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<"adding" | "reading" | "title" | null>(null);
  const [error, setError] = useState<Extract<AddState, { status: "error" }> | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, start] = useTransition();
  const counter = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const crs = crsById(crsId);
  const have = new Set(known.map((p) => p.pointId));

  const readData = (name: string, content: string, adjust: AdjustMethod | null): Pick<Extract<Item, { kind: "data" }>, "read" | "problem" | "fresh" | "repeats"> => {
    const r = readSurveyFile(name, content, crs, adjust);
    if (!r.ok) return { read: null, problem: r.problem, fresh: 0, repeats: 0 };
    const clash = pointConflicts(known, r.read);
    const fresh = r.read.points.filter((p) => !have.has(p.pointId)).length;
    if (clash.length > 0) return { read: r.read, problem: `${clash.slice(0, 3).map(conflictSaid).join(" ")}${clash.length > 3 ? ` And ${clash.length - 3} more.` : ""} Points are never changed once imported: if a point was shot again, give it a new number in the file.`, fresh, repeats: r.read.points.length - fresh };
    return { read: r.read, problem: null, fresh, repeats: r.read.points.length - fresh };
  };

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setOutcome(null);
    const added: Item[] = [];
    for (const file of Array.from(files)) {
      counter.current += 1;
      const key = `${counter.current}-${file.name}`;
      const kind = kindOfUpload(file.name, file.type);
      if (kind === "document") {
        const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        if (pdf && file.size <= DEED_LIMITS.pdfBytes) added.push({ key, name: file.name, kind: "photo", photo: file, problem: null, deed: true, pdf: true });
        else added.push({ key, name: file.name, kind: "unread", reason: pdf ? `This PDF is larger than ${DEED_LIMITS.pdfBytes / 1_000_000} MB. Scan it at a lower resolution, or photograph its pages.` : notReadYet(file.name) });
        continue;
      }
      if (kind === "sketch") {
        const photo = await shrink(file).catch(() => null);
        const size = photo ? await photoSize(photo) : null;
        const problem = !photo ? "This photo couldn't be opened here. Save it as a JPEG or PNG and add it again." : photo.size > SKETCH_LIMITS.photoBytes ? "This photo is still too large after shrinking. Take it again, or crop it to the sketch." : size ? sketchTooSmall(size.width, size.height, "This photo") : null;
        added.push({ key, name: file.name, kind: "photo", photo: problem ? null : photo, problem, deed: false, pdf: false });
        continue;
      }
      if (file.size > IMPORT_LIMITS.maxBytes) {
        added.push({ key, name: file.name, kind: "data", content: "", read: null, problem: `This file is larger than ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB. Export only this survey's points.`, fresh: 0, repeats: 0, adjust: null });
        continue;
      }
      const { content } = await decodeSurveyText(file);
      added.push({ key, name: file.name, kind: "data", content, adjust: null, ...readData(file.name, content, null) });
    }
    setItems((now) => [...now, ...added].slice(0, START_LIMITS.files));
    if (input.current) input.current.value = "";
  };

  const data = items.filter((x): x is Extract<Item, { kind: "data" }> => x.kind === "data");
  const photos = items.filter((x): x is Extract<Item, { kind: "photo" }> => x.kind === "photo" && x.photo !== null);
  const sketches = photos.filter((x) => !x.deed);
  const deeds = photos.filter((x) => x.deed);
  const blocked =
    readOnly ??
    (unsaved ? PLAN_UNSAVED_REASON : null) ??
    (items.length === 0 ? "Choose the files to add first." : null) ??
    (data.some((x) => x.problem) || items.some((x) => x.kind === "photo" && x.problem) ? "Remove or fix the files that need a look first." : null) ??
    (photos.length > 0 && photosOff ? photosOff : null) ??
    (photos.length > 0 && !consent ? "Tick that the photos may be read with Claude, or remove them." : null) ??
    (sketches.length + keptSketches > SKETCH_LIMITS.photos ? `This plan keeps ${keptSketches} sketch ${keptSketches === 1 ? "photo" : "photos"}, and Farbaek reads up to ${SKETCH_LIMITS.photos} together: add ${Math.max(0, SKETCH_LIMITS.photos - keptSketches)} at most.` : null) ??
    (deeds.length > DEED_LIMITS.photos ? `Farbaek reads up to ${DEED_LIMITS.photos} photos or scans of the deed together.` : null) ??
    (data.length === 0 && photos.length === 0 ? "None of these files can be read. Add a survey file, a sketch or the deed." : null);

  const update = () => {
    if (blocked) return;
    setError(null);
    setOutcome(null);
    start(async () => {
      let version = baseVersion;
      const said: string[] = [];
      const kept: string[] = [];
      const failed: string[] = [];
      if (data.length > 0) {
        setPhase("adding");
        const r = await addToSurveyPlanAction({ projectId, baseVersion: version, crsId, files: data.map((x) => ({ name: x.name, content: x.content, adjust: x.adjust })) }).catch((): AddState => ({ status: "error", message: "The files couldn't be sent: they may be too large together. Add fewer at a time.", problems: [] }));
        if (r.status === "error") {
          setPhase(null);
          setError(r);
          return;
        }
        if (r.status === "done") {
          version = r.version;
          said.push(r.message, ...r.said);
          kept.push(...r.kept);
        }
      }
      if (sketches.length > 0) {
        setPhase("reading");
        const form = new FormData();
        form.set("projectId", projectId);
        form.set("baseVersion", String(version));
        form.set("consent", "yes");
        form.set("withStored", "yes");
        for (const s of sketches) form.append("photo", s.photo!, s.name);
        const r = await readSketchesAction(form).catch(() => ({ status: "error" as const, message: "The connection dropped while the sketches were sent." }));
        if (r.status === "error") failed.push(`The sketches weren't read: ${r.message}`);
        else if (r.status === "done") {
          version = r.version;
          said.push(r.message);
        }
      }
      if (deeds.length > 0) {
        setPhase("title");
        const form = new FormData();
        form.set("projectId", projectId);
        form.set("baseVersion", String(version));
        form.set("consent", "yes");
        for (const d of deeds) form.append("photo", d.photo!, d.name);
        const r = await readTitleIntoPlanAction(form).catch(() => ({ status: "error" as const, message: "The connection dropped while the photos were sent." }));
        if (r.status === "error") failed.push(`The deed wasn't read: ${r.message}`);
        else {
          version = r.version;
          said.push(r.message);
        }
      }
      setPhase(null);
      setItems([]);
      // The say-so to send photos is for these photos: asked again for the next.
      setConsent(false);
      setOutcome({ said, kept, failed, before: baseVersion, version });
      router.refresh();
    });
  };

  const state = (x: Item): { status: "done" | "attention" | "off" | "pending"; label: string; text: string } => {
    if (x.kind === "unread") return { status: "off", label: "Not read", text: x.reason };
    if (x.kind === "photo") {
      if (x.problem) return { status: "attention", label: "Needs a look", text: x.problem };
      return { status: "pending", label: "Read next", text: x.deed ? "Read into the plan's title, each fact waiting for your confirmation." : "Read with the sketches this plan keeps, and what it draws waits for your confirmation." };
    }
    if (x.problem) return { status: "attention", label: "Needs a look", text: x.problem };
    const r = x.read!;
    const what = x.fresh === 0 ? `every one already in the plan, so nothing new` : `${x.fresh} new${x.repeats > 0 ? `, ${x.repeats} already in the plan` : ""}`;
    return { status: "done", label: "Read", text: `${r.formatLabel}, ${r.points.length} ${r.points.length === 1 ? "point" : "points"}: ${what}.` };
  };

  const working = phase === "adding" ? "Adding the files and updating the plan…" : phase === "reading" ? "Reading the sketches with Claude. It usually takes two to four minutes." : phase === "title" ? "Reading the deed into the title…" : null;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-2">Farbaek reads them, adds what&apos;s new, and updates only what it changes. Anything you confirmed stays as it is.</p>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} id={`add-${projectId}`} type="file" multiple className="sr-only" onChange={(e) => void add(e.target.files)} disabled={pending} />
        <label htmlFor={`add-${projectId}`} className={buttonClasses("secondary", "sm", `w-fit ${pending ? "pointer-events-none opacity-60" : "cursor-pointer"}`)}>
          <UploadSimpleIcon size={16} weight="bold" aria-hidden />
          Choose files
        </label>
        <span className="text-sm text-ink-3">Points files, instrument files, sketch photos, the deed.</span>
      </div>
      {items.length > 0 ? (
        <ul className="grid gap-2">
          {items.map((x) => {
            const s = state(x);
            return (
              <li key={x.key} className="grid gap-1 rounded-md p-3 ring-1 ring-line">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {x.kind === "photo" ? <ImageIcon size={16} weight="bold" className="text-ink-3" aria-hidden /> : <FileTextIcon size={16} weight="bold" className="text-ink-3" aria-hidden />}
                  <span className="min-w-0 break-all text-sm font-medium text-ink">{x.name}</span>
                  <StatusBadge status={s.status} label={s.label} />
                  <button type="button" onClick={() => setItems((now) => now.filter((y) => y.key !== x.key))} disabled={pending} className="tap ml-auto inline-flex size-10 items-center justify-center rounded-full text-ink-3 hover:bg-surface-sunken" aria-label={`Remove ${x.name}`}>
                    <XIcon size={16} weight="bold" aria-hidden />
                  </button>
                </div>
                <p className="text-sm text-ink-2">{s.text}</p>
                {x.kind === "data" && (x.adjust !== null || x.read?.reduction?.traverse) ? <TraverseChoice value={x.adjust} onChange={(m) => setItems((now) => now.map((y) => (y.key === x.key && y.kind === "data" ? { ...y, adjust: m, ...readData(y.name, y.content, m) } : y)))} disabled={pending} /> : null}
                {x.kind === "photo" && !x.pdf && !x.problem ? (
                  <div className="flex flex-wrap gap-2" role="group" aria-label={`What ${x.name} is`}>
                    {([false, true] as const).map((deed) => (
                      <button key={String(deed)} type="button" aria-pressed={x.deed === deed} onClick={() => setItems((now) => now.map((y) => (y.key === x.key && y.kind === "photo" ? { ...y, deed } : y)))} className={buttonClasses(x.deed === deed ? "secondary" : "ghost", "sm", "w-fit")}>
                        {deed ? "Deed or old plan" : "Sketch"}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {photos.length > 0 && !photosOff ? (
        <label className="flex items-start gap-3 text-sm text-ink">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={pending} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
          <span>Read the photos with Claude. They go to Anthropic, outside Sri Lanka, to be read{keptSketches > 0 && sketches.length > 0 ? `, with the ${keptSketches} sketch ${keptSketches === 1 ? "photo" : "photos"} this plan keeps, read again together` : ""}. Sketches are kept with this plan, so your team can see what each reading came from. It&apos;s free while Survey Studio is being tested.</span>
        </label>
      ) : null}
      <div className="grid gap-1.5">
        <button type="button" onClick={update} disabled={pending || blocked !== null} className={buttonClasses("primary", "md", "w-fit")}>
          <UploadSimpleIcon size={16} weight="bold" aria-hidden />
          {pending ? "Updating…" : "Update the plan"}
        </button>
        {working ? <p className="text-sm text-ink-2" role="status">{working}</p> : blocked && (items.length > 0 || readOnly) ? <p className="text-sm text-ink-3">{blocked}</p> : null}
      </div>
      {error ? (
        <div role="alert" className="grid gap-1.5 text-sm text-failed">
          <p className="flex items-start gap-2">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            {error.message}
          </p>
          {error.problems.length > 0 ? (
            <ul className="ml-6 list-disc text-ink-2">
              {error.problems.map((p, k) => (
                <li key={k}>
                  <span className="font-medium text-ink">{p.file}:</span> {p.problem}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {outcome ? (
        <div role="status" className="grid gap-1.5 text-sm">
          {outcome.said.length > 0 ? (
            <p className="flex items-start gap-2 text-ink">
              <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
              <span>{outcome.said[0]}</span>
            </p>
          ) : null}
          {[...outcome.said.slice(1), ...outcome.kept].length > 0 ? (
            <ul className="ml-6 list-disc text-ink-2">
              {[...outcome.said.slice(1), ...outcome.kept].map((t, k) => (
                <li key={k}>{t}</li>
              ))}
            </ul>
          ) : null}
          {outcome.failed.map((t, k) => (
            <p key={k} className="flex items-start gap-2 text-failed">
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
              {t}
            </p>
          ))}
          {outcome.version !== outcome.before ? (
            <Link href={`/app/survey/${projectId}?step=history&compare=${outcome.before}`} className="w-fit font-medium text-accent underline-offset-2 hover:underline">
              See what changed since version {outcome.before}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
