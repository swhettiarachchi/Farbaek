"use client";

import { ArrowCounterClockwiseIcon, CameraIcon, FileTextIcon, ImageIcon, InfoIcon, PencilSimpleIcon, UploadSimpleIcon, WarningCircleIcon, XIcon } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { readSketchesAction, readTitleIntoPlanAction } from "@/app/app/survey/ai-actions";
import { generateSurveyPlanAction, type GenerateState } from "@/app/app/survey/actions";
import { commonCodes } from "@/core/survey/codes";
import { CRS_REGISTRY, LOCAL_CRS, crsById } from "@/core/survey/crs";
import { SKETCH_LIMITS } from "@/core/survey/autosurvey/sketch";
import { GRAMMAR, grammarForLibrary, type GrammarId } from "@/core/survey/grammar";
import { profilePrecision, profileSummary, resolveProfile, type OfficeProfile } from "@/core/survey/profile";
import { LIBRARY_LIMITS, libraryFor, librarySummary, looksLikeCodeLibrary, parseCodeLibrary } from "@/core/survey/codelib";
import { START_LIMITS, gridProblem, gridsThatFit, importOrder, kindOfUpload, notReadYet, pointClashes, readSurveyFile, readTogether, drawsWithDsrList, type FileRead } from "@/core/survey/autosurvey/start";
import { jobFactsTogether, startName } from "@/core/survey/autosurvey/job-facts";
import type { AdjustMethod } from "@/core/survey/adjust";
import { IMPORT_LIMITS } from "@/core/survey/import/delimited";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { shrink } from "./photo";
import { sketchesKey, stage, staged, startKey, unstage } from "./staging";
import { fromKept, toKept, type Upload } from "./start-uploads";
import { StartPreview } from "./start-preview";
import { TraverseChoice } from "./traverse-choice";

const CRS_OPTIONS = [...CRS_REGISTRY, LOCAL_CRS];
/** Photos of the deed or an old plan read at a time: the server's limit for "Read an old plan" (PHOTO_LIMITS in drafting.ts). */
const DEED_PHOTOS = 3;
/** A scanned PDF of the deed or an old plan, sent as it is: the server's PHOTO_LIMITS.pdfBytes, and together within what one request carries. */
const DEED_PDF_BYTES = 3_000_000;
const DEED_TOTAL_BYTES = 5_500_000;
// The common code list, made once: the list of points judges codes by it when nothing else is chosen.
const COMMON_CODES = commonCodes();


/**
 * After Generate Plan, when the screen stays to say something about the sketches: they couldn't be read, or nothing on them could
 * be read for certain. The plan exists either way, so Generate stays off and no second project is made.
 */
