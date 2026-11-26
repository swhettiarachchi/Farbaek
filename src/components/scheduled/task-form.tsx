"use client";

import { CheckCircleIcon, WarningCircleIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { saveAgentAction, saveScheduledTaskAction, type ScheduledState } from "@/app/app/scheduled/actions";
import { AGENT_LIMITS_TEXT, runsIn30Days, suggestedRunsLimit } from "@/core/automation/agents";
import { clock, describeSchedule, isTimeZone, nextRun, wallClock, type Repeat, type Schedule, type ScheduleEnd } from "@/core/automation/schedule";
import { DEFAULT_OPTIONS, TASK_LIMITS, scheduleProblem, type ScheduledLimit, type TaskOptions } from "@/core/automation/tasks";
import { scheduleFromWords } from "@/core/automation/words";
import { buttonClasses } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";
import { useNow } from "@/components/ui/use-now";

const DAYS: [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
];
type Kind = Repeat["kind"];
const KINDS: [Kind, string][] = [
  ["daily", "Every day"],
  ["weekdays", "Monday to Friday"],
  ["weekly", "On chosen days each week"],
  ["monthly", "Once a month"],
  ["hourly", "Every hour"],
  ["once", "Once"],
];
const FIRST_REPEAT: Repeat = { kind: "daily", time: "09:00" };
const NEVER: ScheduleEnd = { kind: "never" };

const noSubscribe = () => () => undefined;
/** The browser's own time zone, known only in the browser; the server draws with UTC until then. */
function useTimeZone(fallback: string): string {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return tz && isTimeZone(tz) ? tz : fallback;
    },
    () => fallback,
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
/** The calendar day an instant falls on in a time zone, as a date field takes it. */
function dayIn(timeZone: string, at: Date): string {
  const w = wallClock(timeZone, at);
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`;
}

/**
 * A whole number typed freely: the field holds what was typed, so it can be cleared and typed again, and the value follows it only
 * while it is a number in range. Leaving the field shows the value again.
 */
function NumberField({ label, value, min, max, onChange, className = "" }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; className?: string }) {
  const [typed, setTyped] = useState<string | null>(null);
  const hint = useId();
  const shown = typed ?? String(value);
  const bad = typed !== null && (typed === "" || Number(typed) < min || Number(typed) > max);
  return (
    <label className={`grid content-start gap-1.5 ${className}`}>
      <span className="text-sm text-ink-2">{label}</span>
      <input
        inputMode="numeric"
        value={shown}
        aria-invalid={bad}
        aria-describedby={bad ? hint : undefined}
        onChange={(e) => {
          const text = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
          setTyped(text);
          if (text !== "" && Number(text) >= min && Number(text) <= max) onChange(Number(text));
        }}
        onBlur={() => setTyped(null)}
        className={inputClasses()}
      />
      {bad ? (
        <span id={hint} className="text-sm text-ink-3">
          A number from {min} to {max}.
        </span>
      ) : null}
    </label>
  );
}

export interface TaskFormStart {
  taskId: string;
  version: number;
  title: string;
  instruction: string;
  schedule: Schedule | null;
  options: TaskOptions;
  runsFinished: number;
  state: "active" | "paused" | "ended";
}

/** Makes the form an agent's (stage 275): a name and a goal, the same schedule, and its limit and memory choice. */
export interface AgentFormStart {
  /** The agent being changed; missing for a new one. */
  start?: { agentId: string; version: number; runsLimit: number; useMemory: boolean };
}

/**
 * One scheduled task, new or changed (stage 271, ADR 0278): what Farbaek should do, and when. For a new task the schedule is read
 * from the person's own words as they write ("every weekday at 8:30"), shown in a sentence, and theirs to change before anything is
 * saved. `serverNow` is the server's clock at render, so the page and the browser first draw the same thing.
 *
 * With `agent` it is an agent's form (stage 275, ADR 0282): the instruction is its goal, its name is asked for up front, and it has
 * a limit on its runs and a choice about memory. Everything about when is the same.
 */
export function TaskForm({
  start,
  seed,
  carried,
  agent,
  limit,
  disabledReason,
  serverNow,
  focusFirst = false,
  onDone,
}: {
  start?: TaskFormStart;
  agent?: AgentFormStart;
  seed?: { title: string; instruction: string; repeat: Repeat };
  /** A request carried from Chat, to be changed before it is saved: the form starts on it, with its schedule read from its words. */
  carried?: string;
  limit: ScheduledLimit;
  disabledReason: string | null;
  serverNow: number;
  /** Puts the cursor in the instruction when the form appears: a starting point was just chosen. */
  focusFirst?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const first = start?.schedule ?? null;
  const zone = useTimeZone(first?.timeZone ?? "UTC");
  // A carried request is read once, as the form appears in the browser.
  const [carriedRead] = useState(() => (carried && !start ? scheduleFromWords(carried, new Date(), zone) : null));
  // What the schedule goes back to when the person's words stop describing one. For a carried request, what its words said.
  const fallback = first?.repeat ?? carriedRead?.schedule.repeat ?? seed?.repeat ?? FIRST_REPEAT;
  const [title, setTitle] = useState(start?.title ?? seed?.title ?? "");
  const [instruction, setInstruction] = useState(start?.instruction ?? carried ?? seed?.instruction ?? "");
  const [repeat, setRepeat] = useState<Repeat>(fallback);
  const [end, setEnd] = useState<ScheduleEnd>(first?.end ?? NEVER);
  const [options, setOptions] = useState<TaskOptions>(start?.options ?? DEFAULT_OPTIONS);
  // The time of day last chosen, kept while "Every hour" has none, so switching back doesn't lose it.
  const [lastTime, setLastTime] = useState(fallback.kind === "hourly" ? "09:00" : fallback.time);
  // Once the person sets the schedule themselves, their words no longer move it. A task being changed is theirs already.
  const [touched, setTouched] = useState(Boolean(start));
  const [fromWords, setFromWords] = useState<{ timeAssumed: boolean; hourAssumed: boolean } | null>(carriedRead ? { timeAssumed: carriedRead.timeAssumed, hourAssumed: carriedRead.hourAssumed } : null);
  const [lastDayPressed, setLastDayPressed] = useState(false);
  // An agent's limit follows its schedule until the person sets one themselves.
  const [limitSet, setLimitSet] = useState<number | null>(agent?.start?.runsLimit ?? null);
  const [useMemory, setUseMemory] = useState(agent?.start?.useMemory ?? true);
  const [result, setResult] = useState<ScheduledState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusFirst) box.current?.focus();
  }, [focusFirst]);

  // A task keeps the zone it was made in; a new one takes the browser's.
  const timeZone = first && start ? first.timeZone : zone;
  const schedule: Schedule = useMemo(() => ({ repeat, timeZone, end: repeat.kind === "once" ? NEVER : end }), [repeat, timeZone, end]);
  // The clock moves while the page is open: what is said about "next" and "already passed" is as of now, to the minute.
  const nowMs = Math.floor(useNow(serverNow) / 60_000) * 60_000;
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  // Dates and times in the person's own zone are drawn once the page is in their browser: the server's clock and zone aren't theirs.
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

  const onInstruction = (text: string) => {
    setInstruction(text);
    setResult({ status: "idle" });
    if (touched) return;
    const read = scheduleFromWords(text, new Date(), zone);
    setRepeat(read ? read.schedule.repeat : fallback);
    setFromWords(read ? { timeAssumed: read.timeAssumed, hourAssumed: read.hourAssumed } : null);
  };
  const set = (next: Repeat) => {
    setRepeat(next);
    if (next.kind !== "hourly") setLastTime(next.time);
    setTouched(true);
    setFromWords(null);
    setLastDayPressed(false);
    setResult({ status: "idle" });
  };
  const setKind = (kind: Kind) => {
    const today = wallClock(timeZone, now);
    if (kind === "hourly") return set({ kind, minute: 0 });
    if (kind === "once") return set({ kind, date: dayIn(timeZone, new Date(now.getTime() + 86_400_000)), time: lastTime });
    if (kind === "weekly") return set({ kind, days: [new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay()], time: lastTime });
    if (kind === "monthly") return set({ kind, day: today.d, time: lastTime });
    return set({ kind, time: lastTime });
  };

  // What the server will check again: said here first, so Save is never a surprise.
  const problem = instruction.trim() ? scheduleProblem(schedule, limit, now, start?.runsFinished ?? 0) : null;
  const next = problem ? null : nextRun(schedule, now, start?.runsFinished ?? 0);
  const off = disabledReason ?? (agent && !title.trim() ? "Give it a name first." : !instruction.trim() ? (agent ? "Say what it should work toward first." : "Say what Farbaek should do first.") : problem);
  const runsLimit = limitSet ?? suggestedRunsLimit(schedule);
  const due = runsIn30Days(repeat);

  const save = () =>
    startTransition(async () => {
      const dropped = (): ScheduledState => ({ status: "error", message: "The connection dropped. Nothing was saved. Try again." });
      const r = agent
        ? await saveAgentAction({ agentId: agent.start?.agentId ?? null, baseVersion: agent.start?.version ?? null, name: title, goal: instruction, runsLimit, useMemory, schedule, options }).catch(dropped)
        : await saveScheduledTaskAction({ taskId: start?.taskId ?? null, baseVersion: start?.version ?? null, title, instruction, schedule, options }).catch(dropped);
      setResult(r);
      if (r.status !== "done") return;
      if (!start) {
        // A new task starts from an empty form, not from the last one's schedule.
        setTitle("");
        setInstruction("");
        setRepeat(FIRST_REPEAT);
        setLastTime("09:00");
        setEnd(NEVER);
        setOptions(DEFAULT_OPTIONS);
        setTouched(false);
        setFromWords(null);
        setLastDayPressed(false);
        setLimitSet(null);
        setUseMemory(true);
      }
      router.refresh();
      onDone?.();
    });

  const id = start?.taskId ?? "new";
  // The folded choices in a sentence, so what is set is read without opening them.
  const choices = `${!agent && title.trim() ? "Named. " : ""}${options.effort === "quick" ? "Quick" : options.effort === "thorough" ? "Thorough" : "Balanced"} thought, ${options.web ? "checks the web when needed" : "no web"}, ${options.notify ? "tells you when it has run" : "doesn't tell you when it has run"}${agent ? (useMemory ? ", uses what you asked Farbaek to remember" : ", doesn't use what you asked Farbaek to remember") : ""}.`;
  const readNote = fromWords
    ? ` Read from your words${fromWords.timeAssumed ? ", with a usual time since you gave none" : fromWords.hourAssumed && repeat.kind !== "hourly" ? `, taking the hour as ${clock(repeat.time)}` : ""}. Change it above if it isn't what you meant.`
    : "";
  return (
    <div className="grid gap-4">
      {agent ? (
        <label className="grid gap-1.5 sm:max-w-sm">
          <span className={LABEL_CLASSES}>Its name</span>
          <input
            value={title}
            maxLength={AGENT_LIMITS_TEXT.name}
            onChange={(e) => {
              setTitle(e.target.value);
              setResult({ status: "idle" });
            }}
            placeholder="Scout"
            className={inputClasses()}
          />
        </label>
      ) : null}
      <label className="grid gap-1.5">
        <span className={LABEL_CLASSES}>{agent ? "What should it work toward?" : "What should Farbaek do?"}</span>
        <textarea
          ref={box}
          value={instruction}
          maxLength={agent ? AGENT_LIMITS_TEXT.goal : TASK_LIMITS.instruction}
          rows={4}
          onChange={(e) => onInstruction(e.target.value)}
          placeholder={agent ? "Keep track of what my closest competitors change, and tell me what is new since last time." : "Research the latest AI news every morning and give me a short summary with sources."}
          className={inputClasses("min-h-28 resize-y py-2.5 leading-relaxed")}
        />
        <span className="text-sm text-ink-3">
          {agent
            ? "Write its goal as you would explain it to a colleague. Each time it works, it picks the next useful piece and builds on its notes from before."
            : touched
              ? "Write it as you would ask in Chat."
              : "Write it as you would ask in Chat. Say when, and the schedule below follows your words."}
        </span>
      </label>

      <fieldset className="grid gap-3 rounded-md border border-line p-3 sm:p-4">
        <legend className={`${LABEL_CLASSES} px-1`}>When</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid content-start gap-1.5">
            <span className="text-sm text-ink-2">How often</span>
            <select value={repeat.kind} onChange={(e) => setKind(e.target.value as Kind)} className={inputClasses()}>
              {KINDS.map(([k, label]) => (
                <option key={k} value={k} disabled={k === "hourly" && !limit.hourly}>
                  {label}
                  {k === "hourly" && !limit.hourly ? " (larger plans)" : ""}
                </option>
              ))}
            </select>
          </label>
          {repeat.kind === "hourly" ? (
            <NumberField label="Minutes past the hour" value={repeat.minute} min={0} max={59} onChange={(minute) => set({ kind: "hourly", minute })} />
          ) : (
            <label className="grid content-start gap-1.5">
              <span className="text-sm text-ink-2">Time</span>
              <input type="time" value={repeat.time} onChange={(e) => e.target.value && set({ ...repeat, time: e.target.value.slice(0, 5) })} className={inputClasses()} />
            </label>
          )}
        </div>
        {repeat.kind === "weekly" ? (
          <div className="grid gap-1.5">
            <div role="group" aria-label="Days of the week" className="flex flex-wrap gap-1.5">
              {DAYS.map(([d, label]) => {
                const on = repeat.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      // The last day stays on, and says why: a weekly task runs on one day at least.
                      if (on && repeat.days.length === 1) return setLastDayPressed(true);
                      set({ ...repeat, days: on ? repeat.days.filter((x) => x !== d) : [...repeat.days, d].sort((a, b) => a - b) });
                    }}
                    className={`tap inline-flex min-h-10 min-w-12 items-center justify-center rounded-full border px-3 text-label font-medium transition-colors duration-150 ${on ? "border-accent bg-accent/[0.09] text-ink ring-1 ring-accent" : "border-line bg-surface text-ink-2 hover:border-accent/60 hover:text-ink"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {lastDayPressed ? (
              <p role="status" className="text-sm text-ink-3">
                It runs on one day at least. Choose another day first, then take this one off.
              </p>
            ) : null}
          </div>
        ) : null}
        {repeat.kind === "monthly" ? <NumberField label="Day of the month" value={repeat.day} min={1} max={31} onChange={(day) => set({ ...repeat, day })} className="sm:max-w-56" /> : null}
        {repeat.kind === "once" ? (
          <label className="grid gap-1.5 sm:max-w-56">
            <span className="text-sm text-ink-2">Date</span>
            <input type="date" value={repeat.date} min={inBrowser ? dayIn(timeZone, now) : undefined} onChange={(e) => e.target.value && set({ ...repeat, date: e.target.value })} className={inputClasses()} />
          </label>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid content-start gap-1.5">
              <span className="text-sm text-ink-2">Stop</span>
              <select
                value={end.kind}
                onChange={(e) => {
                  const k = e.target.value as ScheduleEnd["kind"];
                  setEnd(k === "never" ? NEVER : k === "on" ? { kind: "on", date: dayIn(timeZone, new Date(now.getTime() + 30 * 86_400_000)) } : { kind: "after", runs: Math.max(10, (start?.runsFinished ?? 0) + 1) });
                  setResult({ status: "idle" });
                }}
                className={inputClasses()}
              >
                <option value="never">Never</option>
                <option value="on">After a date</option>
                <option value="after">After a number of runs</option>
              </select>
            </label>
            {end.kind === "on" ? (
              <label className="grid content-start gap-1.5">
                <span className="text-sm text-ink-2">Last day</span>
                <input type="date" value={end.date} min={inBrowser ? dayIn(timeZone, now) : undefined} onChange={(e) => e.target.value && setEnd({ kind: "on", date: e.target.value })} className={inputClasses()} />
              </label>
            ) : end.kind === "after" ? (
              <NumberField label="Scheduled runs in all" value={end.runs} min={1} max={1000} onChange={(runs) => setEnd({ kind: "after", runs })} />
            ) : null}
          </div>
        )}
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">{describeSchedule(schedule)}</span>
          {readNote}
          {start?.state === "paused" ? (
            " It stays paused until you resume it."
          ) : next && inBrowser ? (
            <>
              {" "}
              Next: <time dateTime={next.toISOString()}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(next)}</time> on this device.
            </>
          ) : null}
        </p>
      </fieldset>

      {agent ? (
        <div className="grid gap-1.5">
          <NumberField
            label="Most runs in any 30 days"
            value={runsLimit}
            min={1}
            max={AGENT_LIMITS_TEXT.runs}
            onChange={(n) => {
              setLimitSet(n);
              setResult({ status: "idle" });
            }}
            className="sm:max-w-56"
          />
          <p className="text-sm text-ink-3">
            Its limit, so it can never use more than you meant. This schedule comes due {due === 1 ? "once" : `${due} times`} in 30 days at most.
            {runsLimit < due ? " With a lower limit it stops early, and works again as older runs pass 30 days." : ""}
          </p>
        </div>
      ) : null}

      {/* What most tasks leave as it is, said in the fold's own line so nothing is hidden: opened to change it. */}
      <Disclosure summary="More choices" hint={choices}>
        <div className="grid gap-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {agent ? null : (
              <label className="grid content-start gap-1.5">
                <span className={LABEL_CLASSES}>Name</span>
                <input value={title} maxLength={TASK_LIMITS.title} onChange={(e) => setTitle(e.target.value)} placeholder="Taken from your words if left empty" className={inputClasses()} />
              </label>
            )}
            <label className="grid content-start gap-1.5">
              <span className={LABEL_CLASSES}>How much thought</span>
              <select value={options.effort} onChange={(e) => setOptions({ ...options, effort: e.target.value as TaskOptions["effort"] })} className={inputClasses()}>
                <option value="quick">Quick</option>
                <option value="balanced">Balanced</option>
                <option value="thorough">Thorough</option>
              </select>
            </label>
          </div>
          <div className="grid gap-1">
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input type="checkbox" checked={options.web} onChange={(e) => setOptions({ ...options, web: e.target.checked })} className="size-5 shrink-0 accent-[var(--color-accent)]" />
              Check the live web when the task needs it
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input type="checkbox" checked={options.notify} onChange={(e) => setOptions({ ...options, notify: e.target.checked })} className="size-5 shrink-0 accent-[var(--color-accent)]" />
              Tell me when it has run
            </label>
            {agent ? (
              <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
                <input type="checkbox" checked={useMemory} onChange={(e) => setUseMemory(e.target.checked)} className="size-5 shrink-0 accent-[var(--color-accent)]" />
                Use what I asked Farbaek to remember
              </label>
            ) : null}
          </div>
        </div>
      </Disclosure>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={Boolean(off) || pending} className={buttonClasses("primary", "md")}>
          {pending ? "Saving…" : start ? "Save changes" : agent ? "Start the agent" : "Schedule it"}
        </button>
        {off && !pending ? <p className="min-w-0 basis-full text-sm text-ink-3 sm:flex-1 sm:basis-0">{off}</p> : null}
      </div>
      {result.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
          {result.message}
        </p>
      ) : result.status === "done" ? (
        <p role="status" className="flex items-start gap-2 text-sm text-verified" data-task={id}>
          <CheckCircleIcon size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
