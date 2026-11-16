"use client";

/**
 * Earlier instructions (stage 195): each turn of the conversation with what came of it, newest at the bottom like a log. "Use again" puts
 * the words back in the instruction line; a turn that changed the plan can be taken back while the parts it changed are still as it left
 * them.
 */
import { ArrowCounterClockwiseIcon, ArrowUUpLeftIcon, MicrophoneIcon, TextAaIcon, XIcon } from "@phosphor-icons/react";
import type { Status } from "@/components/ui/status-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { LocalTime } from "@/components/ui/local-time";
import { buttonClasses } from "@/components/ui/button";
import type { Outcome, Turn } from "./assistant-context";

const OUTCOME: Record<Outcome, { status: Status; label: string }> = {
  suggested: { status: "approval", label: "Waiting for you" },
  applied: { status: "done", label: "Applied" },
  done: { status: "done", label: "Done" },
  discarded: { status: "off", label: "Discarded" },
  answered: { status: "info", label: "Answered" },
  asked: { status: "approval", label: "Asked you" },
  handed_off: { status: "info", label: "Handed to a tool" },
  failed: { status: "attention", label: "Couldn't" },
  reverted: { status: "off", label: "Taken back" },
};

export function TurnsDrawer({ turns, onClose, onUseAgain, onTakeBack, readOnly }: { turns: readonly Turn[]; onClose(): void; onUseAgain(words: string): void; onTakeBack(t: Turn): void; readOnly: boolean }) {
  return (
    <section aria-label="Earlier instructions" className="pointer-events-auto w-full max-w-3xl rounded-md bg-surface shadow-e2 ring-1 ring-line motion-safe:animate-[usage-in_220ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h3 className="text-sm font-medium text-ink">Earlier instructions</h3>
        <button type="button" aria-label="Close earlier instructions" onClick={onClose} className={buttonClasses("ghost", "sm", "size-11 !px-0")}>
          <XIcon size={16} weight="bold" aria-hidden />
        </button>
      </div>
      {turns.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-2">Nothing yet. Each instruction you give, spoken or typed, is listed here with what came of it, for this visit.</p>
      ) : (
        <ol role="log" aria-label="Instructions and what came of them" className="grid max-h-[min(44vh,26rem)] gap-1 overflow-y-auto p-2">
          {turns.map((t) => (
            <li key={t.id} className="grid gap-2 rounded-sm px-3 py-2.5 hover:bg-canvas-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={OUTCOME[t.outcome].status} label={OUTCOME[t.outcome].label} />
                <span className="flex items-center gap-1 text-xs text-ink-3">
                  {t.inputMethod === "voice" ? <MicrophoneIcon size={14} weight="bold" aria-hidden /> : <TextAaIcon size={14} weight="bold" aria-hidden />}
                  {t.inputMethod === "voice" ? "Spoken" : "Typed"}, <LocalTime iso={new Date(t.at).toISOString()} />
                </span>
              </div>
              <p className="break-words text-sm text-ink">{t.words}</p>
              {t.message ? <p className="text-sm text-ink-2">{t.message}</p> : null}
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => onUseAgain(t.words)} className={buttonClasses("ghost", "sm")}>
                  <ArrowUUpLeftIcon size={16} weight="bold" aria-hidden />
                  Use again
                </button>
                {(t.outcome === "applied" || t.outcome === "done") && t.patch && !readOnly ? (
                  <button type="button" onClick={() => onTakeBack(t)} className={buttonClasses("ghost", "sm")}>
                    <ArrowCounterClockwiseIcon size={16} weight="bold" aria-hidden />
                    Take back
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
