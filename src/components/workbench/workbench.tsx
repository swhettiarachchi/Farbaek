"use client";

/**
 * Build's workspace (stage 202, ADR 0219): one screen for a project, in the same design language as Chat. A rounded window
 * on a pale stage with the spectrum's light behind its edges, and four panes inside it: the Agent (the request, its plan, the
 * live steps and the way to answer), the Preview, the Code and the Output. On a wide screen the Agent sits beside the
 * Preview or the Code, with Output as a drawer under them, and the borders between them drag. On a phone or a tablet it is one
 * pane at a time, chosen from the bar at the bottom.
 *
 * Every control here does something real or says why it can't: the sample workspace reads everything and changes nothing.
 */
import { BrowserIcon, CodeIcon, HammerIcon, InfoIcon, TerminalWindowIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ToastProvider } from "@/components/chat/primitives";
import { useRunFeed } from "@/components/build/use-run-feed";
import { isLive } from "@/core/agent/cloud-run";
import { runCommands, runFiles } from "@/core/agent/run-phase";
import { AGENT_SPLIT, OUTPUT_SPLIT, clampSplit, stepSplit, type SplitLimits } from "@/core/workbench/split";
import type { RunEventView, RunView } from "@/server/cloud-agent/store";
import type { WorkbenchData } from "@/server/workbench/types";
import { AgentPane } from "./agent-pane";
import { CodePane, type CodeHandle } from "./code-pane";
import { OutputPane } from "./output-pane";
import { PreviewPane } from "./preview-pane";
import { WorkbenchStage } from "./stage";
import { useLayout } from "./use-layout";

type PaneId = "agent" | "preview" | "code" | "output";

const PANES: { id: PaneId; label: string; icon: Icon }[] = [
  { id: "agent", label: "Agent", icon: HammerIcon },
  { id: "preview", label: "Preview", icon: BrowserIcon },
  { id: "code", label: "Code", icon: CodeIcon },
  { id: "output", label: "Output", icon: TerminalWindowIcon },
];

export function Workbench({ data }: { data: WorkbenchData }) {
  return (
    <ToastProvider>
      <Frame data={data} />
    </ToastProvider>
  );
}

interface Feed {
  run: RunView;
  events: RunEventView[];
  usage: WorkbenchData["usage"];
}

/**
 * Keeps the open task's run current and hands it up. It draws nothing, and it is the only thing keyed by the run: the frame
 * and its panes stay as they are when a run starts or changes, so an unsaved edit in the Code pane is never dropped by
 * pressing Approve and build.
 */
function RunFeed({ run, events, usage, onFeed }: { run: RunView; events: RunEventView[]; usage: WorkbenchData["usage"]; onFeed: (feed: Feed) => void }) {
  const router = useRouter();
  const feed = useRunFeed({ initialRun: run, initialEvents: events, initialUsage: usage });
  useEffect(() => {
    onFeed({ run: feed.run, events: feed.events, usage: feed.usage });
  }, [feed.run, feed.events, feed.usage, onFeed]);
  // When the run ends, read the page again: the change, the task's state and the preview's key all move with it.
  const wasLive = useRef(feed.live);
  useEffect(() => {
    if (wasLive.current && !feed.live) router.refresh();
    wasLive.current = feed.live;
  }, [feed.live, router]);
  return null;
}

