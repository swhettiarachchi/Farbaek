"use client";

import { CaretDownIcon, FileZipIcon, WarningCircleIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { startTransition, useActionState, useId, useRef, useState, useTransition } from "react";
import { destinationFileAction, destinationHashesAction, type CapsuleImportState, type FileResult } from "@/app/app/mesh/actions";
import { imageMime, isImagePath } from "@/core/workspace/images";
import { ProofPackSeal } from "@/components/proof/proofpack-seal";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { LocalTime } from "@/components/ui/local-time";
import { StatusGlyph } from "@/components/ui/status-badge";
import { CAPSULE_LIMITS } from "@/config/workspace";
import { openCapsule, planImport, type CapsuleFile, type ImportChoice, type OpenedCapsule, type PlannedFile } from "@/core/mesh/capsule";
import { SKIP_LABELS, formatBytes, type SkipReason } from "@/core/workspace/files";

const Surface = dynamic(() => import("@/components/files/codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 items-center justify-center rounded-sm border border-line bg-surface-raised text-sm text-ink-3" role="status">
      Loading the comparison…
    </div>
  ),
});

export interface Destination {
  id: string;
  name: string;
}

const CHOICES: { value: ImportChoice; label: string }[] = [
  { value: "keep_mine", label: "Keep mine" },
  { value: "take", label: "Use Capsule's" },
  { value: "keep_both", label: "Keep both" },
];

/** Differing files listed before "Show all". */
const FIRST_ROWS = 30;

const reasonLabel = (reason: string) => (reason in SKIP_LABELS ? SKIP_LABELS[reason as SkipReason] : "Left out");
const blake3Short = (hex: string) => `blake3:${hex.slice(0, 8)}…${hex.slice(-6)}`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * Open a Capsule: it's unpacked and every byte is hashed again here in the
 * browser, so a damaged or altered file is caught before anything is sent.
 * The server checks it all again before writing; this report is a preview,
 * that check is the decision. Files that differ from an existing project are
 * decided one by one and default to keeping yours.
 */
