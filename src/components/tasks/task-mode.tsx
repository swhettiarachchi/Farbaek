"use client";

import { BookOpenTextIcon, HammerIcon, MagnifyingGlassIcon, UsersIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { setTaskModeAction } from "@/app/app/actions";
import { MODE_INFO, TASK_MODES, type TaskMode } from "@/core/realityloop/modes";

const ICONS: Record<TaskMode, Icon> = { learn: BookOpenTextIcon, pair: UsersIcon, build: HammerIcon, audit: MagnifyingGlassIcon };

/**
 * A task's operating mode (ADR 0131): an explicit setting, shown with its
 * meaning, that the database enforces. Contributors change it while no
 * change is waiting for review.
 */
export function TaskModeControl({ taskId, mode, disabledReason }: { taskId: string; mode: TaskMode; disabledReason: string | null }) {
  const [current, setCurrent] = useState(mode);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function choose(next: TaskMode) {
    if (next === current || disabledReason) return;
    setError(null);
    start(async () => {
      const r = await setTaskModeAction({ taskId, mode: next });
      if (r.status === "done") setCurrent(r.mode);
      else if (r.status === "error") setError(r.message);
    });
  }

  return (
    <div className="grid gap-2">
      <div role="radiogroup" aria-label="Operating mode" className="inline-flex max-w-full gap-1 rounded-full border border-line max-[18em]:flex-col max-[18em]:rounded-md bg-surface p-1">
        {TASK_MODES.map((m) => {
          const Icon = ICONS[m];
          const on = m === current;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={pending || (Boolean(disabledReason) && !on)}
              onClick={() => choose(m)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-150 sm:px-4 ${on ? "bg-primary text-on-primary" : "text-ink-2 hover:bg-surface-raised hover:text-ink disabled:opacity-60"}`}
            >
              <span className="hidden sm:inline-flex">
                <Icon size={16} weight={on ? "bold" : "regular"} aria-hidden />
              </span>
              {MODE_INFO[m].label}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-ink-2">{MODE_INFO[current].detail}</p>
      <div aria-live="polite" className="empty:hidden">
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : disabledReason ? (
          <p className="text-xs text-ink-3">{disabledReason}</p>
        ) : null}
      </div>
    </div>
  );
}