/** How each kind of photo's read ended, for its own card: read, nothing on it read, failed, or not read at all. */
type ReadOutcome = "read" | "empty" | "failed" | null;
type Drawn = { next: string; failed: boolean; message: string; sketch: ReadOutcome; deed: ReadOutcome };

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
  profiles = [],
  lastProfile = null,
  lastCrsId = null,
  userId = null,
  orgId = null,
}: {
  /** Whose files these are, so what's kept in this browser until the plan is generated is theirs alone (ADR 0258); null keeps nothing. */
  userId?: string | null;
  /** The workspace the files are chosen in: kept files never come back in another workspace. */
  orgId?: string | null;
  /** The workspace's office profiles (ADR 0256): one is picked by the files' formats, the one used last, or the only one. */
  profiles?: OfficeProfile[];
  lastProfile?: string | null;
  /** The grid this surveyor last confirmed, to say where the one shown comes from. */
  lastCrsId?: string | null;
  startingCrsId: string | null;
  surveyorName: string | null;
  disabledReason: string | null;
  /** Why sketches can't be read here, or null when Claude can read them. */
  sketchOff: string | null;
  /** What reading them costs, in a sentence. */
  aiCost: string;
  /** What a new plan takes from this surveyor's own recent plans (ADR 0237). */
  carried?: { codes: { from: string; count: number } | null; sheet: { from: string; paper: string; orientation: string } | null; grammar?: { id: GrammarId; from: string } | null; habits?: { from: string; said: string[] } | null };
}) {
  const router = useRouter();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<"drawing" | "reading" | "title">("drawing");
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  // Where the drawn plan opens while its sketches are read: the read goes on on the server if the surveyor opens it (ADR 0239).
  const [opening, setOpening] = useState<string | null>(null);
  const [crsId, setCrsId] = useState<string>(crsById(startingCrsId)?.id ?? "");
  const [changingCrs, setChangingCrs] = useState(!crsById(startingCrsId));
  // The surveyor's own name for the project. Until they type one, the box shows the name the files give (stage 293).
  const [title, setTitle] = useState("");
  const [ownName, setOwnName] = useState(false);
  // The office profile: null follows what the files and the last choice say; "none" starts from the surveyor's recent plans.
  const [pick, setPick] = useState<string | null>(null);
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

  // What was chosen before a refresh or a dropped connection comes back, kept in this browser until the plan is generated (ADR 0258).
  // Nothing is kept until what was there has been looked at, so an empty screen never wipes it.
  const [restored, setRestored] = useState<{ count: number; sent: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  // Files added before what was kept had been looked at win: nothing kept is brought back over them.
  const touched = useRef(false);
  // Once the plan exists, its files are the project's: nothing on this screen is kept again.
  const generated = useRef(false);
  const key = userId && orgId ? startKey(orgId, userId) : null;
  useEffect(() => {
    if (!key) return;
    let live = true;
    void staged(key).then((s) => {
      if (!live) return;
      // Only a look that worked lets this screen keep files: a failed look never counts as nothing kept, so it can't wipe them.
      if (s.status === "failed") return;
      setReady(true);
      const back = s.status === "found" && !touched.current ? fromKept(s.value, () => `${(counter.current += 1)}-kept`) : null;
      if (!back || back.uploads.length === 0) return;
      const chosen = crsById(back.crsId) ?? crsById(startingCrsId);
      setUploads(
        back.uploads.map((u) => {
          if (u.kind !== "survey-data") return u;
          const r = readSurveyFile(u.name, u.content, chosen, u.adjust);
          return r.ok ? { ...u, read: r.read, problem: null } : { ...u, read: null, problem: r.problem };
        }),
      );
      setRestored({ count: back.uploads.length, sent: back.sent });
      if (chosen) {
        setCrsId(chosen.id);
        setChangingCrs(false);
      }
      setTitle(back.title);
      if (back.title.trim()) setOwnName(true);
    });
    return () => {
      live = false;
    };
  }, [key, startingCrsId]);
  useEffect(() => {
    if (!key || !ready || pending || drawn || generated.current) return;
    // A moment after the last change, so typing a title doesn't write every file again on each key.
    const timer = setTimeout(() => {
      if (uploads.length === 0) void unstage(key);
      else void stage(key, toKept(uploads, title, crsId));
    }, 400);
    return () => clearTimeout(timer);
  }, [key, ready, pending, drawn, uploads, title, crsId]);
  const forget = () => {
    setRestored(null);
    setUploads([]);
    setTitle("");
    setOwnName(false);
    if (key) void unstage(key);
  };

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    touched.current = true;
    setResult({ status: "idle" });
    const added: Upload[] = [];
    for (const file of Array.from(files)) {
      counter.current += 1;
      const key = `${counter.current}-${file.name}`;
      const kind = kindOfUpload(file.name, file.type);
      if (kind === "document") {
        // A scanned PDF is read as the deed or an old plan, into the title (stage 296); Claude reads its pages. Other documents aren't read.
        const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        if (pdf && file.size <= DEED_PDF_BYTES) {
          added.push({ key, name: file.name, size: file.size, kind: "sketch", photo: file, problem: null, deed: true, pdf: true });
          continue;
        }
        added.push({ key, name: file.name, size: file.size, kind, reason: pdf ? `This PDF is larger than ${DEED_PDF_BYTES / 1_000_000} MB. Scan it at a lower resolution, or photograph its pages.` : notReadYet(file.name) });
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

  // The office profile, from the formats the files are in and the last choice (ADR 0256).
  const formats = uploads.flatMap((u) => (u.kind === "survey-data" && u.read ? [u.read.format] : []));
  const resolution = resolveProfile(profiles, { formats, lastChosen: lastProfile });
  const profile = pick === "none" ? null : pick ? (profiles.find((p) => p.id === pick) ?? null) : resolution.chosen;
  // What's shown is what Generate sends: a traverse adjusted by least squares is weighed by the profile's total station (ADR 0274).
  const weight = useMemo(() => profilePrecision(profile), [profile]);
  const shown = useMemo(
    () =>
      weight
        ? uploads.map((u) => {
            if (u.kind !== "survey-data" || u.adjust !== "least_squares") return u;
            const r = readSurveyFile(u.name, u.content, crsById(crsId), u.adjust, weight);
            return r.ok ? { ...u, read: r.read, problem: null } : { ...u, read: null, problem: r.problem };
          })
        : uploads,
    [uploads, weight, crsId],
  );
  const data = shown.filter((u): u is Extract<Upload, { kind: "survey-data" }> => u.kind === "survey-data");
  const reads = data.flatMap((u) => (u.read ? [u.read] : []));
  const points = reads.flatMap((r) => r.points);
  const clashes = pointClashes(reads);
  // The same survey as its instrument file, printed list and drawing: said beside each file that repeats another (stage 252).
  // By the read itself, never its name: two uploads may share one.
  // What the files hold, worked out once per change of files, never per key typed in the name box (stage 293): the same survey as its
  // instrument file, printed list and drawing is said beside each file that repeats another (stage 252), by the read itself, never its
  // name; each point once, as it will be imported, is what the drawing and the list show; and the name the files give.
  const held = useMemo(() => {
    const rs = shown.flatMap((u) => (u.kind === "survey-data" && u.read ? [u.read] : []));
    const order = importOrder(rs);
    const together = readTogether(order);
    return {
      repeats: new Map(together.repeats.flatMap((x) => (x.count > 0 ? [[order[x.index]!, x] as const] : []))),
      unique: [...together.kept].map(([pointId, k], i) => ({ line: i + 1, pointId, e: k.e, n: k.n, z: k.z, code: k.code })),
      facts: jobFactsTogether(rs.map((r) => r.job)),
      // Filled in for the surveyor to keep or change; nothing until there's a file to name it from.
      suggested: rs.length > 0 ? startName("", rs, new Date()) : "",
    };
  }, [shown]);
  const { repeats, unique, facts, suggested } = held;
  const grid = crs ? gridProblem(points, crs) : null;
  // The grids the points do fit, offered as one press each when none of them fits the one shown; never chosen for the surveyor.
  const fits = crs && grid ? gridsThatFit(points, crs) : [];
  const crsRow = useRef<HTMLButtonElement>(null);
  const pickCrs = (id: string) => {
    chooseCrs(id);
    setChangingCrs(false);
    // The button pressed is gone once the warning clears: the keyboard goes on from the coordinate system now chosen.
    requestAnimationFrame(() => crsRow.current?.focus());
  };
  const problems = data.filter((u) => u.problem).length + clashes.length + (grid ? 1 : 0);
  const dataBytes = data.reduce((sum, u) => sum + u.content.length, 0);
  // More than one profile and nothing to tell them apart: asked once, never guessed (ADR 0256).
  const mustChoose = profiles.length > 1 && pick === null && !resolution.chosen && data.length > 0;
  // A profile's library longer than a plan keeps: the codes the files use first are kept, and the rest said.
  const profileLeftOut = profile?.body.codes ? libraryFor(profile.body.codes.entries, points.map((p) => p.code ?? "").filter(Boolean)).leftOut : 0;
  // Where the grid shown comes from, said only while it's true.
  const crsNote = profile?.body.crsId && crs?.id === profile.body.crsId ? `From the office profile ${profile.name}.` : crs && crs.id === lastCrsId ? "The one you confirmed on your last survey." : "";
  // Photos: field sketches, and the deed or an old plan the surveyor marks as such (stage 294), read into the title.
  const photos = uploads.filter((u): u is Extract<Upload, { kind: "sketch" }> => u.kind === "sketch");
  const sketches = photos.filter((u) => !u.deed);
  const deeds = photos.filter((u) => u.deed);
  const libraries = uploads.filter((u): u is Extract<Upload, { kind: "code-library" }> => u.kind === "code-library");
  const library = libraries.length === 1 && libraries[0]!.read.ok ? libraries[0]! : null;
  const libraryBlock = libraries.length > 1 ? "Use one code library at a time: remove the others." : libraries.some((u) => !u.read.ok) ? "Remove the code library marked below, or fix it." : null;
  // Photos are read only when Claude is available here and the surveyor agreed; otherwise they never hold up the plan.
  const reading = sketches.length > 0 && sketchOff === null && consent;
  const readingDeeds = deeds.length > 0 && sketchOff === null && consent;
  const sketchBytes = sketches.reduce((sum, u) => sum + (u.photo?.size ?? 0), 0);
  const readable = photos.filter((u) => u.photo).length;
  const sketchBlock = !(reading || readingDeeds)
    ? null
    : photos.some((u) => u.problem)
      ? "Remove the photo marked below, or untick reading the photos."
      : sketches.length > SKETCH_LIMITS.photos
        ? `Farbaek reads up to ${SKETCH_LIMITS.photos} sketches at a time. Remove some, or untick reading them.`
        : deeds.length > DEED_PHOTOS
          ? `Farbaek reads up to ${DEED_PHOTOS} photos or scans of the deed or old plan. Remove some, or untick reading them.`
          : deeds.reduce((sum, u) => sum + (u.photo?.size ?? 0), 0) > DEED_TOTAL_BYTES
            ? "The deed's photos and scans are too large together. Remove some, or untick reading them."
          : sketchBytes > SKETCH_LIMITS.totalBytes
            ? "The sketch photos are too large together. Remove some, or untick reading them."
            : null;
  // A photo is one or the other, chosen on its card.
  const markDeed = (key: string, deed: boolean) =>
    setUploads((now) => now.map((u) => (u.key === key && u.kind === "sketch" ? (deed ? { ...u, deed: true as const } : { key: u.key, name: u.name, size: u.size, kind: u.kind, photo: u.photo, problem: u.problem }) : u)));

  const blocked =
    disabledReason ??
    (libraryBlock && !drawn
      ? libraryBlock
      : drawn
      ? "The plan is drawn. Open it below."
      : data.length === 0
      ? "Add at least one survey data file: a points file or an instrument's job export."
      : mustChoose
        ? "Choose the office profile for this plan, or none."
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
    const titleFrom = readingDeeds ? deeds.flatMap((u) => (u.photo ? [{ name: u.name, photo: u.photo }] : [])) : [];
    startTransition(async () => {
      setPhase("drawing");
      // Marked as sent first: a refresh before the answer can't tell whether the plan was made, and the screen says so if they come back.
      if (key) await stage(key, toKept(uploads, title, crsId, Date.now()));
      // A request the server refuses before the action runs (too large to carry) comes back as a thrown error: said, not lost.
      const r = await generateSurveyPlanAction({ title: ownName ? title : suggested, crsId: crs.id, files: data.map((u) => ({ name: u.name, content: u.content, adjust: u.adjust })), library: library ? { name: library.name, content: library.content } : null, sketches: reading ? sketches.filter((u) => u.photo).length : 0, profileId: profile?.id ?? null }).catch(
        (): GenerateState => ({ status: "error", message: "The files couldn't be sent: they may be too large together. Generate from fewer files, then import the rest into the project.", problems: [] }),
      );
      if (r.status !== "done") {
        // A project made before a file failed to import is the place to finish: these files aren't kept as if nothing was made.
        if (r.status === "error" && r.projectId) {
          generated.current = true;
          if (key) void unstage(key);
        }
        setResult(r);
        return;
      }
      // The files are in the project now. The photos stay in this browser until their read is saved, so a read cut off by a refresh
      // or a dropped connection can be finished from the project without choosing them again (ADR 0258).
      generated.current = true;
      if (key) void unstage(key);
      const photosKey = userId && orgId ? sketchesKey(orgId, userId, r.projectId) : null;
      // The version each read builds on, and what to say before the plan opens when a read failed or found nothing.
      let version = r.version;
      let failed = false;
      let sketchRead: ReadOutcome = null;
      let deedRead: ReadOutcome = null;
      const said: string[] = [];
      if (toRead.length > 0) {
        setPhase("reading");
        setOpening(r.next);
        if (photosKey) await stage(photosKey, { v: 1, jobId: r.jobId, before: null, photos: toRead.map((s) => ({ name: s.name, blob: s.photo })) });
        const form = new FormData();
        form.set("projectId", r.projectId);
        form.set("baseVersion", String(r.version));
        form.set("consent", "yes");
        form.set("jobId", r.jobId ?? "");
        for (const s of toRead) form.append("photo", s.photo, s.name);
        const read = await readSketchesAction(form).catch(() => ({ status: "error" as const, message: "The connection dropped while the sketches were sent." }));
        if (read.status === "done" && photosKey) void unstage(photosKey);
        if (read.status === "error") {
          failed = true;
          sketchRead = "failed";
          said.push(`The sketches weren't read: ${read.message}`);
        } else if (read.status === "done") {
          version = read.version;
          // Nothing could be read: said here, where the sketches are, before the plan opens.
          sketchRead = read.readings === 0 ? "empty" : "read";
          if (read.readings === 0) said.push(read.message);
        }
      }
      // The deed or old plan into the title (stage 294), on the version the sketch's read saved.
      if (titleFrom.length > 0) {
        setPhase("title");
        setOpening(r.next);
        const form = new FormData();
        form.set("projectId", r.projectId);
        form.set("baseVersion", String(version));
        form.set("consent", "yes");
        for (const s of titleFrom) form.append("photo", s.photo, s.name);
        const title = await readTitleIntoPlanAction(form).catch(() => ({ status: "error" as const, message: "The connection dropped while the photos were sent." }));
        if (title.status === "error") {
          failed = true;
          deedRead = "failed";
          said.push(`The deed or old plan wasn't read: ${title.message}`);
        } else {
          deedRead = title.filled === 0 ? "empty" : "read";
          if (title.filled === 0) said.push(title.message);
        }
      }
      if (said.length > 0) {
        setDrawn({ next: r.next, failed, message: said.join(" "), sketch: sketchRead, deed: deedRead });
        return;
      }
      if (!left.current) router.push(r.next);
    });
  };

  /** What each file is now, in a badge and one sentence. */
  const state = (u: Upload): { status: "done" | "attention" | "working" | "pending" | "off"; label: string; text: string } => {
    if (u.kind === "document") return { status: "off", label: "Not read", text: u.reason };
    if (u.kind === "code-library") {
      if (!u.read.ok) return { status: "attention", label: "Needs a look", text: u.read.problem };
      const words = grammarForLibrary(u.name);
      return { status: "done", label: "Read", text: `${librarySummary(u.read, points.map((p) => p.code ?? ""))}${words ? ` Line words are read the ${GRAMMAR[words].label} way: ${GRAMMAR[words].words}.` : ""}` };
    }
    if (u.kind === "sketch") {
      if (u.problem) return { status: "attention", label: "Needs a look", text: u.problem };
      if (sketchOff) return { status: "off", label: "Not read", text: sketchOff };
      if (drawn) {
        const ended = u.deed ? drawn.deed : drawn.sketch;
        if (ended === "read") return { status: "done", label: "Read", text: "Read. Open the plan to see what it gave." };
        if (ended === "empty") return { status: "done", label: "Read", text: "Read, but nothing on it could be read." };
        return { status: "off", label: "Not read", text: "Not read. Open the plan to read it again from its Draft step." };
      }
      if (u.deed) {
        // The deed or an old plan (stage 294): read into the plan's title, never into its points or measurements.
        if (!consent) return { status: "off", label: "Not read", text: "Tick the box below to have Claude read the land's name, place and boundaries into the plan's title." };
        if (pending && phase === "title") return { status: "working", label: "Reading", text: "Claude is reading the land's name, place, boundaries and extent into the title." };
        return { status: "pending", label: "Read next", text: "Claude reads the land's name, place, boundaries and extent into the plan's title once the plan is drawn. Each fact waits for you to confirm it." };
      }
      if (!consent) return { status: "off", label: "Not read", text: "Tick the box below to have Claude read what's written on it." };
      if (pending && phase === "reading") return { status: "working", label: "Reading", text: "Claude is reading what's written on it." };
      if (pending && phase === "title") return { status: "working", label: "Reading", text: "The photos are being read: the plan opens when they're done." };
      return { status: "pending", label: "Read next", text: "Claude reads what's written on it once the plan is drawn, and Farbaek checks each measurement against your data." };
    }
    if (u.problem) return { status: "attention", label: "Needs a look", text: u.problem };
    if (u.read) {
      const same = repeats.get(u.read);
      return { status: "done", label: "Read", text: `${summary(u.read)}${same ? ` ${same.count === u.read.points.length ? "They're" : `${same.count} of them are`} the same as ${same.of.join(" and ")}'s, so each is imported once.` : ""}` };
    }
    return { status: "working", label: "Reading", text: `${size(u.size)}.` };
  };

  const dsr = drawsWithDsrList(points, commonCodes());
  // The code list the plan will be drawn with, for the list of points to judge codes by, as the server chooses it: an uploaded library,
  // else the profile's; the surveyor's carried list or the Survey Department's aren't known here, so codes aren't judged then.
  const planCodes = library?.read.ok ? library.read.entries : profile?.body.codes ? profile.body.codes.entries : carried.codes || dsr ? null : COMMON_CODES;

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
          <UploadSimpleIcon size={24} weight="bold" />
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

      {restored && uploads.length > 0 ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md bg-canvas-2 px-4 py-3 text-sm text-ink-2">
          <p className="flex min-w-0 items-start gap-2">
            <ArrowCounterClockwiseIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            <span>
              The {restored.count === 1 ? "file" : `${restored.count} files`} you chose before {restored.count === 1 ? "is" : "are"} back.{" "}
              {restored.sent ? (
                <>
                  Generate Plan had been pressed with {restored.count === 1 ? "it" : "them"}, so the plan may already be in your <Link href="/app/survey" className="font-medium text-accent underline-offset-2 hover:underline">survey projects</Link>: look there before generating again.
                </>
              ) : (
                `${restored.count === 1 ? "It stays" : "They stay"} in this browser until the plan is generated, for a week at most.`
              )}
            </span>
          </p>
          <button type="button" onClick={forget} className={buttonClasses("ghost", "sm")}>
            Start again
          </button>
        </div>
      ) : null}

      {uploads.length > 0 ? (
        <ul aria-label="Your files" className="grid gap-2">
          {shown.map((u) => (
            <li key={u.key} className="flex items-start gap-3 rounded-md border border-line bg-surface p-3 shadow-e1 sm:p-4">
              <span aria-hidden className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas-2 text-ink-2">
                {u.kind === "sketch" && !u.pdf ? <ImageIcon size={20} weight="bold" /> : <FileTextIcon size={20} weight="bold" />}
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
                {u.kind === "survey-data" && (u.adjust !== null || u.read?.reduction?.traverse) ? <TraverseChoice value={u.adjust} onChange={(m) => chooseAdjust(u.key, m)} disabled={pending || Boolean(drawn)} precision={weight} /> : null}
                {/* What a photo is (stage 294): a field sketch is read for its lines and measurements, the deed or an old plan into the title. */}
                {u.kind === "sketch" && u.photo && !u.pdf ? (
                  <div role="group" aria-label={`What ${u.name} is`} className="mt-1 inline-flex w-fit gap-1 rounded-full bg-canvas-2 p-1">
                    {([false, true] as const).map((deed) => (
                      <button
                        key={String(deed)}
                        type="button"
                        aria-pressed={Boolean(u.deed) === deed}
                        onClick={() => markDeed(u.key, deed)}
                        disabled={pending || Boolean(drawn)}
                        className={`tap min-h-10 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors duration-150 ${Boolean(u.deed) === deed ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}
                      >
                        {deed ? "Deed or old plan" : "Sketch"}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={() => remove(u.key)} aria-label={`Remove ${u.name}`} className="tap -mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-canvas-2 hover:text-ink">
                <XIcon size={16} weight="bold" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {unique.length > 0 ? <StartPreview points={unique} facts={facts} codes={planCodes} files={reads.length} sketch={reading ? "read" : sketches.length === 0 ? "none" : sketchOff ? "off" : "tick"} /> : null}

      {clashes.length > 0 || grid ? (
        <ul className="grid gap-2" aria-label="What needs you">
          {[...clashes, ...(grid ? [grid] : [])].map((p, n) => (
            <li key={n} className="flex items-start gap-2 text-sm text-ink">
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
              <span className="grid gap-2">
                <span>
                  {p.file ? <span className="font-medium">{p.file}: </span> : null}
                  {p.problem}
                </span>
                {p === grid && fits.length > 0 ? (
                  <span className="flex flex-wrap gap-2">
                    {fits.map((c) => (
                      <button key={c.id} type="button" onClick={() => pickCrs(c.id)} disabled={pending || Boolean(drawn)} className={buttonClasses("secondary", "sm")}>
                        Use {c.id === LOCAL_CRS.id ? "local coordinates" : c.name}
                      </button>
                    ))}
                  </span>
                ) : null}
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
              {crsNote ? <p className="text-sm text-ink-3">{crsNote}</p> : null}
            </div>
            <button ref={crsRow} type="button" onClick={() => setChangingCrs(true)} className={buttonClasses("ghost", "sm")}>
              <PencilSimpleIcon size={16} weight="bold" aria-hidden /> Change
            </button>
          </div>
        )}

        <div className="grid gap-1.5">
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>
              Project name <span className="font-normal text-ink-3">(optional)</span>
            </span>
            <input
              value={ownName ? title : suggested}
              maxLength={120}
              onChange={(e) => {
                setOwnName(true);
                setTitle(e.target.value);
              }}
              placeholder={suggested || "Name this survey"}
              aria-describedby={!ownName && suggested ? "start-name-note" : undefined}
              className={inputClasses()}
            />
          </label>
          {!ownName && suggested ? (
            <p id="start-name-note" className="text-sm text-ink-3">
              Named from your files. Change it if you like.
            </p>
          ) : null}
        </div>

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
        {profiles.length > 0 ? (
          <div className="grid gap-1.5">
            <label className="grid gap-1.5">
              <span className={LABEL_CLASSES}>Office profile</span>
              <select value={pick ?? resolution.chosen?.id ?? ""} onChange={(e) => setPick(e.target.value || null)} disabled={pending || Boolean(drawn)} className={inputClasses()}>
                {!resolution.chosen && pick === null ? <option value="">Choose one</option> : null}
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="none">None: start from my recent plans</option>
              </select>
            </label>
            <p className="text-sm text-ink-3">
              {profile ? `${profileSummary(profile)} ${pick === null ? resolution.why : "You chose it."}` : pick === "none" ? "The plan starts from your recent plans." : `${resolution.why} Choose the one for this plan.`}
            </p>
            {profile?.body.crsId && crs && profile.body.crsId !== crs.id ? (
              <p className="text-sm text-ink">
                The profile works in {crsById(profile.body.crsId)?.name}; the coordinate system chosen above is {crs.name}. The plan uses the one chosen above.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-3">
            Set up an{" "}
            <Link href="/app/survey/office" className="font-medium text-accent underline-offset-2 hover:underline">
              office profile
            </Link>{" "}
            once, and every new survey starts from your instruments, code library and sheet.
          </p>
        )}
        {library ? (
          <p className="text-sm text-ink-2">
            Codes: your office library, <span className="font-medium text-ink">{library.name}</span>, for you to check once on this plan.
          </p>
        ) : profile?.body.codes ? (
          <p className="text-sm text-ink-2">
            Codes: the profile&apos;s library ({profile.body.codes.entries.length} codes
            {profileLeftOut > 0 ? `, of which the ${profile.body.codes.entries.length - profileLeftOut} your files use first are kept` : ""}, {GRAMMAR[profile.body.codes.grammar].label} line words), taken as checked when it was saved.
          </p>
        ) : carried.codes ? (
          <p className="text-sm text-ink-2">
            Codes: the list you checked on <span className="font-medium text-ink">{carried.codes.from}</span> ({carried.codes.count} codes), for you to check once on this plan.
          </p>
        ) : null}
        {!profile?.body.codes && carried.grammar && !(library && grammarForLibrary(library.name)) ? (
          <p className="text-sm text-ink-2">
            Line words: read the {GRAMMAR[carried.grammar.id].label} way ({GRAMMAR[carried.grammar.id].words}), as on <span className="font-medium text-ink">{carried.grammar.from}</span>.
          </p>
        ) : null}
        {carried.habits ? (
          <p className="text-sm text-ink-2">
            Your sketch habits: {carried.habits.said.join("; ")}, as you said on <span className="font-medium text-ink">&ldquo;{carried.habits.from}&rdquo;</span>. Farbaek won&apos;t ask about those lines.
          </p>
        ) : null}
        {profile?.body.sheet ? (
          <p className="text-sm text-ink-2">
            Sheet: as in the profile ({profile.body.sheet.paper === "auto" ? "paper chosen to fit" : profile.body.sheet.paper}, {profile.body.sheet.orientation}).
          </p>
        ) : carried.sheet ? (
          <p className="text-sm text-ink-2">
            Sheet: laid out like your plan <span className="font-medium text-ink">&ldquo;{carried.sheet.from}&rdquo;</span> ({carried.sheet.paper === "auto" ? "paper chosen to fit" : carried.sheet.paper}, {carried.sheet.orientation}).
          </p>
        ) : null}
        {dsr && !library && !(profile?.body.codes ?? carried.codes) ? <p className="text-sm text-ink-2">These files use the Survey Department&apos;s codes (Chapter XXII), so the plan is drawn with its code list.</p> : null}
        {photos.length > 0 && !sketchOff ? (
          <label className="flex min-h-11 items-start gap-3 rounded-sm border border-line bg-canvas-2 p-3 text-sm text-ink">
            <input type="checkbox" checked={consent} disabled={pending || Boolean(drawn)} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
            <span className="grid gap-1">
              <span>
                Read my {deeds.length > 0 ? (sketches.length > 0 ? "photos" : deeds.length === 1 ? "deed or old plan" : "deed and old plan photos") : readable === 1 ? "sketch" : readable > 1 ? `${readable} sketches` : "sketches"} with Claude. {photos.some((u) => u.pdf) ? (readable === 1 ? "It goes" : "They go") : readable === 1 ? "The photo goes" : "The photos go"} to Anthropic, outside Sri Lanka, to be read.
                {sketches.length > 0 ? " When something is read, Farbaek keeps the sketch photos with this plan, so your team can see what each reading came from, until they're read again or the workspace is deleted." : ""}
                {deeds.length > 0 ? " Photos of the deed or an old plan aren't kept." : ""}
              </span>
              <span className="text-ink-3">Claude writes down what&apos;s written, as written. Farbaek&apos;s own checks compare every measurement with your survey data, and the plan shows only what differs. {aiCost}</span>
            </span>
          </label>
        ) : null}
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" onClick={generate} disabled={Boolean(blocked) || pending} aria-describedby="generate-note" className={buttonClasses("primary", "md", "w-full sm:w-auto")}>
            {pending ? (phase === "reading" ? "Reading your sketches…" : phase === "title" ? "Reading the deed…" : "Drawing your plan…") : "Generate Plan"}
          </button>
          <p id="generate-note" aria-live="polite" className="text-sm text-ink-3">
            {pending && phase === "reading"
              ? `The plan is drawn. Claude is reading ${sketches.length === 1 ? "your sketch" : `${sketches.length} sketches`}, which can take a minute.`
              : pending && phase === "title"
              ? "Claude is reading the deed or old plan into the plan's title, which can take a minute."
              : pending
              ? `Reading ${data.length} ${data.length === 1 ? "file" : "files"} again on Farbaek's server, importing ${points.length} ${points.length === 1 ? "point" : "points"} and drawing the plan${reading ? ", then reading the sketches" : ""}${readingDeeds ? `${reading ? " and" : ", then reading"} the deed` : ""}.`
              : blocked
                ? blocked
                : `Generate Plan confirms the points are in ${crs?.name}, and records that you confirmed it.`}
          </p>
        </div>
        {pending && (phase === "reading" || phase === "title") && opening ? (
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
              {drawn.failed ? <>Your plan is drawn and saved, but not everything on the photos was read. {drawn.message}</> : <>Your plan is drawn and saved. {drawn.message}</>}
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