export function CapsuleOpen({ destinations, disabledReason }: { destinations: Destination[]; disabledReason: string | null }) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [opened, setOpened] = useState<OpenedCapsule | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [plan, setPlan] = useState<PlannedFile[] | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planning, startPlanning] = useTransition();
  const [choices, setChoices] = useState<Record<string, ImportChoice>>({});
  const [showAll, setShowAll] = useState(false);
  const [state, dispatch, importing] = useActionState<CapsuleImportState, FormData>(importViaRoute, { status: "idle" });
  const [submitted, setSubmitted] = useState(false);
  // Only the latest destination may set the plan, however the replies arrive.
  const latestTarget = useRef("");

  function resetDestination() {
    setTarget("");
    setPlan(null);
    setPlanError(null);
    setChoices({});
    setShowAll(false);
    latestTarget.current = "";
  }

  async function onFile(next: File | undefined) {
    setFile(null);
    setOpened(null);
    setError(null);
    setSubmitted(false);
    resetDestination();
    if (!next) return;
    if (next.size > CAPSULE_LIMITS.maxTotalBytes + 512 * 1024) {
      setError(`This file is ${formatBytes(next.size)}. Capsules up to ${formatBytes(CAPSULE_LIMITS.maxTotalBytes)} can be opened here; larger ones will travel with nearby transfer.`);
      return;
    }
    setReading(true);
    try {
      const result = await openCapsule(new Uint8Array(await next.arrayBuffer()), CAPSULE_LIMITS);
      setOpened(result);
      if (result.ok) {
        setFile(next);
        setName(result.manifest.source.projectName.slice(0, 80));
      }
    } catch {
      setError("This file couldn't be read. Choose a .capsule.zip downloaded from Farbaek.");
    } finally {
      setReading(false);
    }
  }

  function chooseTarget(projectId: string) {
    resetDestination();
    setSubmitted(false);
    setTarget(projectId);
    latestTarget.current = projectId;
    if (!projectId || !opened?.ok) return;
    const manifest = opened.manifest;
    startPlanning(async () => {
      const r = await destinationHashesAction(projectId);
      if (latestTarget.current !== projectId) return;
      if (r.status === "error") setPlanError(r.message);
      else setPlan(planImport(manifest, r.files));
    });
  }

  function choose(path: string, choice: ImportChoice) {
    setChoices((c) => {
      const next = { ...c };
      if (choice === "keep_mine") delete next[path];
      else next[path] = choice;
      return next;
    });
  }

  const differing = plan?.filter((p) => p.status === "differs") ?? [];
  const added = plan?.filter((p) => p.status === "new").length ?? 0;
  const unchanged = plan?.filter((p) => p.status === "unchanged").length ?? 0;
  const replacing = differing.filter((p) => (choices[p.path] ?? "keep_mine") !== "keep_mine").length;
  const toWrite = added + replacing;

  function chooseAll(choice: ImportChoice) {
    setChoices(choice === "keep_mine" ? {} : Object.fromEntries(differing.map((p) => [p.path, choice])));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || !opened?.ok) return;
    const form = new FormData();
    form.set("capsule", file);
    if (mode === "new") {
      form.set("destination", "new");
      form.set("name", name);
    } else {
      form.set("destination", target);
      form.set("choices", JSON.stringify(choices));
    }
    setSubmitted(true);
    startTransition(() => dispatch(form));
  }

  const blockedReason =
    disabledReason ??
    (mode === "existing" && !target
      ? "Choose the project to import into."
      : mode === "existing" && plan && toWrite === 0
        ? "Everything you chose is already in this project, so there's nothing to write."
        : mode === "new" && !name.trim()
          ? "Give the new project a name."
          : null);
  const canImport = blockedReason === null && !importing && !planning && (mode === "new" || plan !== null);
  const result = submitted && !importing ? state : null;

  return (
    <div className="grid gap-5">
      <label
        className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-line-strong/50 bg-surface px-6 py-8 text-center transition-colors duration-150 hover:border-accent/60 has-focus-visible:outline-2 has-focus-visible:outline-accent ${reading || importing ? "pointer-events-none opacity-60" : ""}`}
      >
        <FileZipIcon size={32} className="text-accent" aria-hidden />
        <span className="text-body font-medium">{reading ? "Checking every file…" : opened ? "Choose a different Capsule" : "Choose a Capsule"}</span>
        <span className="text-sm text-ink-3">A .capsule.zip from Farbaek, up to {formatBytes(CAPSULE_LIMITS.maxTotalBytes).replace(" ", "\u00a0")}. It&apos;s checked here before anything is sent.</span>
        <input type="file" accept=".zip,application/zip" className="sr-only" disabled={reading || importing} onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> {error}
        </p>
      ) : null}

      {opened && !opened.ok ? (
        <div role="alert" className="grid gap-3 rounded-sm border border-failed/30 bg-failed/[0.04] px-4 py-4">
          <p className="flex items-start gap-2 text-body font-medium text-failed">
            <StatusGlyph status="failed" size={20} className="mt-px" />
            This Capsule didn&apos;t pass its checks, so it can&apos;t be opened.
          </p>
          <ul className="grid gap-1.5 pl-7 text-sm text-ink-2">
            {opened.problems.map((p, i) => (
              <li key={i} className="list-disc break-words">
                {p}
              </li>
            ))}
          </ul>
          <p className="pl-7 text-xs text-ink-3">Nothing was sent or written. Ask for a fresh Capsule, downloaded again from Farbaek.</p>
        </div>
      ) : null}

      {opened?.ok ? (
        <div className="grid gap-6 motion-safe:animate-[usage-in_220ms_cubic-bezier(0.16,1,0.3,1)_both]">
          <Report opened={opened} />

          <form onSubmit={submit} className="grid gap-5 border-t border-line pt-5">
            <fieldset className="grid min-w-0 gap-2" disabled={importing}>
              <legend className="mb-2 text-sm font-medium">Where should the files go?</legend>
              <div className="inline-flex w-full rounded-full border border-line bg-surface p-1 shadow-e1 sm:w-auto">
                {(
                  [
                    ["new", "New project"],
                    ["existing", "Existing project"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="relative flex-1 sm:flex-none">
                    <input
                      type="radio"
                      name={`${id}-mode`}
                      value={value}
                      checked={mode === value}
                      onChange={() => {
                        setMode(value);
                        setSubmitted(false);
                        resetDestination();
                      }}
                      className="peer sr-only"
                    />
                    <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-full px-4 text-sm text-ink-2 transition-colors duration-[160ms] peer-checked:bg-primary peer-checked:font-medium peer-checked:text-on-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {mode === "new" ? (
              <label className="grid gap-1.5">
                <span className={LABEL_CLASSES}>Project name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  required
                  disabled={importing}
                  className={inputClasses("min-w-0")}
                />
                <span className="text-xs text-ink-3">Every file in the Capsule goes into a new project in this workspace.</span>
              </label>
            ) : destinations.length === 0 ? (
              <p className="text-sm text-ink-2">There are no active projects to import into. Open the Capsule as a new project instead.</p>
            ) : (
              <div className="grid gap-4">
                <label className="grid gap-1.5" htmlFor={`${id}-target`}>
                  <span className={LABEL_CLASSES}>Project</span>
                  <select
                    id={`${id}-target`}
                    value={target}
                    onChange={(e) => chooseTarget(e.target.value)}
                    disabled={importing}
                    className={inputClasses("min-w-0")}
                  >
                    <option value="">Choose a project</option>
                    {destinations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>

                {planning ? (
                  <p role="status" className="flex items-start gap-2 text-sm text-ink-3">
                    <StatusGlyph status="working" size={16} className="mt-0.5" />
                    <span>Comparing with the project&apos;s files…</span>
                  </p>
                ) : null}
                {planError ? (
                  <p role="alert" className="flex items-start gap-2 text-sm text-failed">
                    <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> {planError}
                  </p>
                ) : null}

                {plan ? (
                  <div className="grid gap-4" aria-live="polite">
                    <ul className="grid gap-2 text-sm sm:grid-cols-3">
                      <PlanCount value={added} label={added === 1 ? "new file, added" : "new files, added"} />
                      <PlanCount value={unchanged} label="already the same, left alone" />
                      <PlanCount value={differing.length} label={differing.length === 1 ? "differs, your choice" : "differ, your choice"} />
                    </ul>

                    {differing.length > 0 ? (
                      <div className="grid gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-ink-2">For every file that differs:</span>
                          {CHOICES.map((c) => (
                            <button key={c.value} type="button" onClick={() => chooseAll(c.value)} disabled={importing} className={buttonClasses("secondary", "sm")}>
                              {c.label}
                            </button>
                          ))}
                        </div>
                        <ul className="grid">
                          {(showAll ? differing : differing.slice(0, FIRST_ROWS)).map((p, i) => (
                            <DiffRow
                              key={p.path}
                              group={`${id}-f${i}`}
                              path={p.path}
                              projectId={target}
                              capsuleFile={opened.files.find((f) => f.path === p.path)}
                              choice={choices[p.path] ?? "keep_mine"}
                              onChoose={(c) => choose(p.path, c)}
                              disabled={importing}
                            />
                          ))}
                        </ul>
                        {!showAll && differing.length > FIRST_ROWS ? (
                          <button type="button" onClick={() => setShowAll(true)} className={buttonClasses("ghost", "sm", "justify-self-start")}>
                            Show all {differing.length.toLocaleString("en-US")} differing files
                          </button>
                        ) : null}
                        <p className="text-xs leading-relaxed text-ink-3">
                          Keep both saves the Capsule&apos;s version next to yours, as <span className="font-mono">name.capsule.ext</span>. Replacing a file adds a new revision; the earlier one stays restorable.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="submit" disabled={!canImport} className={buttonClasses("primary", "sm")}>
                {importing ? "Checking and importing…" : mode === "new" ? "Open as a new project" : plan ? `Import ${plural(toWrite, "file", "files")}` : "Import"}
              </button>
              {blockedReason ? <p className="text-xs text-ink-3">{blockedReason}</p> : <p className="text-xs text-ink-3">The server checks every hash again before it writes anything.</p>}
            </div>
          </form>

          {result?.status === "done" ? (
            <div role="status" className="grid gap-2 rounded-sm border border-verified/30 bg-verified/[0.05] px-4 py-4">
              <p className="flex items-start gap-2 text-body">
                <StatusGlyph status="verified" size={20} className="mt-px" />
                <span>
                  <span className="font-medium">Imported.</span> {plural(result.written, "file", "files")} written
                  {result.unchanged > 0 ? `, ${result.unchanged.toLocaleString("en-US")} already the same` : ""}
                  {result.kept > 0 ? `, ${result.kept.toLocaleString("en-US")} kept as yours` : ""}.
                </span>
              </p>
              {!result.recorded ? <p className="pl-7 text-xs text-ink-3">The files are in, but the entry in this page&apos;s history couldn&apos;t be saved.</p> : null}
              <Link href={`/app/projects/${result.projectId}/files`} className={buttonClasses("secondary", "sm", "ml-7 justify-self-start")}>
                Open the project
              </Link>
            </div>
          ) : null}

          {result?.status === "error" ? (
            <div role="alert" className="grid gap-2 rounded-sm border border-failed/30 bg-failed/[0.04] px-4 py-4 text-sm">
              <p className="flex items-start gap-2 text-failed">
                <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> {result.message}
              </p>
              {result.problems?.length ? (
                <ul className="grid gap-1 pl-6 text-ink-2">
                  {result.problems.map((p, i) => (
                    <li key={i} className="list-disc break-words">
                      {p}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The verification report for a Capsule that passed every check. */
function Report({ opened }: { opened: Extract<OpenedCapsule, { ok: true }> }) {
  const { manifest, digest } = opened;
  const images = manifest.files.filter((f) => isImagePath(f.path)).length;
  const byReason = new Map<string, string[]>();
  for (const e of manifest.excluded) byReason.set(e.reason, [...(byReason.get(e.reason) ?? []), e.path]);
  return (
    <div className="grid gap-5 sm:grid-cols-[132px_minmax(0,1fr)] sm:items-start">
      <ProofPackSeal hash={digest} caption="Capsule verified" hashText={blake3Short(digest)} size={132} idSuffix="-open" className="size-[132px] justify-self-center sm:justify-self-start" />
      <div className="grid min-w-0 gap-3">
        <p className="flex items-start gap-2 text-body">
          <StatusGlyph status="verified" size={20} className="mt-px" />
          <span>
            <span className="font-medium">Every file matches its hash.</span> {plural(manifest.totals.files, "file", "files")}, {formatBytes(manifest.totals.bytes)}
            {images > 0 ? `, with ${plural(images, "image", "images")}, each the kind its name says` : ", all text"}. Nothing in a Capsule runs or installs.
          </span>
        </p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="text-ink-3">From</dt>
          <dd className="min-w-0 break-words">{manifest.source.projectName}</dd>
          <dt className="text-ink-3">Packed</dt>
          <dd>
            <LocalTime iso={manifest.createdAt} />
          </dd>
        </dl>
        <details className="text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center text-ink-2">Technical details</summary>
          <p className="text-xs text-ink-3">
            The Capsule&apos;s BLAKE3 digest: <span className="break-all font-mono">blake3:{digest}</span>
          </p>
        </details>
        {manifest.note ? (
          <p className="rounded-sm border border-line bg-surface-raised/50 px-3.5 py-2.5 text-sm text-ink-2">
            <span className="block text-xs text-ink-3">Note from whoever packed it</span>
            <span className="break-words">{manifest.note}</span>
          </p>
        ) : null}
        {manifest.excluded.length > 0 ? (
          <details className="rounded-sm border border-line bg-surface-raised/50 px-4 py-1 text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium">{plural(manifest.excluded.length, "file was", "files were")} left out when it was packed</summary>
            <ul className="mb-2 mt-1 grid gap-3">
              {[...byReason].map(([reason, paths]) => (
                <li key={reason}>
                  <p className="text-ink-2">
                    {reasonLabel(reason)} <span className="text-ink-3 tabular">({paths.length.toLocaleString("en-US")})</span>
                  </p>
                  <ul className="mt-1 grid gap-0.5 font-mono text-xs text-ink-3">
                    {paths.slice(0, 8).map((p) => (
                      <li key={p} className="truncate" title={p}>
                        {p}
                      </li>
                    ))}
                    {paths.length > 8 ? <li>and {(paths.length - 8).toLocaleString("en-US")} more</li> : null}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function PlanCount({ value, label }: { value: number; label: string }) {
  return (
    <li className="flex items-baseline gap-2 rounded-sm border border-line px-3.5 py-2.5">
      <span className="text-lg font-medium tabular">{value.toLocaleString("en-US")}</span>
      <span className="text-ink-2">{label}</span>
    </li>
  );
}

/** One file that differs: the choice, and a comparison of both versions on request. */
function DiffRow({
  group,
  path,
  projectId,
  capsuleFile,
  choice,
  onChoose,
  disabled,
}: {
  group: string;
  path: string;
  projectId: string;
  capsuleFile: CapsuleFile | undefined;
  choice: ImportChoice;
  onChoose: (c: ImportChoice) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<FileResult | null>(null);
  const [loading, startLoading] = useTransition();

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !mine) startLoading(async () => setMine(await destinationFileAction(projectId, path)));
  }

  return (
    <li className="grid gap-3 border-t border-line py-3 first:border-t-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate font-mono text-xs" title={path}>
            {path}
          </p>
          <button type="button" onClick={toggle} aria-expanded={open} className={buttonClasses("ghost", "sm", "shrink-0")}>
            {open ? "Hide" : "Compare"}
            <CaretDownIcon size={14} weight="bold" aria-hidden className={`motion-safe:transition-transform motion-safe:duration-150 ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
        <fieldset disabled={disabled} className="min-w-0 shrink-0">
          <legend className="sr-only">What to do with {path}</legend>
          <div className="inline-flex w-full rounded-full border border-line bg-surface p-1 sm:w-auto">
            {CHOICES.map((c) => (
              <label key={c.value} className="relative flex-1 sm:flex-none">
                <input type="radio" name={group} value={c.value} checked={choice === c.value} onChange={() => onChoose(c.value)} className="peer sr-only" />
                <span className="flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-2 text-sm sm:px-3 text-ink-2 transition-colors duration-[160ms] peer-checked:bg-primary peer-checked:font-medium peer-checked:text-on-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                  {c.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {open ? (
        <div className="grid min-w-0 gap-2">
          {loading || !mine ? (
            <p role="status" className="text-sm text-ink-3">
              Loading your version…
            </p>
          ) : mine.status === "error" ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-failed">
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
              <span>{mine.message}</span>
            </p>
          ) : mine.status === "missing" || !capsuleFile ? (
            <p className="text-sm text-ink-2">This file has changed since the comparison started. Choose the project again to refresh it.</p>
          ) : typeof capsuleFile.content !== "string" ? (
            <ImageCompare path={path} capsule={capsuleFile.content} mine={mine.encoding === "base64" ? mine.content : null} />
          ) : (
            <>
              <p className="text-xs text-ink-3">What taking the Capsule&apos;s version would change: lines it adds are marked as added, lines only in yours as removed.</p>
              <Surface path={path} value={capsuleFile.content} original={mine.content} controls={false} label={`Your version of ${path} compared with the Capsule's`} />
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

/** Sends the Capsule to its own upload route (stage 179). The server opens and checks it again, whatever this page found. */
async function importViaRoute(_previous: CapsuleImportState, form: FormData): Promise<CapsuleImportState> {
  try {
    const response = await fetch("/app/mesh/import", { method: "POST", body: form });
    const body: unknown = await response.json().catch(() => null);
    if (body && typeof body === "object" && "status" in body) return body as CapsuleImportState;
    return { status: "error", message: "The Capsule couldn't be opened just now. Nothing was written. Try again." };
  } catch {
    return { status: "error", message: "The upload didn't reach Farbaek. Check your connection, then try again." };
  }
}

/** An image's bytes as base64, in pieces small enough for the browser's own encoder. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Two versions of an image side by side: yours and the Capsule's. */
function ImageCompare({ path, capsule, mine }: { path: string; capsule: Uint8Array; mine: string | null }) {
  const mime = imageMime(path) ?? "image/png";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <figure className="grid gap-2 rounded-sm border border-line bg-surface p-3">
        {mine ? (
          // eslint-disable-next-line @next/next/no-img-element -- the project's own image, from its stored bytes
          <img src={`data:${mime};base64,${mine}`} alt={`Your version of ${path}`} className="mx-auto max-h-64 w-auto max-w-full" />
        ) : (
          <p className="text-sm text-ink-3">Your version isn&apos;t an image.</p>
        )}
        <figcaption className="text-xs text-ink-3">Yours</figcaption>
      </figure>
      <figure className="grid gap-2 rounded-sm border border-line bg-surface p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- the Capsule's image, checked by its bytes before it's shown */}
        <img src={`data:${mime};base64,${bytesToBase64(capsule)}`} alt={`The Capsule's version of ${path}`} className="mx-auto max-h-64 w-auto max-w-full" />
        <figcaption className="text-xs text-ink-3">The Capsule&apos;s</figcaption>
      </figure>
    </div>
  );
}