function Frame({ data }: { data: WorkbenchData }) {
  const [layout, setLayout] = useLayout();
  const [pane, setPane] = useState<PaneId>("agent");
  const [fed, setFed] = useState<Feed | null>(null);
  // A border is being dragged: the frames under the pointer stop taking it meanwhile.
  const [dragging, setDragging] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const middle = useRef<HTMLDivElement>(null);
  const codePane = useRef<CodeHandle>(null);

  // The page's own run, until the feed has something newer for that same run.
  const feed = fed && data.run && fed.run.id === data.run.id ? fed : null;
  const run = feed?.run ?? data.run;
  const events = feed?.events ?? data.events;
  const usage = feed ? feed.usage : data.usage;
  const live = run ? isLive(run.status) : false;
  const commands = runCommands(events);
  const changed = runFiles(events).changed;

  // From a changed file in Output: the Code pane opens it through its own guard, so unsaved edits are asked about first.
  const openFile = (path: string) => {
    codePane.current?.open(path);
    setLayout({ view: "code" });
    setPane("code");
  };

  // While a border is dragged its share goes straight onto the frame's own style, so the panes aren't drawn again on every
  // movement; the layout is saved once, when the pointer lets go.
  const dragBorder = (name: "--wb-agent" | "--wb-output", value: number | null) => {
    if (value === null) return setDragging(false);
    setDragging(true);
    body.current?.style.setProperty(name, `${value * 100}%`);
  };

  const agent = <AgentPane data={data} run={run} events={events} usage={usage} live={live} />;
  const preview = <PreviewPane projectId={data.project.id} taskId={data.task?.id ?? null} previewKey={data.previewKey} demo={data.demo} />;
  const code = <CodePane ref={codePane} projectId={data.project.id} files={data.files} editOff={data.editOff} />;
  const output = <OutputPane taskId={data.task?.id ?? null} commands={commands} changed={changed} check={data.check} live={live} hasRun={run !== null} demo={data.demo} onOpenFile={openFile} />;

  return (
    <WorkbenchStage heading={`Build, ${data.project.name}`} name={data.project.name} skip={{ href: "#workbench-agent", label: "Skip to the agent" }}>
      {data.run ? <RunFeed key={data.run.id} run={data.run} events={data.events} usage={data.usage} onFeed={setFed} /> : null}

        {/* Own-frame pages don't get the app's bands, so the workspace says these itself. */}
        {data.demo || data.project.archived ? (
          <p className="flex shrink-0 items-start gap-2 border-b border-line bg-canvas-2 px-4 py-2 text-sm text-ink-2">
            <InfoIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-info" aria-hidden />
            <span>{data.demo ? "This is the sample workspace: everything here can be looked at, and nothing is saved or built." : "This project is archived: it can be read here, and it can't take new work."}</span>
          </p>
        ) : null}

        {/* Each pane is drawn once. On a wide screen the Agent sits beside the middle, with Output as a drawer under it; on a
            phone or a tablet the bar at the bottom chooses the one pane that shows. Only the classes differ. */}
        <div
          ref={body}
          style={{ "--wb-agent": `${layout.agent * 100}%`, "--wb-output": `${layout.output * 100}%` } as CSSProperties}
          className={`min-h-0 flex-1 lg:flex ${dragging ? "select-none [&_iframe]:pointer-events-none" : ""}`}
        >
          <section id="workbench-agent" aria-label="Agent" className={`h-full min-w-0 flex-col bg-canvas-2 lg:flex lg:h-auto lg:w-[var(--wb-agent)] lg:shrink-0 ${pane === "agent" ? "flex" : "hidden"}`}>
            {agent}
          </section>
          <Separator
            axis="x"
            label="Agent width"
            className="hidden lg:block"
            value={layout.agent}
            limits={AGENT_SPLIT}
            share={(e) => {
              const r = body.current?.getBoundingClientRect();
              return r ? (e.clientX - r.left) / r.width : layout.agent;
            }}
            onLive={(value) => dragBorder("--wb-agent", value)}
            onCommit={(agentWidth) => setLayout({ agent: agentWidth })}
          />
          <div ref={middle} className={`min-w-0 flex-col lg:flex lg:h-auto lg:flex-1 ${pane === "agent" ? "hidden" : "flex h-full"}`}>
            <div className="hidden h-12 shrink-0 items-center gap-2 border-b border-line px-3 lg:flex pointer-coarse:h-14">
              <div role="group" aria-label="Show" className="inline-flex rounded-full bg-canvas-2 p-1 ring-1 ring-line">
                {(["preview", "code"] as const).map((v) => {
                  const p = PANES.find((x) => x.id === v)!;
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={layout.view === v}
                      onClick={() => setLayout({ view: v })}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm text-ink-2 transition-colors duration-150 hover:text-ink pointer-coarse:min-h-11 aria-pressed:bg-surface aria-pressed:font-medium aria-pressed:text-ink aria-pressed:shadow-e1"
                    >
                      <p.icon size={14} weight="bold" aria-hidden />
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                aria-expanded={layout.outputOpen}
                aria-controls="workbench-output"
                onClick={() => setLayout({ outputOpen: !layout.outputOpen })}
                className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm text-ink-2 transition-colors duration-150 hover:bg-surface-raised hover:text-ink pointer-coarse:min-h-11 aria-expanded:bg-surface-raised aria-expanded:text-ink"
              >
                <TerminalWindowIcon size={14} weight="bold" aria-hidden />
                Output
                {commands.length > 0 ? <span className="tabular text-xs text-ink-3">{commands.length}</span> : null}
              </button>
            </div>
            <section aria-label="Preview" className={`min-h-0 flex-1 overflow-hidden ${pane === "preview" ? "max-lg:block" : "max-lg:hidden"} ${layout.view === "preview" ? "lg:block" : "lg:hidden"}`}>
              {preview}
            </section>
            <section aria-label="Code" className={`min-h-0 flex-1 overflow-hidden ${pane === "code" ? "max-lg:block" : "max-lg:hidden"} ${layout.view === "code" ? "lg:block" : "lg:hidden"}`}>
              {code}
            </section>
            <Separator
              axis="y"
              label="Output height"
              className={`hidden ${layout.outputOpen ? "lg:block" : ""}`}
              value={layout.output}
              limits={OUTPUT_SPLIT}
              share={(e) => {
                const r = middle.current?.getBoundingClientRect();
                return r ? (r.bottom - e.clientY) / r.height : layout.output;
              }}
              onLive={(value) => dragBorder("--wb-output", value)}
              onCommit={(height) => setLayout({ output: height })}
            />
            <section
              id="workbench-output"
              aria-label="Output"
              className={`min-h-0 overflow-hidden bg-canvas-2 ${pane === "output" ? "max-lg:block max-lg:flex-1" : "max-lg:hidden"} ${layout.outputOpen ? "lg:block lg:h-[var(--wb-output)] lg:shrink-0" : "lg:hidden"}`}
            >
              {output}
            </section>
          </div>
        </div>

        <nav aria-label="Panes" className="grid shrink-0 grid-cols-4 border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] lg:hidden">
          {PANES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={pane === p.id}
              onClick={() => setPane(p.id)}
              className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs text-ink-3 transition-colors duration-150 aria-pressed:font-medium aria-pressed:text-ink"
            >
              <p.icon size={20} weight={pane === p.id ? "fill" : "bold"} className={pane === p.id ? "text-spark-leaf" : ""} aria-hidden />
              {p.label}
            </button>
          ))}
        </nav>
    </WorkbenchStage>
  );
}

/**
 * The border between two panes: drag it, or focus it and use the arrow keys (Home and End for the limits). It holds the
 * pointer while dragging, so the preview's frame can't swallow the movement.
 */
function Separator({
  axis,
  label,
  className = "",
  value,
  limits,
  share,
  onLive,
  onCommit,
}: {
  axis: "x" | "y";
  label: string;
  className?: string;
  value: number;
  limits: SplitLimits & { start: number };
  /** The share the pointer is at, from where it is on the screen. */
  share: (e: ReactPointerEvent<HTMLDivElement>) => number;
  onLive: (value: number | null) => void;
  onCommit: (value: number) => void;
}) {
  const dragging = useRef(false);
  const latest = useRef(value);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = stepSplit(value, e.key, limits, axis === "x" ? "ArrowRight" : "ArrowUp");
    if (next === value) return;
    e.preventDefault();
    onCommit(next);
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={Math.round(limits.min * 100)}
      aria-valuemax={Math.round(limits.max * 100)}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        latest.current = value;
        onLive(value);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        latest.current = clampSplit(share(e), limits);
        onLive(latest.current);
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onLive(null);
        onCommit(latest.current);
      }}
      onPointerCancel={() => {
        dragging.current = false;
        onLive(null);
      }}
      className={`group relative z-10 shrink-0 touch-none outline-none ${axis === "x" ? "-mx-1 w-2 cursor-col-resize" : "-my-1 h-2 cursor-row-resize"} ${className}`}
    >
      <span
        aria-hidden
        className={`absolute bg-line transition-colors duration-150 group-hover:bg-accent group-focus-visible:bg-accent ${axis === "x" ? "inset-y-0 left-1/2 w-px group-hover:w-0.5 group-focus-visible:w-0.5" : "inset-x-0 top-1/2 h-px group-hover:h-0.5 group-focus-visible:h-0.5"}`}
      />
    </div>
  );
}
