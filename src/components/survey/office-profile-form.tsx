"use client";

import { CheckCircleIcon, PlusIcon, TrashIcon, UploadSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { officeProfileFromPlanAction, saveOfficeProfileAction, type ProfileState } from "@/app/app/survey/actions";
import { LIBRARY_LIMITS, parseCodeLibrary } from "@/core/survey/codelib";
import { CRS_REGISTRY, LOCAL_CRS } from "@/core/survey/crs";
import { emptyDocument } from "@/core/survey/document";
import { GRAMMAR, GRAMMARS, grammarForLibrary, type GrammarId } from "@/core/survey/grammar";
import { IMPORT_FORMATS } from "@/core/survey/import/detect";
import { EQUIPMENT_KINDS, EQUIPMENT_LABEL, precisionFromText, type Equipment, type OfficeProfile, type OfficeProfileBody } from "@/core/survey/profile";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";

const CRS_OPTIONS = [...CRS_REGISTRY, LOCAL_CRS];

/** An instrument as the form edits it: its stated precision kept as typed until saved, so a half-typed figure isn't lost. */
type Row = Equipment & { typed: { angle: string; distance: string; ppm: string } };
const toRow = (e: Equipment): Row => ({ ...e, typed: { angle: e.precision ? String(e.precision.angleSeconds) : "", distance: e.precision ? String(e.precision.distanceMm) : "", ppm: e.precision ? String(e.precision.distancePpm) : "" } });
const NEW_ROW: Row = { kind: "total_station", make: "", model: "", exports: [], typed: { angle: "", distance: "", ppm: "" } };

/** The instruments as saved: a total station's precision when all three figures are given, a problem when only some are. */
function equipmentOf(rows: readonly Row[]): { ok: true; value: Equipment[] } | { ok: false; problem: string } {
  const out: Equipment[] = [];
  for (const r of rows) {
    const e: Equipment = { kind: r.kind, make: r.make, model: r.model, exports: r.exports };
    if (r.kind === "total_station") {
      const p = precisionFromText(r.typed.angle, r.typed.distance, r.typed.ppm);
      if (!p.ok) return { ok: false, problem: `${[r.make, r.model].filter(Boolean).join(" ") || "A total station"}: ${p.problem}` };
      if (p.value) e.precision = p.value;
    }
    out.push(e);
  }
  return { ok: true, value: out };
}
const SHEET_DEFAULT = (() => {
  const s = emptyDocument().settings;
  return { template: s.template, paper: s.paper, orientation: s.orientation, perchDecimals: s.perchDecimals, secondDecimals: s.secondDecimals, distanceDecimals: s.distanceDecimals, overleaf: s.overleaf, permitBox: s.permitBox, slant: s.slant, faceDimensions: s.faceDimensions };
})();

/**
 * One office profile, new or edited (stage 248, ADR 0256): the grid, the instruments and what they export, the office code library
 * and line words, the sheet and the statement. Saving makes a new version; nothing about a piece of land goes in.
 */
export function OfficeProfileForm({ profile, disabledReason }: { profile: OfficeProfile | null; disabledReason: string | null }) {
  const router = useRouter();
  const b = profile?.body;
  const [name, setName] = useState(profile?.name ?? "");
  const [crsId, setCrsId] = useState<string>(b?.crsId ?? "");
  const [equipment, setEquipment] = useState<Row[]>((b?.equipment ?? []).map(toRow));
  const [codes, setCodes] = useState<OfficeProfileBody["codes"]>(b?.codes ?? null);
  const [libraryNote, setLibraryNote] = useState<string | null>(null);
  const [sheet, setSheet] = useState<OfficeProfileBody["sheet"]>(b?.sheet ?? null);
  const [statement, setStatement] = useState(b?.statement ?? "");
  const [result, setResult] = useState<ProfileState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const picker = useRef<HTMLInputElement>(null);

  const setOne = (i: number, change: Partial<Row>) => setEquipment((now) => now.map((e, k) => (k === i ? { ...e, ...change } : e)));
  const setTyped = (i: number, change: Partial<Row["typed"]>) => setEquipment((now) => now.map((e, k) => (k === i ? { ...e, typed: { ...e.typed, ...change } } : e)));
  const loadLibrary = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > LIBRARY_LIMITS.bytes) return setLibraryNote(`${file.name} is larger than ${LIBRARY_LIMITS.bytes / 1_000} KB.`);
    const read = parseCodeLibrary(await file.text());
    if (!read.ok) return setLibraryNote(`${file.name}: ${read.problem}`);
    if (read.entries.length > 500) return setLibraryNote(`${file.name} holds ${read.entries.length} codes; a profile keeps up to 500.`);
    setCodes({ entries: read.entries, grammar: grammarForLibrary(file.name) ?? codes?.grammar ?? "farbaek" });
    setLibraryNote(`${read.entries.length} codes read from ${file.name}. Saving the profile records them as your office's checked list.`);
  };

  const instruments = equipmentOf(equipment);
  const save = () => {
    if (!instruments.ok) return setResult({ status: "error", message: instruments.problem });
    const body: OfficeProfileBody = { crsId: crsId || null, equipment: instruments.value, codes, sheet, statement: statement.trim() };
    startTransition(async () => {
      const r = await saveOfficeProfileAction({ profileId: profile?.id ?? null, baseVersion: profile?.version ?? null, name, body }).catch((): ProfileState => ({ status: "error", message: "The connection dropped while saving. Try again." }));
      setResult(r);
      if (r.status !== "done") return;
      // A new profile's form starts empty again, so a second press can't make a twin of the one just saved.
      if (!profile) {
        setName("");
        setCrsId("");
        setEquipment([]);
        setCodes(null);
        setLibraryNote(null);
        setSheet(null);
        setStatement("");
      }
      router.refresh();
    });
  };

  const off = disabledReason ?? (!name.trim() ? "Give the profile a name first." : !instruments.ok ? instruments.problem : null);
  const id = profile?.id ?? "new";

  return (
    <div className="grid gap-5">
      <label className="grid gap-1.5">
        <span className={LABEL_CLASSES}>Name</span>
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Sokkia CX office set-up" className={inputClasses()} />
      </label>

      <label className="grid gap-1.5">
        <span className={LABEL_CLASSES}>Coordinate system</span>
        <select value={crsId} onChange={(e) => setCrsId(e.target.value)} className={inputClasses()}>
          <option value="">Ask each time</option>
          {CRS_OPTIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-ink-3">Offered first on a new survey. You still confirm it with Generate Plan, and Farbaek checks the points fit it.</span>
      </label>

      <fieldset className="grid gap-3">
        <legend className={LABEL_CLASSES}>Instruments</legend>
        <p className="text-sm text-ink-3">What each exports lets Farbaek pick this profile when you upload those files.</p>
        {equipment.map((e, i) => (
          <div key={i} className="grid gap-3 rounded-md border border-line p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1.5">
                <span className={LABEL_CLASSES}>Kind</span>
                <select value={e.kind} onChange={(x) => setOne(i, { kind: x.target.value as Equipment["kind"] })} className={inputClasses()}>
                  {EQUIPMENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {EQUIPMENT_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className={LABEL_CLASSES}>Make</span>
                <input value={e.make} maxLength={40} onChange={(x) => setOne(i, { make: x.target.value })} placeholder="Sokkia" className={inputClasses()} />
              </label>
              <label className="grid gap-1.5">
                <span className={LABEL_CLASSES}>Model</span>
                <input value={e.model} maxLength={60} onChange={(x) => setOne(i, { model: x.target.value })} placeholder="CX-105" className={inputClasses()} />
              </label>
            </div>
            {e.kind === "total_station" ? (
              <fieldset className="grid gap-2">
                <legend className={`${LABEL_CLASSES} mb-1`}>Precision, as its specification states</legend>
                <div className="grid grid-cols-3 items-end gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-sm text-ink-2">Angles, seconds</span>
                    <input value={e.typed.angle} inputMode="decimal" maxLength={6} onChange={(x) => setTyped(i, { angle: x.target.value })} placeholder="5" className={inputClasses()} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-sm text-ink-2">Distances, mm</span>
                    <input value={e.typed.distance} inputMode="decimal" maxLength={6} onChange={(x) => setTyped(i, { distance: x.target.value })} placeholder="2" className={inputClasses()} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-sm text-ink-2">Plus ppm</span>
                    <input value={e.typed.ppm} inputMode="decimal" maxLength={6} onChange={(x) => setTyped(i, { ppm: x.target.value })} placeholder="2" className={inputClasses()} />
                  </label>
                </div>
                <span className="text-sm text-ink-3">Optional. Least squares weighs a traverse by it; without it, by a typical total station&apos;s, and the plan says so.</span>
              </fieldset>
            ) : null}
            <fieldset className="grid gap-2">
              <legend className={`${LABEL_CLASSES} mb-1`}>Files it exports</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {IMPORT_FORMATS.map((f) => (
                  <label key={f.id} className="flex min-h-11 items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={e.exports.includes(f.id)}
                      onChange={(x) => setOne(i, { exports: x.target.checked ? [...e.exports, f.id] : e.exports.filter((y) => y !== f.id) })}
                      className="size-5 shrink-0 accent-[var(--color-accent)]"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <button type="button" onClick={() => setEquipment((now) => now.filter((_, k) => k !== i))} className={buttonClasses("ghost", "sm")}>
                <TrashIcon size={16} weight="bold" aria-hidden /> Remove this instrument
              </button>
            </div>
          </div>
        ))}
        {equipment.length < 10 ? (
          <div>
            <button type="button" onClick={() => setEquipment((now) => [...now, NEW_ROW])} className={buttonClasses("secondary", "sm")}>
              <PlusIcon size={16} weight="bold" aria-hidden /> Add an instrument
            </button>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className={LABEL_CLASSES}>Code library</legend>
        <p className="text-sm text-ink-2">{codes ? `${codes.entries.length} codes, line words read the ${GRAMMAR[codes.grammar].label} way. A plan started from this profile takes them as checked.` : "None: new plans start from Farbaek's common list, for you to check."}</p>
        {libraryNote ? <p className="text-sm text-ink-3">{libraryNote}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => picker.current?.click()} className={buttonClasses("secondary", "sm")}>
            <UploadSimpleIcon size={16} weight="bold" aria-hidden /> {codes ? "Replace the library" : "Load a code library (CSV or .fcl)"}
          </button>
          {codes ? (
            <>
              <select aria-label="How the crew writes line words" value={codes.grammar} onChange={(e) => setCodes({ ...codes, grammar: e.target.value as GrammarId })} className={inputClasses("w-auto")}>
                {GRAMMARS.map((g) => (
                  <option key={g} value={g}>
                    {GRAMMAR[g].label} line words
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setCodes(null)} className={buttonClasses("ghost", "sm")}>
                <TrashIcon size={16} weight="bold" aria-hidden /> Remove the library
              </button>
            </>
          ) : null}
          <input ref={picker} type="file" accept=".csv,.txt,.fcl" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void loadLibrary(e.target.files?.[0]).then(() => (e.target.value = ""))} />
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className={LABEL_CLASSES}>Sheet</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
          <input type="checkbox" checked={sheet !== null} onChange={(e) => setSheet(e.target.checked ? SHEET_DEFAULT : null)} className="size-5 shrink-0 accent-[var(--color-accent)]" />
          Set the sheet&apos;s presentation for new plans
        </label>
        {sheet ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5">
              <span className={LABEL_CLASSES}>Layout</span>
              <select value={sheet.template} onChange={(e) => setSheet({ ...sheet, template: e.target.value as typeof sheet.template })} className={inputClasses()}>
                <option value="classic">Classic Sri Lankan plan</option>
                <option value="panel">Panel layout</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className={LABEL_CLASSES}>Paper</span>
              <select value={sheet.paper} onChange={(e) => setSheet({ ...sheet, paper: e.target.value as typeof sheet.paper })} className={inputClasses()}>
                <option value="auto">Chosen to fit</option>
                <option value="A4">A4</option>
                <option value="A3">A3</option>
                <option value="A2">A2</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className={LABEL_CLASSES}>Orientation</span>
              <select value={sheet.orientation} onChange={(e) => setSheet({ ...sheet, orientation: e.target.value as typeof sheet.orientation })} className={inputClasses()}>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            {(
              [
                ["overleaf", "Boundaries schedule overleaf"],
                ["faceDimensions", "Bearings and distances on the face"],
                ["slant", "Slanted lettering"],
                ["permitBox", "Development permit box"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex min-h-11 items-center gap-3 text-sm text-ink sm:col-span-3">
                <input type="checkbox" checked={sheet[k]} onChange={(e) => setSheet({ ...sheet, [k]: e.target.checked })} className="size-5 shrink-0 accent-[var(--color-accent)]" />
                {label}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-3">New plans start from the presentation on your latest plan, or Farbaek&apos;s.</p>
        )}
      </fieldset>

      <label className="grid gap-1.5">
        <span className={LABEL_CLASSES}>
          Statement on the plan <span className="font-normal text-ink-3">(optional)</span>
        </span>
        <input value={statement} maxLength={200} onChange={(e) => setStatement(e.target.value)} placeholder="The boundaries were surveyed as pointed out by the land owner" className={inputClasses()} />
      </label>

      <div className="grid gap-2">
        <div>
          <button type="button" onClick={save} disabled={Boolean(off) || pending} className={buttonClasses("primary", "md")}>
            {pending ? "Saving…" : profile ? "Save a new version" : "Save the profile"}
          </button>
        </div>
        <p aria-live="polite" id={`profile-status-${id}`} className="text-sm text-ink-3">
          {off && !pending ? off : null}
        </p>
        {result.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm font-medium text-ink">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            {result.message}
          </p>
        ) : result.status === "done" ? (
          <p role="status" className="flex items-start gap-2 text-sm text-ink">
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            {result.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Starts a profile from one of the workspace's plans (stage 248): what the surveyor already set up there. */
export function ProfileFromPlan({ plans, disabledReason }: { plans: { id: string; name: string }[]; disabledReason: string | null }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(plans[0]?.id ?? "");
  const [name, setName] = useState("");
  const [result, setResult] = useState<ProfileState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const start = () =>
    startTransition(async () => {
      const r = await officeProfileFromPlanAction({ projectId, name }).catch((): ProfileState => ({ status: "error", message: "The connection dropped. Try again." }));
      setResult(r);
      if (r.status === "done") router.refresh();
    });
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Plan</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClasses()}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>
            Profile name <span className="font-normal text-ink-3">(optional)</span>
          </span>
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Set up as on that plan" className={inputClasses()} />
        </label>
      </div>
      <div>
        <button type="button" onClick={start} disabled={Boolean(disabledReason) || pending || !projectId} className={buttonClasses("secondary", "md")}>
          {pending ? "Starting…" : "Start a profile from this plan"}
        </button>
      </div>
      {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      {result.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm font-medium text-ink">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          {result.message}
        </p>
      ) : result.status === "done" ? (
        <p role="status" className="flex items-start gap-2 text-sm text-ink">
          <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
