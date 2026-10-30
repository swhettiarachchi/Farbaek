"use client";

import { CheckCircleIcon, ClockCountdownIcon, HourglassMediumIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useActionState, useId, useState } from "react";
import { renewAgentLeaseAction, setAgentLeaseAction, type AgentLeaseState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { AGENT_CAPABILITIES, CAPABILITY_LABELS, LEASE_DAY_CHOICES, LEASE_LIMITS, leaseSummary, type AgentLease, type LeaseState } from "@/core/agent/lease";

const IDLE: AgentLeaseState = { status: "idle" };

const STATE_LOOK: Record<LeaseState, { icon: typeof CheckCircleIcon; className: string }> = {
  active: { icon: CheckCircleIcon, className: "text-verified" },
  ending_soon: { icon: HourglassMediumIcon, className: "text-approval" },
  ended: { icon: XCircleIcon, className: "text-failed" },
};

/**
 * An agent's permission lease on the Agents page (ADR 0117): when it ends and
 * what it allows, with Renew and Change for owners, admins and the person who
 * paired it. The server checks the lease on every agent request; this only
 * shows and sets it.
 */
export function AgentLeasePanel({
  agentId,
  agentName,
  lease,
  state,
  daysLeft,
  projects,
  canEdit,
  disabledReason,
}: {
  agentId: string;
  agentName: string;
  lease: AgentLease;
  state: LeaseState;
  daysLeft: number;
  projects: { id: string; name: string }[];
  canEdit: boolean;
  /** Why the lease can't be changed right now, when it can't. */
  disabledReason: string | null;
}) {
  const [renewState, renew, renewing] = useActionState(renewAgentLeaseAction, IDLE);
  const [saveState, save, saving] = useActionState(setAgentLeaseAction, IDLE);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"all" | "some">(lease.projects === null ? "all" : "some");
  const id = useId();
  const panelId = `${id}-lease`;
  const blocked = Boolean(disabledReason) || renewing || saving;
  const look = STATE_LOOK[state];
  const result = saveState.status !== "idle" ? saveState : renewState;

  return (
    <div className="grid gap-3 basis-full">
      <div className="grid gap-1 rounded-sm border border-line bg-surface-sunken/50 px-3.5 py-3">
        <p className="flex items-start gap-2 text-sm">
          <look.icon size={16} weight="bold" className={`mt-0.5 shrink-0 ${look.className}`} aria-hidden />
          <span>
            {state === "ended" ? (
              <>
                Lease ended on <LocalTime iso={lease.expiresAt} />. The agent can&apos;t read tasks, propose changes or use Farbaek&apos;s AI until it&apos;s renewed.
              </>
            ) : (
              <>
                Lease ends in {daysLeft} {daysLeft === 1 ? "day" : "days"}, on <LocalTime iso={lease.expiresAt} />.
                {state === "ending_soon" ? " Renew it to keep the agent working." : ""}
              </>
            )}
          </span>
        </p>
        <p className="pl-6 text-xs leading-relaxed text-ink-2">{leaseSummary(lease)}</p>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <form action={renew}>
            <input type="hidden" name="agentId" value={agentId} />
            <button type="submit" disabled={blocked} className={buttonClasses(state === "active" ? "ghost" : "secondary", "sm")}>
              <ClockCountdownIcon size={16} aria-hidden /> {renewing ? "Renewing…" : "Renew for 90 days"}
            </button>
          </form>
          <button type="button" aria-expanded={open} aria-controls={panelId} disabled={Boolean(disabledReason)} onClick={() => setOpen((o) => !o)} className={buttonClasses("ghost", "sm")}>
            {open ? "Close lease" : "Change lease"}
          </button>
        </div>
      ) : null}
      {canEdit && disabledReason ? <p className="text-xs text-ink-3">{disabledReason}</p> : null}

      {result.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          {result.message}
        </p>
      ) : result.status === "saved" ? (
        <p role="status" className="flex items-start gap-2 text-sm text-ink-2">
          <CheckCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden />
          <span>
            Lease saved. It ends on <LocalTime iso={result.expiresAt} />.
          </span>
        </p>
      ) : null}

      {canEdit && open ? (
        <form id={panelId} action={save} className="grid gap-5 rounded-md border border-line bg-surface-sunken/60 p-4">
          <input type="hidden" name="agentId" value={agentId} />
          <fieldset className="grid gap-2" disabled={blocked}>
            <legend className="mb-2 text-sm font-medium">How long, from now</legend>
            <div className="inline-flex w-full rounded-full border border-line bg-surface p-1 shadow-e1 sm:w-auto">
              {LEASE_DAY_CHOICES.map((d) => (
                <label key={d} className="relative flex-1 sm:flex-none">
                  <input type="radio" name="days" value={d} defaultChecked={d === 90} className="peer sr-only" />
                  <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-full px-4 text-sm text-ink-2 transition-colors duration-[160ms] peer-checked:bg-primary peer-checked:font-medium peer-checked:text-on-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                    {d} days
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-1" disabled={blocked}>
            <legend className="mb-1 text-sm font-medium">Projects</legend>
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="radio" name="scope" value="all" checked={scope === "all"} onChange={() => setScope("all")} className="size-4 shrink-0 accent-[var(--color-accent)]" />
              <span className="text-[15px]">Every project, including new ones</span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="radio" name="scope" value="some" checked={scope === "some"} onChange={() => setScope("some")} disabled={projects.length === 0} className="size-4 shrink-0 accent-[var(--color-accent)]" />
              <span className="text-[15px]">Only the projects I choose</span>
            </label>
            {scope === "some" ? (
              <div className="ml-7 grid gap-0.5 border-l border-line pl-4">
                {projects.map((p) => (
                  <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-3">
                    <input type="checkbox" name="project" value={p.id} defaultChecked={lease.projects?.includes(p.id) ?? false} className="size-4 shrink-0 accent-[var(--color-accent)]" />
                    <span className="min-w-0 truncate text-[15px]">{p.name}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>

          <fieldset className="grid gap-1" disabled={blocked}>
            <legend className="mb-1 text-sm font-medium">What {agentName} may do</legend>
            {AGENT_CAPABILITIES.map((c) => (
              <label key={c} className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
                <input type="checkbox" name="capability" value={c} defaultChecked={lease.capabilities.includes(c)} className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" />
                <span className="grid gap-0.5">
                  <span className="text-[15px] font-medium">{CAPABILITY_LABELS[c].title}</span>
                  <span className="text-sm text-ink-2">{CAPABILITY_LABELS[c].detail}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="grid gap-1.5">
            <label htmlFor={`${id}-rate`} className="text-sm font-medium">
              Requests an hour, at most
            </label>
            <input
              id={`${id}-rate`}
              name="actionsPerHour"
              type="number"
              inputMode="numeric"
              min={LEASE_LIMITS.minActionsPerHour}
              max={LEASE_LIMITS.maxActionsPerHour}
              step={1}
              defaultValue={lease.actionsPerHour}
              disabled={blocked}
              aria-describedby={`${id}-rate-help`}
              className="min-h-11 w-full max-w-48 rounded-sm border border-line bg-surface px-3 text-base tabular focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
            <p id={`${id}-rate-help`} className="text-xs text-ink-3">
              {LEASE_LIMITS.minActionsPerHour} to {LEASE_LIMITS.maxActionsPerHour.toLocaleString("en-US")}. Each model step is one request, plus a few to read the task and send the change. Mesh transfers aren&apos;t counted.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={blocked} className={buttonClasses("secondary", "sm")}>
              {saving ? "Saving…" : "Save lease"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={buttonClasses("ghost", "sm")}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
