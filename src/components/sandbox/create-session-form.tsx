"use client";

import { CpuIcon, GlobeIcon, HardDrivesIcon, MemoryIcon, ShieldCheckIcon, TimerIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useMemo, useState } from "react";
import { createSandboxSessionAction, type CreateSessionState } from "@/app/app/sandbox/actions";
import { CardTitle } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";
import { NETWORK_PROFILE_LABELS, NETWORK_PROFILES, REGISTRY_HOSTS, type NetworkProfile } from "@/core/sandbox/network";
import { SANDBOX_SIZES, SANDBOX_TEMPLATES, SIZE_IDS, TEMPLATE_IDS, sizeOnRuntime, type SizeId, type TemplateId } from "@/core/sandbox/templates";

const IDLE: CreateSessionState = { status: "idle" };

export interface CreateSessionFormProps {
  idempotencyKey: string;
  /** The connected runtime, which decides what each size really gets. */
  runtime: "e2b" | "vercel";
  allowedSizes: readonly SizeId[];
  allowedNetworks: readonly NetworkProfile[];
  maxMinutes: number;
  idleMinutes: number;
  maxCommandMinutes: number;
  projects: { id: string; name: string; suggested: TemplateId | null }[];
  tasks: { id: string; title: string; projectId: string }[];
  defaultProjectId: string | null;
  defaultTaskId: string | null;
  disabledReason: string | null;
}

const field = "h-12 w-full rounded-sm border border-line bg-surface px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

