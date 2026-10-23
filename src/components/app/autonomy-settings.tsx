"use client";

import { CheckCircleIcon, LightningIcon, PauseCircleIcon, ShieldCheckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { setAutonomyAction, type AutonomyState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import type { AutonomyView } from "@/server/workspace/autonomy";

const IDLE: AutonomyState = { status: "idle" };

/**
 * Autonomy (ADR 0046): level 0, where every change waits for a person, or
 * level 2, where small, checked changes apply on their own within limits
 * an owner or admin sets. The server and the database decide each change.
 */
export function AutonomySettings({ view, disabledReason, verifiable }: { view: AutonomyView; disabledReason: string | null; verifiable: boolean }) {
  const [state, action, pending] = useActionState(setAutonomyAction, IDLE);
  const [level, setLevel] = useState<0 | 2>(view.level);
  const [maxFiles, setMaxFiles] = useState(view.maxFiles);
  const [allowCreates, setAllowCreates] = useState(view.allowCreates);
  const suspended = view.level === 2 && view.suspendedAt !== null;
  const changed = level !== view.level || maxFiles !== view.maxFiles || allowCreates !== view.allowCreates;

  return (
    <form action={action} className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Autonomy</h2>
        {suspended ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-approval/40 px-2.5 py-1 text-xs text-approval">
            <PauseCircleIcon size={14} weight="bold" aria-hidden /> Paused after a failure
          </span>
        ) : view.level === 2 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 px-2.5 py-1 text-xs text-accent">
            <LightningIcon size={14} weight="bold" aria-hidden /> Level 2 on
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink-2">
            <ShieldCheckIcon size={14} weight="bold" aria-hidden /> Level 0
          </span>
        )}
      </div>

      {suspended ? (
        <p role="status" className="flex items-start gap-2 rounded-sm border border-dashed border-approval/40 bg-approval/[0.05] px-4 py-3 text-sm">
          <WarningCircleIcon size={18} className="mt-px shrink-0 text-approval" aria-hidden />
          <span>
            {view.suspendedReason} Every change waits for a person until it&apos;s turned on again
            {view.suspendedAt ? (
              <>
                {" "}
                (paused <RelativeTime iso={view.suspendedAt} />)
              </>
            ) : null}
            .
          </span>
        </p>
      ) : null}

      <fieldset className="grid gap-2" disabled={pending || Boolean(disabledReason)}>
        <legend className="sr-only">Autonomy level</legend>
        {(
          [
            { value: 0, title: "Every change waits for a person", body: "The agent proposes; someone reviews the diff and approves the exact content." },
            { value: 2, title: "Small, checked changes apply on their own", body: "Within the limits below. Everything else still waits for a person." },
          ] as const
        ).map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border border-line px-4 py-3 has-checked:border-accent has-checked:bg-accent/[0.04] has-focus-visible:outline-2 has-focus-visible:outline-accent has-disabled:cursor-not-allowed"
          >
            <input type="radio" name="level" value={o.value} checked={level === o.value} onChange={() => setLevel(o.value)} className="mt-1 size-4 accent-[var(--color-accent)]" />
            <span className="grid gap-0.5">
              <span className="text-[15px] font-medium">
                Level {o.value}: {o.title}
              </span>
              <span className="text-sm text-ink-2">{o.body}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {level === 2 ? (
        <div className="grid gap-3 rounded-sm bg-surface-raised/60 px-4 py-3">
          <p className="text-sm font-medium">A change applies on its own only when all of these hold:</p>
          <ul className="grid gap-1.5 text-sm text-ink-2">
            {[
              "It's inside the approved contract, and touches no dependencies, CI, migrations, infrastructure or security code.",
              `It changes at most ${maxFiles} ${maxFiles === 1 ? "file" : "files"}${allowCreates ? "" : ", and creates none"}.`,
              "The contract lists checks, and a verified sandbox can run them.",
              "It was made in Farbaek, not by the desktop agent on someone's computer.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <CheckCircleIcon size={16} className="mt-0.5 shrink-0 text-verified" aria-hidden /> {t}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              Up to
              <select
                name="maxFiles"
                value={maxFiles}
                onChange={(e) => setMaxFiles(Number(e.target.value))}
                disabled={pending || Boolean(disabledReason)}
                className="min-h-11 rounded-sm border border-line bg-surface px-3 text-base sm:text-sm"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              {maxFiles === 1 ? "file" : "files"}
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="allowCreates" checked={allowCreates} onChange={(e) => setAllowCreates(e.target.checked)} disabled={pending || Boolean(disabledReason)} className="size-4 accent-[var(--color-accent)]" />
              Allow new files
            </label>
          </div>
          {!verifiable ? <p className="text-sm text-ink-3">No verified sandbox is connected on this server, so for now every change still waits for a person.</p> : null}
          <p className="text-xs leading-relaxed text-ink-3">
            Each change applied this way is recorded as approved by this policy, in its ProofPack and history, and can be undone file by file. If one fails its checks,
            autonomy pauses itself for the whole workspace.
          </p>
        </div>
      ) : (
        <input type="hidden" name="maxFiles" value={maxFiles} />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason) || (!changed && !suspended)} className={buttonClasses("primary", "sm")}>
          {pending ? "Saving…" : suspended && level === 2 && !changed ? "Turn on again" : "Save autonomy"}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
        {view.updatedAt && !disabledReason ? (
          <span className="text-xs text-ink-3">
            Changed <RelativeTime iso={view.updatedAt} />
          </span>
        ) : null}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : state.status === "done" ? (
        <p role="status" className="text-sm text-verified">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
