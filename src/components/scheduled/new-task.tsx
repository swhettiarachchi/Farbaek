"use client";

import { useState } from "react";
import { describeSchedule, type Repeat } from "@/core/automation/schedule";
import { EXAMPLES, type ScheduledLimit } from "@/core/automation/tasks";
import { TaskForm } from "./task-form";

/**
 * A new scheduled task (stage 271, ADR 0278): the form, and six starting points in a person's own words. Pressing one fills the form
 * with it and puts the cursor there, for the person to make it their own before anything is saved.
 */
export function NewTask({ limit, disabledReason, serverNow }: { limit: ScheduledLimit; disabledReason: string | null; serverNow: number }) {
  const [seed, setSeed] = useState<{ n: number; title: string; instruction: string; repeat: Repeat } | null>(null);
  return (
    <div className="grid gap-6">
      {/* A starting point remounts the form with it; the form takes the cursor, which also brings it into view. */}
      <TaskForm key={seed?.n ?? 0} {...(seed ? { seed, focusFirst: true } : {})} limit={limit} disabledReason={disabledReason} serverNow={serverNow} />
      <div>
        <h3 className="text-label font-medium text-ink-2">Or start from one of these</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map((e) => (
            <li key={e.title}>
              <button
                type="button"
                onClick={() => setSeed({ n: (seed?.n ?? 0) + 1, title: e.title, instruction: e.instruction, repeat: e.repeat })}
                className="tap grid h-full w-full gap-1 rounded-md border border-line bg-surface p-3 text-left transition-colors duration-150 hover:border-accent/60 sm:p-4"
              >
                <span className="text-body font-medium text-ink">{e.title}</span>
                <span className="text-sm leading-relaxed text-ink-2">{e.instruction}</span>
                <span className="text-sm text-ink-3">{describeSchedule({ repeat: e.repeat, timeZone: "UTC", end: { kind: "never" } }).replace(/, UTC[.]$/, ".")}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