function Choice({ name, value, checked, disabled, onChange, title, detail, note }: { name: string; value: string; checked: boolean; disabled?: boolean; onChange: () => void; title: string; detail: string; note?: string }) {
  return (
    <label
      className={`relative flex min-h-[44px] cursor-pointer flex-col rounded-md border p-4 transition-[border-color,box-shadow] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/30 ${
        checked ? "border-accent bg-accent/[0.04] shadow-e1" : "border-line bg-surface hover:border-line-strong/50"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />
      <span className="flex items-center justify-between gap-3">
        <span className="text-[0.9375rem] font-medium">{title}</span>
        <span aria-hidden className={`size-4 shrink-0 rounded-full border-2 ${checked ? "border-accent bg-accent shadow-[inset_0_0_0_2px_var(--surface)]" : "border-line-strong/60"}`} />
      </span>
      <span className="mt-1 text-sm text-ink-2">{detail}</span>
      {note ? <span className="mt-2 text-xs text-ink-3">{note}</span> : null}
    </label>
  );
}

export function CreateSessionForm(props: CreateSessionFormProps) {
  const [state, action, pending] = useActionState(createSandboxSessionAction, IDLE);
  const initialProject = props.projects.find((p) => p.id === props.defaultProjectId) ?? null;
  const [projectId, setProjectId] = useState<string>(initialProject?.id ?? "");
  const [template, setTemplate] = useState<TemplateId>(initialProject?.suggested ?? "node-ts");
  const [size, setSize] = useState<SizeId>(props.allowedSizes[0] ?? "small");
  const [network, setNetwork] = useState<NetworkProfile>("none");
  const durations = useMemo(() => [15, 30, 60, 120, 240].filter((m) => m <= props.maxMinutes), [props.maxMinutes]);
  const [minutes, setMinutes] = useState<number>(durations.includes(30) ? 30 : (durations.at(-1) ?? 15));
  const tasks = props.tasks.filter((t) => t.projectId === projectId);
  const chosen = sizeOnRuntime(SANDBOX_SIZES[size], props.runtime);
  const disabled = Boolean(props.disabledReason) || pending;

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
      <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
      <div className="grid gap-8">
        <fieldset className="grid gap-3">
          <legend className="text-base font-medium">Environment</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEMPLATE_IDS.map((id) => (
              <Choice
                key={id}
                name="template"
                value={id}
                checked={template === id}
                onChange={() => setTemplate(id)}
                title={SANDBOX_TEMPLATES[id].label}
                detail={SANDBOX_TEMPLATES[id].description}
                note={SANDBOX_TEMPLATES[id].runtime}
              />
            ))}
          </div>
        </fieldset>

        <div className="grid gap-2">
          <label htmlFor="name" className="text-sm font-medium">
            Session name
          </label>
          <input id="name" name="name" required maxLength={80} defaultValue={initialProject ? `${initialProject.name} run` : ""} placeholder="For example: checkout tests" className={field} />
        </div>

        <fieldset className="grid gap-3">
          <legend className="text-base font-medium">Size</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {SIZE_IDS.map((id) => {
              const allowed = props.allowedSizes.includes(id);
              const s = sizeOnRuntime(SANDBOX_SIZES[id], props.runtime);
              return (
                <Choice
                  key={id}
                  name="size"
                  value={id}
                  checked={size === id}
                  disabled={!allowed}
                  onChange={() => setSize(id)}
                  title={SANDBOX_SIZES[id].label}
                  detail={`${s.vcpu} vCPU, ${s.memoryGiB} GiB memory, ${s.disk}`}
                  note={allowed ? undefined : "Not included in your plan."}
                />
              );
            })}
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="text-base font-medium">Network</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {NETWORK_PROFILES.map((id) => (
              <Choice
                key={id}
                name="network"
                value={id}
                checked={network === id}
                disabled={!props.allowedNetworks.includes(id)}
                onChange={() => setNetwork(id)}
                title={NETWORK_PROFILE_LABELS[id].title}
                detail={NETWORK_PROFILE_LABELS[id].detail}
              />
            ))}
          </div>
        </fieldset>

        <div className="grid gap-2">
          <label htmlFor="minutes" className="text-sm font-medium">
            Time limit
          </label>
          <select id="minutes" name="minutes" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={field}>
            {durations.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} minutes` : `${m / 60} ${m === 60 ? "hour" : "hours"}`}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-3">The runtime ends the session at this limit even if Farbaek is unreachable. Your plan allows up to {props.maxMinutes} minutes.</p>
        </div>

        <fieldset className="grid gap-4">
          <legend className="text-base font-medium">Project files</legend>
          <div className="grid gap-2">
            <label htmlFor="projectId" className="text-sm font-medium">
              Copy files from
            </label>
            <select
              id="projectId"
              name="projectId"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                const suggested = props.projects.find((p) => p.id === e.target.value)?.suggested;
                if (suggested) setTemplate(suggested);
              }}
              className={field}
            >
              <option value="">No project, start empty</option>
              {props.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {projectId ? (
            <>
              <div className="grid gap-2">
                <label htmlFor="include" className="text-sm font-medium">
                  Only these folders <span className="font-normal text-ink-3">(optional)</span>
                </label>
                <input id="include" name="include" placeholder="src, tests" className={field} />
                <p className="text-xs text-ink-3">Comma-separated. Leave empty to copy the whole project (up to 3,000 files or 25 MB).</p>
              </div>
              <div className="grid gap-2">
                <label htmlFor="taskId" className="text-sm font-medium">
                  Link a task <span className="font-normal text-ink-3">(optional)</span>
                </label>
                <select id="taskId" name="taskId" defaultValue={tasks.some((t) => t.id === props.defaultTaskId) ? (props.defaultTaskId ?? "") : ""} className={field}>
                  <option value="">No task</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-ink-3">A linked task can run its plan&apos;s checks here and get a receipt.</p>
              </div>
            </>
          ) : null}
        </fieldset>
      </div>

      <aside className="grid gap-4 rounded-md border border-line bg-surface p-5 shadow-e1 lg:sticky lg:top-6">
        <CardTitle icon={HardDrivesIcon}>What you&apos;ll get</CardTitle>
        <ul className="grid gap-3 text-sm">
          <li className="flex gap-3">
            <ShieldCheckIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            <span>Its own private computer, separate from Farbaek and from other sessions. No Farbaek keys or settings are inside.</span>
          </li>
          <li className="flex gap-3">
            <CpuIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            <span>
              {chosen.vcpu} vCPU <MemoryIcon size={14} weight="bold" className="mx-1 inline text-ink-3" aria-hidden /> {chosen.memoryGiB} GiB memory
              <HardDrivesIcon size={14} weight="bold" className="mx-1 inline text-ink-3" aria-hidden /> {chosen.disk}. {chosen.note}
            </span>
          </li>
          <li className="flex gap-3">
            <GlobeIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            <span>{network === "none" ? "No outbound network." : `Outbound only to ${REGISTRY_HOSTS.join(", ")}.`} Cloud metadata and private addresses are always blocked.</span>
          </li>
          <li className="flex gap-3">
            <TimerIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            <span>
              Ends after {minutes} minutes, or {props.idleMinutes} minutes without activity. Each command can run up to {props.maxCommandMinutes} minutes.
            </span>
          </li>
        </ul>
        {state.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 rounded-sm border border-failed/30 bg-failed/[0.05] px-3 py-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            <span>{state.message}</span>
          </p>
        ) : null}
        {props.disabledReason ? <p className="text-sm text-ink-2">{props.disabledReason}</p> : null}
        <button type="submit" disabled={disabled} className={buttonClasses("accent", "md", "w-full")}>
          {pending ? "Starting the test space…" : "Start session"}
        </button>
        <p className="text-xs text-ink-3">Starting takes a few seconds. Running time counts toward your plan&apos;s test space minutes until you stop it.</p>
      </aside>
    </form>
  );
}
