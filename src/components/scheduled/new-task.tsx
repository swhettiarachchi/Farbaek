"use client";

import { useEffect, useState } from "react";
import { SCHEDULE_PROMPT_KEY, SCHEDULE_PROMPT_MINUTES } from "@/core/automation/offer";
import { describeSchedule, type Repeat } from "@/core/automation/schedule";
import { EXAMPLES, TASK_LIMITS, type ScheduledLimit } from "@/core/automation/tasks";
import { TaskForm } from "./task-form";

type Start = { n: number; seed?: { title: string; instruction: string; repeat: Repeat }; carried?: string };

/**
 * A new scheduled task (stage 271, ADR 0278): the form, and six starting points in a person's own words. Pressing one fills the form
 * with it and puts the cursor there, for the person to make it their own before anything is saved. A request carried from Chat
 * ("Change it" under an answer, stage 273) lands in the form the same way, once.
 */
export function NewTask({ limit, disabledReason, serverNow }: { limit: ScheduledLimit; disabledReason: string | null; serverNow: number }) {
  const [start, setStart] = useState<Start>({ n: 0 });
  // What Chat handed over waits in this browser's storage, never in the address, and is taken once.
  useEffect(() => {
    let kept: string | null = null;
    try {
      kept = window.localStorage.getItem(SCHEDULE_PROMPT_KEY);
      window.localStorage.removeItem(SCHEDULE_PROMPT_KEY);
    } catch {
      // Storage refused: the form starts empty.
    }
    // It carries the time it was put there: one left by a visit that never happened is dropped, not shown days later.
    let handed = "";
    try {
      const carried = JSON.parse(kept ?? "null") as { text?: unknown; at?: unknown } | null;
      if (carried && typeof carried.text === "string" && typeof carried.at === "number" && Date.now() - carried.at < SCHEDULE_PROMPT_MINUTES * 60_000) handed = carried.text.trim().slice(0, TASK_LIMITS.instruction);
    } catch {
      // Not what Chat writes: ignored.
    }
    if (!handed) return;
    // Not cancelled on cleanup: the request has already left storage, so a second run of this effect would find nothing to take.
    window.requestAnimationFrame(() => setStart((s) => ({ n: s.n + 1, carried: handed })));
  }, []);
  return (
    <div className="grid gap-6">
      {/* A starting point remounts the form with it; the form takes the cursor, which also brings it into view. */}
      <TaskForm key={start.n} {...(start.seed ? { seed: start.seed } : {})} {...(start.carried ? { carried: start.carried } : {})} focusFirst={start.n > 0} limit={limit} disabledReason={disabledReason} serverNow={serverNow} />
      <div>
        <h3 className="text-label font-medium text-ink-2">Or start from one of these</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map((e) => (
            <li key={e.title}>
              <button
                type="button"
                onClick={() => setStart((s) => ({ n: s.n + 1, seed: { title: e.title, instruction: e.instruction, repeat: e.repeat } }))}
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
