"use client";

import { ProhibitIcon, TerminalWindowIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { FarbaekApiError, type Execution, type FarbaekSandboxClient } from "@/sdk/sandbox-client";

/** Exit-state labels for the dark console frame. Icon-free here; the label and colour are paired with the code itself. */
function outcome(e: Execution): { text: string; className: string } {
  switch (e.state) {
    case "succeeded":
      return { text: "exit 0", className: "text-media-green" };
    case "failed":
      return { text: `exit ${e.exitCode}`, className: "text-media-red" };
    case "timed_out":
      return { text: "timed out, no exit code", className: "text-media-amber" };
    case "cancelled":
      return { text: "cancelled", className: "text-media-ink-3" };
    case "error":
      return { text: `didn't finish (${e.failure ?? "unknown"})`, className: "text-media-red" };
    default:
      return { text: "running", className: "text-media-cyan" };
  }
}

interface LiveRun {
  command: string;
  executionId: string | null;
  out: { stream: "stdout" | "stderr"; text: string }[];
}

export function SandboxConsole({
  client,
  sessionId,
  initial,
  canRun,
  disabledReason,
  canCancel,
  onFinished,
}: {
  client: FarbaekSandboxClient;
  sessionId: string;
  initial: Execution[];
  canRun: boolean;
  disabledReason: string | null;
  canCancel: boolean;
  onFinished?: (e: Execution) => void;
}) {
  // Oldest first, so the newest run sits next to the prompt.
  const [runs, setRuns] = useState<Execution[]>(() => [...initial].reverse());
  const [live, setLive] = useState<LiveRun | null>(null);
  const [command, setCommand] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [runs, live]);

  const history = [...runs.map((r) => r.command)].reverse();

  async function run() {
    const text = command.trim();
    if (!text || live) return;
    setError(null);
    setCommand("");
    setHistoryIndex(null);
    const current: LiveRun = { command: text, executionId: null, out: [] };
    setLive(current);
    try {
      for await (const event of client.runStream(sessionId, text)) {
        if (event.type === "start") setLive((l) => (l ? { ...l, executionId: event.executionId } : l));
        else if (event.type === "stdout" || event.type === "stderr") {
          const chunk = { stream: event.type, text: event.data };
          setLive((l) => (l ? { ...l, out: [...l.out, chunk].slice(-400) } : l));
        } else if (event.type === "end") {
          setRuns((r) => [...r, event.execution].slice(-60));
          onFinished?.(event.execution);
        }
      }
    } catch (e) {
      setError(e instanceof FarbaekApiError ? e.message : "The command couldn't be sent. Check your connection; nothing ran twice.");
      setCommand(text);
    } finally {
      setLive(null);
    }
  }

  async function cancel() {
    if (!live?.executionId) return;
    try {
      await client.cancel(sessionId, live.executionId);
    } catch (e) {
      setError(e instanceof FarbaekApiError ? e.message : "Cancelling failed.");
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void run();
    } else if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      const next = historyIndex === null ? 0 : Math.min(history.length - 1, historyIndex + 1);
      setHistoryIndex(next);
      setCommand(history[next] ?? "");
    } else if (e.key === "ArrowDown" && historyIndex !== null) {
      e.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(next < 0 ? null : next);
      setCommand(next < 0 ? "" : (history[next] ?? ""));
    }
  }

  return (
    <section aria-label="Console" className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-media text-media-ink">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <span className="flex items-center gap-2 text-[13px] font-medium text-media-ink-2">
          <TerminalWindowIcon size={16} aria-hidden /> Console
        </span>
        <span className="text-xs text-media-ink-3">Commands run in /home/user/project, one at a time.</span>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[13px] leading-relaxed" aria-live="polite">
        {runs.length === 0 && !live ? <p className="text-media-ink-3">No commands yet. Try node --version or ls.</p> : null}
        {runs.map((r) => {
          const o = outcome(r);
          return (
            <div key={r.id} className="mb-3">
              <p className="text-media-accent">
                <span aria-hidden>$ </span>
                {r.command}
              </p>
              {r.stdout ? <pre className="whitespace-pre-wrap break-words text-media-ink">{r.stdout}</pre> : null}
              {r.stderr ? <pre className="whitespace-pre-wrap break-words text-media-red">{r.stderr}</pre> : null}
              <p className={`text-xs ${o.className}`}>
                [{o.text}
                {r.durationMs !== null ? `, ${(r.durationMs / 1000).toFixed(1)} s` : ""}
                {r.truncated.stdout || r.truncated.stderr ? ", output shortened" : ""}]
              </p>
            </div>
          );
        })}
        {live ? (
          <div className="mb-3">
            <p className="text-media-accent">
              <span aria-hidden>$ </span>
              {live.command}
            </p>
            {live.out.map((c, i) => (
              <pre key={i} className={`whitespace-pre-wrap break-words ${c.stream === "stderr" ? "text-media-red" : "text-media-ink"}`}>
                {c.text}
              </pre>
            ))}
            <p className="text-xs text-media-cyan">[running]</p>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="border-t border-white/10 px-4 py-2 text-sm text-media-red">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
        <span aria-hidden className="font-mono text-media-accent">
          $
        </span>
        <label htmlFor={`cmd-${sessionId}`} className="sr-only">
          Command
        </label>
        <input
          id={`cmd-${sessionId}`}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onKey}
          disabled={!canRun || Boolean(live)}
          placeholder={canRun ? (live ? "Waiting for the running command…" : "Type a command and press Enter") : (disabledReason ?? "Not available")}
          autoComplete="off"
          spellCheck={false}
          className="h-11 min-w-0 flex-1 bg-transparent font-mono text-base text-media-ink placeholder:text-media-ink-3 focus:outline-none disabled:cursor-not-allowed sm:text-sm"
        />
        {live ? (
          <button
            type="button"
            onClick={cancel}
            disabled={!canCancel || !live.executionId}
            className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/20 px-4 text-sm text-media-ink hover:bg-white/10 disabled:opacity-50"
          >
            <ProhibitIcon size={16} aria-hidden /> Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void run()}
            disabled={!canRun || !command.trim()}
            className="inline-flex h-11 items-center rounded-full bg-media-accent px-4 text-sm font-medium text-media hover:brightness-110 disabled:opacity-40"
          >
            Run
          </button>
        )}
      </div>
    </section>
  );
}
