import { waitingChanges } from "@/server/workspace/waiting-changes";
import { ArrowRightIcon, GaugeIcon, BlocksIcon, ListBulletsIcon, SealCheckIcon, FolderSimpleIcon } from "@/components/icons";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, EmptyState, Notice, TaskStateBadge } from "@/components/app/primitives";
import { BrandLogo } from "@/components/brand/brand-logo";
import { FOCUSED_TITLE } from "@/components/ui/titles";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { NeedsYouCard } from "@/components/app/needs-you-card";
import { SuggestedNext } from "@/components/app/suggested-next";
import { ProjectCard } from "@/components/app/project-card";
import { UsageMeterList } from "@/components/app/usage-meters";
import { PromptComposer } from "@/components/build/prompt-composer";
import { StartBox } from "@/components/app/start-box";
import { SpaceDoors } from "@/components/app/space-doors";
import { buildTargets } from "@/core/workspace/build-target";
import { ButtonLink } from "@/components/ui/button";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { getPlan } from "@/core/billing/catalog";
import { needsYou } from "@/core/realityloop/needs-you";
import { suggestNext } from "@/core/telepathy/next-steps";
import { withheldFor } from "@/core/workspace/permissions";
import { TERMINAL_STATES } from "@/core/realityloop/task-machine";
import { firstSteps } from "@/core/workspace/first-steps";
import { FirstStepsHidden, FirstStepsPanel } from "@/components/app/first-steps";
import { siteDomain } from "@/server/publish/config";
import { FIRST_STEPS_COOKIE, hiddenWorkspaces } from "@/server/workspace/first-steps";
import { loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";
import { currentExecutionMode } from "@/server/execution/sandbox";
import { groupInbox } from "@/core/agent/inbox";
import { loadInbox } from "@/server/cloud-agent/inbox";
import { AgentInbox } from "@/components/build/agent-inbox";
import { LiveRefresh } from "@/components/app/live-refresh";
import { aiMeter, loadUsageSummary } from "@/server/workspace/usage-summary";
import { PAGE_STACK } from "@/components/ui/surfaces";
import { ScheduledHomeCard } from "@/components/scheduled/home-card";
import { scheduledOnHome } from "@/core/automation/home";
import { loadScheduledWork } from "@/server/automation/work";
import { loadLiveProjects } from "@/server/telepathy/live-projects";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Home" };

const number = new Intl.NumberFormat("en-US");

export default async function MissionControl() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const [usage, recentEvidence, inbox, stepRecords, jar, scheduledWork, liveRead] = await Promise.all([
    loadUsageSummary(ctx, ws),
    ctx.reader.listRecentProofPacks(ws.id, 5),
    ctx.mode === "live" ? loadInbox(ws.id) : Promise.resolve(null),
    // Without these records the steps still read tasks; they never claim more than they can see.
    ctx.reader.getFirstStepRecords(ws.id).catch(() => ({ latestProofPack: null, verifiedTaskId: null, liveSite: null })),
    cookies(),
    loadScheduledWork(ctx.mode, ws.id),
    // Which projects have a live site, for what Home may suggest next (stage 283). The demo's one live site is in its step records.
    ctx.mode === "live" ? loadLiveProjects(ws.id) : Promise.resolve(null),
  ]);
  const { tasks, projects } = usage;
  const ai = usage.wallet ? aiMeter(usage.wallet) : null;
  const runs = inbox?.runs ?? [];
  const lanes = groupInbox(runs, inbox?.proposals ?? new Map());
  const live = lanes.working.length + lanes.needs_you.length > 0;

  // The newest work first, as live pictures of each site.
  const recent = projects
    .filter((p) => !p.archivedAt)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 4);
  // Nothing in an archived project can change, so it never asks for anyone's turn, and its tasks aren't open work.
  const archived = new Set(projects.filter((p) => p.archivedAt).map((p) => p.id));
  const activeProjects = projects.length - archived.size;
  const unfinished = tasks.filter((t) => !TERMINAL_STATES.has(t.state) && !archived.has(t.projectId));
  // The demo is a tour of what people see, as on a task's page. A read-only workspace has its own notice, and nobody can act.
  const tour = ctx.mode === "demo";
  const manager = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const sorted = await waitingChanges(ctx.reader, { orgId: ws.id, tasks, archivedProjects: archived, role: ctx.role, permissions: ctx.permissions, tour }, new Date());
  // Only the person who started a run, or an owner or admin, can answer it.
  const questions = lanes.needs_you.filter((r) => !archived.has(r.projectId) && (tour || manager || r.startedBy === ctx.user.id));
  const scheduled = scheduledOnHome(scheduledWork.tasks ?? [], scheduledWork.runs, new Date());
  // A task Farbaek paused is this person's turn only if they can resume it: someone who can't sees it in the card, not as a step.
  const canSchedule = tour || (ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role));
  const needs = tour || ctx.writes.enabled ? needsYou({ ...sorted, questions, scheduledStopped: canSchedule ? scheduled?.stopped : [] }) : null;
  const limits = ws.plan.limits;
  // Only while the workspace is still on its trial: a paid plan bought during it doesn't move to Free.
  const trialDays = ws.plan.source === "trial" && ws.trial?.phase.phase === "active" ? ws.trial.phase.daysRemaining : null;

  const checksMode = currentExecutionMode();
  const steps = firstSteps(
    { projects: projects.filter((p) => !p.archivedAt), tasks, ...stepRecords },
    {
      checks: checksMode.mode === "sandboxed" ? null : checksMode.reason,
      publishing: siteDomain() ? null : "Publishing isn't set up on this server yet.",
    },
  );
  const stepsHidden = hiddenWorkspaces(jar.get(FIRST_STEPS_COOKIE)?.value).includes(ws.id);
  const showSteps = !steps.complete && !stepsHidden;
  // With nothing waiting for the person, and the first steps behind them, Home may suggest what to do next (stage 283, ADR 0291):
  // worked out from their tasks and live sites by tested rules, for someone who can act on it. Publishing is only suggested to
  // someone allowed to publish, where publishing is set up.
  const liveProjects = ctx.mode === "demo" ? (stepRecords.liveSite ? [stepRecords.liveSite.projectId] : []) : liveRead;
  const suggestions =
    !needs && !showSteps && canSchedule && (tour || ctx.writes.enabled)
      ? suggestNext({ now: new Date().getTime(), projects: projects.map((p) => ({ id: p.id, name: p.name, archived: Boolean(p.archivedAt) })), tasks, liveProjects, canPublish: siteDomain() !== null && withheldFor(ctx.role, ctx.permissions, "publish") === null })
      : [];
  // Until something is described, the first step is the build box at the top of the page (its link goes there).
  const firstBuildNext = showSteps && steps.steps[0]!.state === "next";
  // Once there are projects, the box offers them too; with the plan full it starts on the latest (stage 176).
  const composer = (
    <PromptComposer
      mode="app"
      size="compact"
      disabledReason={ctx.mode === "demo" ? "The demo workspace is read-only." : ctx.writes.enabled ? null : ctx.writes.reason}
      targets={buildTargets(projects, limits.workspaces)}
    />
  );

  return (
    <div className={PAGE_STACK}>
      {/* The main screen opens as every product studied does (ADR 0228): a greeting and one box, in the middle of the
          page. What needs the person comes straight after, then their work. */}
      <header className="mx-auto grid w-full max-w-3xl justify-items-center gap-3 pt-1 text-center sm:gap-4 sm:pt-8">
        <BrandLogo height={56} preload />
        <h1 className={FOCUSED_TITLE}>What can I help you with?</h1>
      </header>

      {/* Everyone gets the box under the greeting. Until something is described, Build leads: it is the first step. */}
      <section id="start" aria-label="Ask or build" className="aurora mx-auto w-full max-w-3xl scroll-mt-24">
        <StartBox build={composer} lead={firstBuildNext ? "build" : "ask"} />
      </section>

      {/* The plan in one quiet line: what it is, when a trial ends, and that nothing is charged. */}
      <p className="mx-auto max-w-2xl text-center text-label leading-relaxed text-ink-3">
        {trialDays !== null && ws.trial ? (
          <>
            {ws.name} is on the <span className="font-medium text-ink-2">{getPlan(ws.plan.planId).name}</span> trial, with {trialDays} {trialDays === 1 ? "day" : "days"} left. It ends on{" "}
            <LocalTime iso={ws.trial.endsAt} date />. Then the workspace moves to Free, and nothing is charged.{" "}
            <Link href="/app/billing" className="font-medium text-accent hover:underline">
              See usage
            </Link>
          </>
        ) : (
          <>
            {ws.name} is on the <span className="font-medium text-ink-2">{getPlan(ws.plan.planId).name}</span>
            {ws.plan.source === "trial" ? " trial" : " plan"}.
          </>
        )}
      </p>

      {needs ? <NeedsYouCard step={needs} /> : suggestions.length > 0 ? <SuggestedNext candidates={suggestions} /> : null}

      {showSteps ? <FirstStepsPanel data={steps} /> : null}

      <SpaceDoors />

      {ws.billingUnknown ? <Notice tone="warning">We couldn&apos;t read this workspace&apos;s plan, so some things are paused for safety. Please contact support.</Notice> : null}

      {recent.length > 0 ? (
        <section aria-labelledby="recent-heading" className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle id="recent-heading" icon={FolderSimpleIcon}>
              Recent work
            </CardTitle>
            <Link href="/app/projects" className="inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
              All projects <ArrowRightIcon size={14} weight="bold" aria-hidden />
            </Link>
          </div>
          {/* A swipeable rail on phones, with the next card peeking in; a grid from tablets up. */}
          <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
            {recent.map((p) => (
              <li key={p.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
                <ProjectCard id={p.id} name={p.name} compact meta={<>Created <RelativeTime iso={p.createdAt} /></>} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="inbox-heading" className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle id="inbox-heading" icon={BlocksIcon}>
            What the agent is doing
          </CardTitle>
          {/* Everything Farbaek is doing, builds and scheduled work alike, is on one page (stage 276). */}
          <Link href="/app/work" className="inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
            All work <ArrowRightIcon size={14} weight="bold" aria-hidden />
          </Link>
        </div>
        {ctx.mode !== "live" ? (
          <p className="text-sm leading-relaxed text-ink-2">Agent runs need a real workspace. The demo has none.</p>
        ) : inbox === null ? (
          <Notice tone="warning">The agent runs couldn&apos;t be read right now. Reload the page to try again.</Notice>
        ) : runs.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-2">
            No runs yet. Describe a build above, and Farbaek drafts a plan. Once you approve it, the agent works in the cloud on Farbaek&apos;s AI, so you don&apos;t need your own
            AI account.
          </p>
        ) : (
          <AgentInbox lanes={lanes} proposals={inbox.proposals} />
        )}
        <LiveRefresh active={live} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <CardTitle icon={ListBulletsIcon}>Recent tasks</CardTitle>
            <Link href="/app/tasks" className="-my-3 inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
              All tasks <ArrowRightIcon size={14} weight="bold" aria-hidden />
            </Link>
          </div>
          {/* The counts as a sentence, not tiles (ADR 0180): each number is real, and says what it counts. */}
          <WorkCounts projects={activeProjects} allowed={limits.workspaces} unfinished={unfinished.length} waiting={sorted.mine.length} />
          {tasks.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                icon={ListBulletsIcon}
                title="No tasks yet"
                action={<ButtonLink href={projects[0] ? `/app/projects/${projects[0].id}` : "/app/projects"} size="sm">{projects[0] ? "Add a task" : "Create a project"}</ButtonLink>}
              >
                Tasks live inside projects. Describe what you want, and Farbaek tracks it from plan to proof.
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {tasks.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <Link href={`/app/tasks/${t.id}`} className="group flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-body font-medium group-hover:text-accent">{t.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-3">
                        {t.projectName ?? "Project"} · updated <RelativeTime iso={t.updatedAt} />
                      </span>
                    </span>
                    <TaskStateBadge state={t.state} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid content-start gap-6">
          {scheduled ? <ScheduledHomeCard home={scheduled} /> : null}
          <Card>
            <div className="flex items-center justify-between gap-3">
              <CardTitle icon={GaugeIcon}>AI usage</CardTitle>
              <Link href="/app/billing" className="-my-3 inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
                Details <ArrowRightIcon size={14} weight="bold" aria-hidden />
              </Link>
            </div>
            <div className="mt-4">
              <UsageMeterList meters={ai ? [ai] : []} />
            </div>
            <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-ink-3">
              Failed AI steps are refunded, and unused usage carries over for a month on paid plans.
            </p>
          </Card>

        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <CardTitle icon={SealCheckIcon}>Recent proof</CardTitle>
        </div>
        {recentEvidence.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">Nothing yet. Each time you approve a change, Farbaek keeps a signed record of it, called a ProofPack.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {recentEvidence.map((p) => {
              const task = tasks.find((t) => t.id === p.taskId);
              return (
                <li key={p.digest}>
                  <Link href={`/app/tasks/${p.taskId}`} className="group flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-body font-medium group-hover:text-accent">{task?.title ?? "Task"}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-ink-3">
                      <StatusBadge {...proofStatus(p.status)} />
                      <RelativeTime iso={p.createdAt} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {stepsHidden && !steps.complete ? <FirstStepsHidden data={steps} /> : null}
    </div>
  );
}

/** A ProofPack's result, as its kind and word (ADR 0183). */
function proofStatus(status: string): { status: Status; label: string } {
  if (status === "verified") return { status: "verified", label: "Verified" };
  if (status === "partially_verified") return { status: "attention", label: "Partly verified" };
  if (status === "failed") return { status: "failed", label: "Failed" };
  return { status: "unverified", label: "Unverified" };
}

/** Home's counts in one or two sentences, with the number in each as its link. */
function WorkCounts({ projects, allowed, unfinished, waiting }: { projects: number; allowed: number | null; unfinished: number; waiting: number }) {
  if (projects === 0) return null;
  const n = (value: number) => <span className="font-medium tabular-nums text-ink">{number.format(value)}</span>;
  return (
    <p className="mt-1 text-sm leading-relaxed text-ink-2">
      You have{" "}
      <Link href="/app/projects" className="hover:underline">
        {n(projects)} active {projects === 1 ? "project" : "projects"}
      </Link>
      {allowed === null ? "." : <>, and your plan allows {n(allowed)}.</>}
      {/* A change waiting for approval belongs to a task that isn't finished, so it's only said beside one. */}
      {unfinished > 0 ? (
        <>
          {" "}
          Across them, {n(unfinished)} {unfinished === 1 ? "task isn't" : "tasks aren't"} finished yet
          {waiting > 0 ? (
            <>
              , and{" "}
              <Link href="/app/approvals" className="hover:underline">
                {n(waiting)} {waiting === 1 ? "change waits" : "changes wait"}
              </Link>{" "}
              for your yes or no.
            </>
          ) : (
            "."
          )}
        </>
      ) : null}
    </p>
  );
}
