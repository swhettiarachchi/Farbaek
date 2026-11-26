"use client";

import { CheckCircleIcon, WarningCircleIcon } from "@/components/icons";
import { useActionState, useState } from "react";
import { CRS_REGISTRY, LOCAL_CRS } from "@/core/survey/crs";
import { approveSurveyAction, createSurveyProjectAction, setSurveyorProfileAction, updateSurveyProjectAction, type SurveyFormState } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses, textareaClasses } from "@/components/ui/field";

const IDLE: SurveyFormState = { status: "idle" };
const CRS_OPTIONS = [...CRS_REGISTRY, LOCAL_CRS];

function Result({ state }: { state: SurveyFormState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={`flex items-start gap-2 text-sm ${state.status === "error" ? "text-failed" : "text-ink"}`}>
      {state.status === "error" ? <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> : <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />}
      {state.message}
    </p>
  );
}

function CrsChoice({ name, defaultValue, disabled }: { name: string; defaultValue: string; disabled?: boolean }) {
  const [value, setValue] = useState(defaultValue);
  const crs = CRS_OPTIONS.find((c) => c.id === value);
  return (
    <div className="grid gap-2">
      <label className="grid gap-1.5">
        <span className={LABEL_CLASSES}>Coordinate system of the points</span>
        <select name={name} value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} className={inputClasses()}>
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
      </label>
      {crs ? (
        <p className="text-sm text-ink-3">
          {crs.datum}. {crs.projection}.
        </p>
      ) : (
        <p className="text-sm text-ink-3">Farbaek never works this out from the numbers: several Sri Lankan and UTM grids overlap.</p>
      )}
    </div>
  );
}

export function NewSurveyProjectForm({ disabledReason }: { disabledReason: string | null }) {
  const [state, action, pending] = useActionState(createSurveyProjectAction, IDLE);
  return (
    <form action={action} className="grid gap-5">
      <label className="grid gap-1.5">
        <span className={LABEL_CLASSES}>Project name</span>
        <input name="name" required maxLength={120} disabled={Boolean(disabledReason)} placeholder="Lot 1 boundary survey" className={inputClasses()} />
      </label>
      <fieldset className="grid gap-2">
        <legend className={`${LABEL_CLASSES} mb-1.5`}>Plan type</legend>
        <label className="flex min-h-11 items-center gap-3 rounded-sm border border-accent bg-surface px-3 text-sm text-ink ring-1 ring-accent">
          <input type="radio" name="planType" value="cadastral" defaultChecked className="size-4 accent-[var(--color-accent)]" />
          Land survey plan (cadastral boundary)
        </label>
        <p className="text-sm text-ink-3">Subdivision, topographic, engineering and road plans come in later stages of Survey Studio, each with its own engine.</p>
      </fieldset>
      <CrsChoice name="crs" defaultValue="" disabled={Boolean(disabledReason)} />
      <label className="flex min-h-11 items-start gap-3 rounded-sm border border-line bg-canvas-2 p-3 text-sm text-ink">
        <input type="checkbox" name="confirm" value="yes" required disabled={Boolean(disabledReason)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
        <span>I confirm the survey&apos;s coordinates are in this coordinate system. The project records that I confirmed it.</span>
      </label>
      <Result state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary", "md")}>
          {pending ? "Creating…" : "Create survey project"}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </div>
    </form>
  );
}

export function SurveyProjectSettingsForm({ projectId, name, crsId, confirmed, disabledReason }: { projectId: string; name: string; crsId: string; confirmed: boolean; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(updateSurveyProjectAction, IDLE);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="grid gap-1.5">
        <span className={LABEL_CLASSES}>Project name</span>
        <input name="name" required maxLength={120} defaultValue={name} disabled={Boolean(disabledReason)} className={inputClasses()} />
      </label>
      <CrsChoice name="crs" defaultValue={crsId} disabled={Boolean(disabledReason)} />
      <label className="flex min-h-11 items-start gap-3 rounded-sm border border-line bg-canvas-2 p-3 text-sm text-ink">
        <input type="checkbox" name="confirm" value="yes" defaultChecked={false} disabled={Boolean(disabledReason)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
        <span>{confirmed ? "Confirm again, as me." : "I confirm the coordinates are in this coordinate system."} Changing the system without confirming clears the confirmation.</span>
      </label>
      <Result state={state} />
      <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("secondary", "sm", "justify-self-start")}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

export function SurveyorProfileForm({ profile, disabledReason }: { profile: { full_name: string; designation: string; registration: string; address: string; contact: string } | null; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(setSurveyorProfileAction, IDLE);
  const field = (name: string, label: string, max: number, value: string, hint?: string) => (
    <label className="grid gap-1.5">
      <span className={LABEL_CLASSES}>{label}</span>
      <input name={name} maxLength={max} defaultValue={value} disabled={Boolean(disabledReason)} className={inputClasses()} />
      {hint ? <span className="text-sm text-ink-3">{hint}</span> : null}
    </label>
  );
  return (
    <form action={action} className="grid gap-4">
      {field("fullName", "Name, as on your plans", 120, profile?.full_name ?? "")}
      {field("designation", "Designation", 120, profile?.designation ?? "", "For example Licensed Surveyor, as you are entitled to write it.")}
      {field("registration", "Registration or licence number", 60, profile?.registration ?? "", "Farbaek shows what you enter here and checks no register. You are responsible for it.")}
      <label className="grid gap-1.5">
        <span className={LABEL_CLASSES}>Office address</span>
        <textarea name="address" rows={2} maxLength={300} defaultValue={profile?.address ?? ""} disabled={Boolean(disabledReason)} className={textareaClasses()} />
      </label>
      {field("contact", "Contact (shown on the plan)", 160, profile?.contact ?? "")}
      <Result state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary", "md")}>
          {pending ? "Saving…" : "Save my details"}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </div>
    </form>
  );
}

export function ApproveForm({ projectId, version, disabledReason, confirms = [] }: { projectId: string; version: number; disabledReason: string | null; confirms?: readonly string[] }) {
  const [state, action, pending] = useActionState(approveSurveyAction, IDLE);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="version" value={version} />
      <label className="flex min-h-11 items-start gap-3 rounded-sm border border-line bg-canvas-2 p-3 text-sm text-ink">
        <input type="checkbox" name="confirm" value="yes" disabled={Boolean(disabledReason)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
        <span>
          I reviewed version {version} of this plan, its points and its calculations
          {confirms.length > 0 ? <>, including what Farbaek drew from my field data: {confirms.length === 1 ? confirms[0] : `${confirms.slice(0, -1).join(", ")} and ${confirms.at(-1)}`}</> : null}. I understand that approving it in Farbaek records my review and is not a certification: I sign the printed plan.
        </span>
      </label>
      <Result state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary", "md")}>
          {pending ? "Approving…" : `Approve version ${version}`}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </div>
    </form>
  );
}
