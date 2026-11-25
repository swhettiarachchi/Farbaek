"use client";

import { useState } from "react";
import { AGENT_EXAMPLES } from "@/core/automation/agents";
import { describeSchedule, type Repeat } from "@/core/automation/schedule";
import type { ScheduledLimit } from "@/core/automation/tasks";
import { TaskForm } from "./task-form";

type Start = { n: number; seed?: { title: string; instruction: string; repeat: Repeat } };

/**
 * A new agent (stage 275, ADR 0282): the form, and three starting points in a person's own words. Pressing one fills the form with
 * it and puts the cursor there, for the person to make it their own before anything is saved.
 */
export function NewAgent({ limit, disabledReason, serverNow }: { limit: ScheduledLimit; disabledReason: string | null; serverNow: number }) {
  const [start, setStart] = useState<Start>({ n: 0 });
  return (
    <div className="grid gap-6">
      {/* A starting point remounts the form with it; the form takes the cursor, which also brings it into view. */}
      <TaskForm key={start.n} agent={{}} {...(start.seed ? { seed: start.seed } : {})} focusFirst={start.n > 0} limit={limit} disabledReason={disabledReason} serverNow={serverNow} />
      <div>
        <h3 className="text-label font-medium text-ink-2">Or start from one of these</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {AGENT_EXAMPLES.map((e) => (
            <li key={e.name}>
              <button
                type="button"
                onClick={() => setStart((s) => ({ n: s.n + 1, seed: { title: e.name, instruction: e.goal, repeat: e.repeat } }))}
                className="tap grid h-full w-full content-start gap-1 rounded-md border border-line bg-surface p-3 text-left transition-colors duration-150 hover:border-accent/60 sm:p-4"
              >
                <span className="text-body font-medium text-ink">{e.name}</span>
                <span className="text-sm leading-relaxed text-ink-2">{e.goal}</span>
                <span className="text-sm text-ink-3">{describeSchedule({ repeat: e.repeat, timeZone: "UTC", end: { kind: "never" } }).replace(/, UTC[.]$/, ".")}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
