import { ArrowRightIcon, BlocksIcon, ClipboardTextIcon, ClockCounterClockwiseIcon, FileTextIcon, FolderSimpleIcon, GitDiffIcon, LayoutIcon, ListNumbersIcon } from "@/components/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/app/live-refresh";
import { CardTitle, Notice } from "@/components/app/primitives";
import { SiteThumb } from "@/components/app/site-thumb";
import { AgentCore } from "@/components/build/agent-core";
import { PromptComposer } from "@/components/build/prompt-composer";
import { RunStatusBadge } from "@/components/build/run-status";
import { StartRun } from "@/components/build/start-run";
import { Disclosure } from "@/components/ui/disclosure";
import { LocalTime } from "@/components/ui/local-time";
import { PAGE_STACK } from "@/components/ui/surfaces";
import { FOCUSED_TITLE } from "@/components/ui/titles";
import { TEMPLATE_STARTERS, galleryStarter } from "@/content/starters";
import { workbenchPath } from "@/core/agent/build-surface";
import { isLive } from "@/core/agent/cloud-run";
import { promptFromShare } from "@/core/agent/prompt-start";
import { EFFORT_LABELS } from "@/core/agent/routing";
import { workspacePhase } from "@/core/agent/run-phase";
import { buildTargets } from "@/core/workspace/build-target";
import { withheldFor } from "@/core/workspace/permissions";
import { resolveAiProvider } from "@/server/ai/config";
import { listRuns, type RunView } from "@/server/cloud-agent/store";
import { sandboxExecutionMode } from "@/server/sandbox/registry";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Build" };

type Props = { searchParams: Promise<{ resume?: string; template?: string; title?: string; text?: string; url?: string }> };

// A real sequence: each step needs the one before it.
const FLOW = [
  { icon: FileTextIcon, title: "Describe", text: "Write the outcome you want as a task in a project." },
  { icon: ClipboardTextIcon, title: "Agree", text: "AI drafts a plan. You read it and approve it." },
  { icon: BlocksIcon, title: "Build", text: "The agent works in the cloud, runs the checks and asks before anything risky." },
  { icon: GitDiffIcon, title: "Review", text: "You check every change and apply it. You also get a ProofPack, the record of what was checked." },
];

/** How many projects and runs the page lists before it folds the rest. */
const SHOWN = { projects: 6, runs: 5 } as const;

/**
 * Where every build starts (stage 286, ADR 0294): one page, in the app's frame. It holds the box, then what is waiting for
 * the person, their projects to open in Build's workspace, the templates and the runs. The New build page and the
 * workspace's own start led to the same things from two more places; both now arrive here.
 *
 * A request written here opens Build's workspace for its project, with the plan waiting in the Agent pane.
 */
