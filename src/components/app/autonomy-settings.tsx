"use client";

import { CheckCircleIcon, ClockCounterClockwiseIcon, FlowArrowIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { setAutonomyAction, type AutonomyState } from "@/app/app/actions";
import { replayAutonomyAction, type ReplayState } from "@/app/app/replay-actions";
import { RehearsalRecord } from "@/components/app/rehearsal-record";
import { buttonClasses } from "@/components/ui/button";
import { LEVEL_3 } from "@/core/trust/autonomy-levels";
import { RelativeTime } from "@/components/ui/local-time";
import type { AutonomyView } from "@/server/workspace/autonomy";

const IDLE: AutonomyState = { status: "idle" };
type Mode = "0" | "shadow" | "2" | "3";

/**
 * Autonomy (ADR 0046): level 0, where every change waits for a person, or
 * level 2, where small, checked changes apply on their own within limits
 * an owner or admin sets. Between them, shadow mode (ADR 0075) rehearses
 * level 2: every change still waits, and each notes what level 2 would have
 * done. Level 3 (ADR 0086) is earned from a clean record and bounded by a
 * daily budget; level 4 is shown as not built yet. The server and the
 * database decide each change.
 */
export function AutonomySettings({
  view,
  disabledReason,
  shadowReason,
  replayReason,
  levelThreeReason,
  verifiable,
}: {
  view: AutonomyView;
  disabledReason: string | null;
  shadowReason: string | null;
  /** Why a replay of past changes can't run here (ADR 0081), or null. */
  replayReason: string | null;
  /** Why level 3 can't be chosen here (plan, or not earned yet), or null. */
  levelThreeReason: string | null;
  verifiable: boolean;
}) {
  const [state, action, pending] = useActionState(setAutonomyAction, IDLE);
  const current: Mode = view.level === 3 ? "3" : view.level === 2 ? "2" : view.shadowSince ? "shadow" : "0";
  const [mode, setModeRaw] = useState<Mode>(current);
  const [maxFiles, setMaxFilesRaw] = useState(view.maxFiles);
  const [allowCreates, setAllowCreatesRaw] = useState(view.allowCreates);
  const [dailyLimit, setDailyLimit] = useState(view.dailyLimit ?? 10);
  // Level 2 and rehearsals go up to 5 files; only level 3 goes past.
  const setMode = (m: Mode) => {
    setModeRaw(m);
    if (m !== "3" && maxFiles > 5) setMaxFilesRaw(5);
  };
  const [replay, setReplay] = useState<ReplayState | null>(null);
  const [replaying, startReplay] = useTransition();
  // A replay answers for the limits it ran with; changing them clears it.
  const setMaxFiles = (n: number) => (setMaxFilesRaw(n), setReplay(null));
  const setAllowCreates = (b: boolean) => (setAllowCreatesRaw(b), setReplay(null));
  const runReplay = () => startReplay(async () => setReplay(await replayAutonomyAction({ maxFiles, allowCreates })));
  const suspended = (view.level === 2 || view.level === 3) && view.suspendedAt !== null;
  const changed = mode !== current || maxFiles !== view.maxFiles || allowCreates !== view.allowCreates || (mode === "3" && dailyLimit !== view.dailyLimit);
  const mostFiles = mode === "3" ? LEVEL_3.maxFiles : 5;
  const locked = pending || Boolean(disabledReason);

  const options: { value: Mode; title: string; body: string; unavailable: string | null }[] = [
    { value: "0", title: "Every change waits for a person", body: "The agent suggests a change, and someone reads it and approves it.", unavailable: null },
    {
      value: "shadow",
      title: "Practice mode: see it before you trust it",
      body: "Every change still waits for a person. Each one notes whether it would have applied on its own, so you can see the record before you trust it.",
      unavailable: shadowReason,
    },
    { value: "2", title: "Small, checked changes apply on their own", body: "Within the limits below. Everything else still waits for a person.", unavailable: null },
    {
      value: "3",
      title: "Bigger, checked changes apply on their own",
      body: `Up to ${LEVEL_3.maxFiles} files, new ones if you allow them, within a daily limit you set. Earned from a clean record, and paused by any failure, like small changes.`,
      unavailable: levelThreeReason,
    },
  ];

  return (
    <form action={action} className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">How much the agent can do on its own</h2>
        {/* The state is its words alone, in its colour and border (ADR 0180). */}
        {suspended ? (
          <span className="inline-flex items-center rounded-full border border-dashed border-approval/40 px-2.5 py-1 text-xs font-medium text-approval">Paused after a failure</span>
        ) : view.level === 2 || view.level === 3 ? (
          <span className="inline-flex items-center rounded-full border border-accent/40 px-2.5 py-1 text-xs font-medium text-accent">
            {view.level === 3 ? "Bigger changes on their own" : "Small changes on their own"}
          </span>
        ) : view.shadowSince ? (
          <span className="inline-flex items-center rounded-full border border-dashed border-simulated/50 px-2.5 py-1 text-xs font-medium text-simulated">Practice mode</span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-2">Waits for a person</span>
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

      <fieldset className="grid gap-2" disabled={locked}>
        <legend className="sr-only">Choose a level</legend>
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border px-4 py-3 has-checked:bg-accent/[0.04] has-focus-visible:outline-2 has-focus-visible:outline-accent has-disabled:cursor-not-allowed ${
              o.value === "shadow" ? "border-dashed border-line-strong/70 has-checked:border-simulated has-checked:bg-simulated/[0.04]" : "border-line has-checked:border-accent"
            }`}
          >
            <input
              type="radio"
              name="level"
              value={o.value}
              checked={mode === o.value}
              disabled={o.unavailable !== null && mode !== o.value}
              onChange={() => setMode(o.value)}
              className="mt-1 size-4 accent-[var(--color-accent)]"
            />
            <span className="grid gap-0.5">
              <span className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium">
                {o.title}
                {o.value === "shadow" ? (
                  <span className="inline-flex h-5 items-center gap-1 rounded-full border border-simulated/40 px-2 text-xs font-medium text-simulated">
                    Sample
                  </span>
                ) : null}
              </span>
              <span className="text-sm text-ink-2">{o.body}</span>
              {o.unavailable ? <span className="text-xs text-ink-3">{o.unavailable}</span> : null}
            </span>
          </label>
        ))}
        {/* Level 4 isn't a setting: each workflow is approved on its own (ADR 0092). */}
        <div className="flex items-start gap-3 rounded-sm border border-line px-4 py-3">
          <FlowArrowIcon size={16} className="mt-1 shrink-0 text-ink-3" aria-hidden />
          <span className="grid gap-0.5">
            <span className="text-[0.9375rem] font-medium">Workflows</span>
            <span className="text-sm text-ink-2">The agent carries out an approved plan of several steps in order, stopping for a person at checkpoints and whenever a change needs review.</span>
            <Link href="/app/workflows" className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline">
              Open Workflows
            </Link>
          </span>
        </div>
      </fieldset>

      {mode !== "0" ? (
        <div className="grid gap-3 rounded-sm bg-surface-raised/60 px-4 py-3">
          <p className="text-sm font-medium">{mode === "shadow" ? "Try out these limits. A change would apply on its own only when all of these hold:" : "A change applies on its own only when all of these hold:"}</p>
          <ul className="grid gap-1.5 text-sm text-ink-2">
            {[
              "It's inside the approved plan, and touches no dependencies, CI, migrations, infrastructure or security code.",
              `It changes at most ${maxFiles} ${maxFiles === 1 ? "file" : "files"}${allowCreates ? "" : ", and creates none"}.`,
              "The plan lists checks, and a test space can run them.",
              "It was made in Farbaek, not by the desktop agent on someone's computer.",
              "No workspace rule says a person reviews its files.",
              ...(mode === "3" ? [`No more than ${dailyLimit} changes have applied on their own in the last 24 hours.`] : []),
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <CheckCircleIcon size={16} className="mt-0.5 shrink-0 text-verified" aria-hidden /> {t}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              Up to
              <select name="maxFiles" value={maxFiles} onChange={(e) => setMaxFiles(Number(e.target.value))} disabled={locked} className="min-h-11 rounded-sm border border-line bg-surface px-3 text-base sm:text-sm">
                {Array.from({ length: mostFiles }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              {maxFiles === 1 ? "file" : "files"}
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="allowCreates" checked={allowCreates} onChange={(e) => setAllowCreates(e.target.checked)} disabled={locked} className="size-4 accent-[var(--color-accent)]" />
              Allow new files
            </label>
            {mode === "3" ? (
              <label className="flex items-center gap-2 text-sm">
                Up to
                <select name="dailyLimit" value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} disabled={locked} className="min-h-11 rounded-sm border border-line bg-surface px-3 text-base sm:text-sm">
                  {LEVEL_3.dailyLimits.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                changes a day
              </label>
            ) : null}
          </div>
          {mode === "3" && view.level === 3 && view.dailyLimit ? (
            <p className="text-sm text-ink-2">
              Applied on their own in the last 24 hours: <span className="font-medium text-ink tabular">{view.appliedToday}</span> of {view.dailyLimit}.
            </p>
          ) : null}
          {!verifiable ? <p className="text-sm text-ink-3">No test space is ready on this server, so for now every change still waits for a person.</p> : null}
          {mode !== "3" ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
              <button type="button" onClick={runReplay} disabled={replaying || Boolean(replayReason)} className={buttonClasses("secondary", "sm")}>
                <ClockCounterClockwiseIcon size={16} aria-hidden /> {replaying ? "Replaying…" : "Replay the last 30 days"}
              </button>
              <span className="text-xs text-ink-3">{replayReason ?? "See what these limits would have done with your past changes, before you choose."}</span>
            </div>
          ) : null}
          <p className="text-xs leading-relaxed text-ink-3">
            {mode === "shadow"
              ? "Nothing applies on its own in practice mode. Each change shows what would have happened, marked as simulated, and the record below sets that against what really happened."
              : mode === "3"
                ? `Each change applied this way is recorded as approved by these settings, and can be undone file by file. Its checks run straight away in a test space. If any fail, this pauses itself, and has to be earned again: ${LEVEL_3.minVerified} changes applied on their own passing their checks in ${LEVEL_3.days} days, with none failing.`
                : "Each change applied this way is recorded as approved by these settings, in its ProofPack and history, and can be undone file by file. Its checks run straight away in a test space. If any of them fail, this pauses itself for the whole workspace."}
          </p>
        </div>
      ) : (
        <input type="hidden" name="maxFiles" value={maxFiles} />
      )}

      {(mode === "2" || mode === "shadow") && replay ? (
        replay.status === "done" ? (
          <RehearsalRecord summary={replay.summary} since={replay.since} replay={{ assumption: replay.assumption, leftOut: replay.leftOut }} />
        ) : (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {replay.message}
          </p>
        )
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={locked || (!changed && !suspended)} className={buttonClasses("primary", "sm")}>
          {pending ? "Saving…" : suspended && (mode === "2" || mode === "3") && !changed ? "Turn on again" : "Save this choice"}
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