export default async function BuildPage({ searchParams }: Props) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const { resume, template: templateId, title, text, url } = await searchParams;
  // Shared to Farbaek from another app (ADR 0171): the box shows it as a draft, and this says where it came from.
  const shared = promptFromShare({ title, text, url });
  const template = galleryStarter(templateId);

  const ai = resolveAiProvider();
  const sandbox = sandboxExecutionMode();
  const contributor = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);

  const [tasks, runs, projects] = await Promise.all([
    ctx.reader.listTasks(ws.id),
    ctx.mode === "live"
      ? createSupabaseServerClient().then((c) => (c ? listRuns(c, ws.id) : ([] as RunView[]))).catch(() => [] as RunView[])
      : Promise.resolve([] as RunView[]),
    ctx.reader.listProjects(ws.id).catch(() => []),
  ]);
  // A template starts a new project, so a full plan says so before anything is written. Otherwise the box offers the projects there are (stage 176).
  const targets = buildTargets(projects, ws.plan.limits.workspaces);
  const planReason =
    ctx.mode === "demo"
      ? "The demo workspace is read-only."
      : !ctx.writes.enabled
        ? ctx.writes.reason
        : !contributor
          ? "Your role can view work but not start builds."
          : template && targets.newProject
            ? targets.newProject
            : null;
  const startReason = !ctx.writes.enabled
    ? ctx.writes.reason
    : !contributor
      ? "Your role can view runs but not start them."
      : ai.provider !== "anthropic"
        ? ai.provider
          ? "Cloud runs aren't available on this server yet."
          : ai.reason
        : null;

  const open = projects.filter((p) => !p.archivedAt);
  const busy = new Set(runs.filter((r) => ["starting", "working", "waiting"].includes(r.status)).map((r) => r.taskId));
  const ready = tasks.filter((t) => t.state === "CONTRACT_APPROVED");
  const going = runs.filter((r) => isLive(r.status)).length;
  const waitingRun = runs.find((r) => r.status === "waiting");
  const latest = runs.slice(0, SHOWN.runs);
  const earlier = runs.slice(SHOWN.runs);

  const flow = (
    <ol className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4" aria-label="How a build works">
      {FLOW.map((s) => (
        <li key={s.title} className="bg-surface p-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <s.icon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden /> {s.title}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.text}</p>
        </li>
      ))}
    </ol>
  );

  const projectRow = (p: (typeof open)[number]) => (
    <li key={p.id}>
      <Link
        href={workbenchPath(p.id)}
        className="group flex h-full min-h-16 items-center gap-3 rounded-md border border-line bg-surface p-3.5 shadow-e1 transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-e2"
      >
        <FolderSimpleIcon size={20} weight="bold" className="shrink-0 text-ink-2" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
          {p.description ? <span className="block truncate text-xs text-ink-3">{p.description}</span> : null}
        </span>
        <ArrowRightIcon size={16} weight="bold" className="shrink-0 text-ink-3 motion-safe:transition-transform motion-safe:duration-200 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
      </Link>
    </li>
  );

  const runRow = (r: RunView) => (
    <li key={r.id}>
      <Link href={`/app/build/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 hover:bg-canvas-2 sm:px-5">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-body font-medium">{r.taskTitle}</span>
          <span className="block text-xs text-ink-3">
            {r.projectName}, {EFFORT_LABELS[r.effort].title.toLowerCase()} effort. Started <LocalTime iso={r.startedAt} />
          </span>
        </span>
        <RunStatusBadge status={r.status} />
      </Link>
    </li>
  );

  return (
    <div className={PAGE_STACK}>
      {/* The lists promise live steps, so the page keeps up while a run is going or waiting. */}
      <LiveRefresh active={going > 0 || Boolean(waitingRun)} />

      {/* Build opens as Home and Chat do (ADR 0228): one question and one box, in the middle of the page. */}
      <header className="mx-auto grid w-full max-w-3xl justify-items-center gap-3 pt-1 text-center sm:pt-8">
        <h1 className={FOCUSED_TITLE}>What shall we build?</h1>
        <p className="max-w-[52ch] text-body leading-relaxed text-ink-2">Describe a site or an app, or a change to one you have. Farbaek drafts a plan for you to approve, then builds it.</p>
      </header>

      <section id="start" aria-label="Start a build" className="mx-auto grid w-full max-w-3xl scroll-mt-24 gap-4">
        {shared ? <p className="text-center text-body text-ink-2">This comes from what you shared. Nothing starts until you press Plan it.</p> : null}
        {template ? (
          <div className="grid items-center gap-4 rounded-md border border-line bg-surface p-3 shadow-e1 sm:grid-cols-[200px_minmax(0,1fr)]">
            <SiteThumb src={`/app/templates/${template.id}/thumbnail`} name={template.name} />
            <div className="grid gap-1 px-1">
              <p className="text-title-4 font-medium">{template.name} template</p>
              <p className="text-sm text-ink-2">{template.summary} Its content is sample text the agent replaces.</p>
              <Link href="/app/templates" className="mt-1 inline-flex min-h-11 w-fit items-center text-sm font-medium text-accent hover:underline">
                Choose another template
              </Link>
            </div>
          </div>
        ) : null}
        <div className="aurora">
          {/* Someone new gets the tall box with examples to press. Once there are projects, the shorter one, so their work sits higher. */}
          <PromptComposer
            // Asked to send a kept sentence while this page is already open (the palette's "Plan a build"): a fresh box, so the
            // kept sentence is what goes, never what was lying in the old one.
            key={resume === "1" ? "resume" : "start"}
            mode="app"
            surface="workbench"
            size={open.length === 0 || template ? "large" : "compact"}
            autoResume={resume === "1" && !template}
            disabledReason={planReason}
            targets={template ? undefined : targets}
            template={template ? { id: template.id, name: template.name, example: template.examplePrompt ?? template.summary } : undefined}
          />
        </div>
        <ul className="grid justify-center text-sm text-ink-3 sm:flex sm:flex-wrap sm:gap-x-6">
          {[
            { lead: "Built it elsewhere?", href: "/app/rescue", label: "Check your app" },
            { lead: "Prefer to set things up yourself?", href: "/app/projects", label: "Create a project" },
          ].map((w) => (
            <li key={w.href} className="flex flex-wrap items-center gap-x-1.5">
              {w.lead}
              <Link href={w.href} className="inline-flex min-h-11 items-center gap-1 font-medium text-accent hover:underline">
                {w.label} <ArrowRightIcon size={14} weight="bold" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Said before anything is started, on a server that can't run checks: a person who plans here approves in the workspace. */}
      {sandbox.mode !== "sandboxed" ? <Notice>Runs prepare the change without running tests or builds. {sandbox.reason}</Notice> : null}

      {/* The agent is drawn only while it is at work or waiting for the person: its motion means something is live. */}
      {waitingRun || going > 0 ? (
        <AgentCore phase={workspacePhase(runs.map((r) => r.status))}>
          <p className="text-sm leading-relaxed text-ink-2">
            {waitingRun ? (
              <>
                A run is waiting for you to approve a command.{" "}
                <Link href={`/app/build/${waitingRun.id}`} className="font-medium text-accent hover:underline">
                  Open the run
                </Link>
              </>
            ) : (
              `${going} ${going === 1 ? "run is" : "runs are"} going. Each one shows its steps live.`
            )}
          </p>
        </AgentCore>
      ) : null}

      {ready.length > 0 ? (
        <section aria-labelledby="ready-heading" className="grid gap-4">
          <CardTitle id="ready-heading" icon={BlocksIcon}>
            Ready to build
          </CardTitle>
          <ul className="grid gap-4 lg:grid-cols-2">
            {ready.map((t) => (
              <li key={t.id} className="grid gap-4 rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
                <div className="min-w-0">
                  <Link href={`/app/tasks/${t.id}`} className="-my-3 inline-flex min-h-11 items-center text-body font-medium hover:underline">
                    {t.title}
                  </Link>
                  <p className="mt-1 text-sm text-ink-3">Plan approved. Press Build with the agent to start.</p>
                </div>
                <StartRun taskId={t.id} disabledReason={busy.has(t.id) ? "The agent is already working on this task." : (startReason ?? withheldFor(ctx.role, ctx.permissions, "run_agents"))} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {open.length > 0 ? (
        <section id="projects" aria-labelledby="projects-heading" className="grid scroll-mt-24 gap-4">
          <CardTitle id="projects-heading" icon={FolderSimpleIcon}>
            Open a project
          </CardTitle>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{open.slice(0, SHOWN.projects).map(projectRow)}</ul>
          {/* Every open project opens in the workspace from here: the first few, then the rest folded. */}
          {open.length > SHOWN.projects ? (
            <Disclosure summary="More projects" icon={<FolderSimpleIcon size={20} weight="bold" />}>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{open.slice(SHOWN.projects).map(projectRow)}</ul>
            </Disclosure>
          ) : null}
        </section>
      ) : null}

      {!template ? (
        <section aria-labelledby="start-from" className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle id="start-from" icon={LayoutIcon}>
              Start from a template
            </CardTitle>
            <Link href="/app/templates" className="inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
              Preview them <ArrowRightIcon size={14} weight="bold" aria-hidden />
            </Link>
          </div>
          {/* A swipeable rail on phones, with the next card peeking in; a grid from tablets up. */}
          <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4 [&::-webkit-scrollbar]:hidden">
            {TEMPLATE_STARTERS.map((t) => (
              <li key={t.id} className="w-[62%] shrink-0 snap-start sm:w-auto">
                <Link
                  href={`/app/build?template=${t.id}`}
                  className="group block h-full rounded-md border border-line bg-surface p-2 shadow-e1 transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-e2"
                >
                  <SiteThumb src={`/app/templates/${t.id}/thumbnail`} name={t.name} className="ring-1 ring-line/80" />
                  <span className="block px-2 pb-1.5 pt-3 text-sm font-medium transition-colors duration-200 group-hover:text-accent">{t.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {runs.length > 0 ? (
        <section aria-labelledby="runs-heading" className="grid gap-4">
          <CardTitle id="runs-heading" icon={ClockCounterClockwiseIcon}>
            Runs
          </CardTitle>
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">{latest.map(runRow)}</ul>
          {earlier.length > 0 ? (
            <Disclosure summary="Earlier runs" icon={<ClockCounterClockwiseIcon size={20} weight="bold" />}>
              <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">{earlier.map(runRow)}</ul>
            </Disclosure>
          ) : null}
        </section>
      ) : null}

      {/* Someone new reads how it goes; once a workspace has run anything, the steps fold away. */}
      {runs.length === 0 ? (
        flow
      ) : (
        <Disclosure summary="How a build works" icon={<ListNumbersIcon size={20} weight="bold" />}>
          {flow}
        </Disclosure>
      )}
    </div>
  );
}
