import { ArrowRightIcon, ListChecksIcon, SquaresFourIcon, TrayIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, Notice, PageHeader, StatTile, TaskStateBadge } from "@/components/app/primitives";
import { ProjectCard } from "@/components/app/project-card";
import { UsageMeterList } from "@/components/app/usage-meters";
import { PromptComposer } from "@/components/build/prompt-composer";
import { ButtonLink } from "@/components/ui/button";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { TRIAL, getPlan } from "@/core/billing/catalog";
import { TERMINAL_STATES } from "@/core/realityloop/task-machine";
import { firstSteps } from "@/core/workspace/first-steps";
import { FirstStepsHidden, FirstStepsPanel } from "@/components/app/first-steps";
import { siteDomain } from "@/server/publish/config";
import { FIRST_STEPS_COOKIE, hiddenWorkspaces } from "@/server/workspace/first-steps";
import { loadAppContext } from "@/server/workspace/context";
import { currentExecutionMode } from "@/server/execution/sandbox";
import { listRuns, proposalStates, type RunView } from "@/server/cloud-agent/store";
import { groupInbox, type ProposalState } from "@/core/agent/inbox";
import { AgentInbox } from "@/components/build/agent-inbox";
import { LiveRefresh } from "@/components/app/live-refresh";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { aiMeter, loadUsageSummary } from "@/server/workspace/usage-summary";

export const metadata: Metadata = { title: "Home" };

const number = new Intl.NumberFormat("en-US");

/** Recent runs and the state of their proposals, read as the person. Null when they can't be read. */
async function loadInbox(orgId: string): Promise<{ runs: RunView[]; proposals: Map<string, ProposalState> } | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  try {
    const runs = await listRuns(client, orgId, { limit: 16 });
    const ids = runs.filter((r) => r.status === "finished" && r.proposalId).map((r) => r.proposalId!);
    return { runs, proposals: await proposalStates(client, orgId, ids) };
  } catch {
    return null;
  }
}

export default async function MissionControl() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const [usage, recentEvidence, inbox, stepRecords, jar] = await Promise.all([
    loadUsageSummary(ctx, ws),
    ctx.reader.listRecentProofPacks(ws.id, 5),
    ctx.mode === "live" ? loadInbox(ws.id) : Promise.resolve(null),
    // Without these records the steps still read tasks; they never claim more than they can see.
    ctx.reader.getFirstStepRecords(ws.id).catch(() => ({ latestProofPack: null, verifiedTaskId: null, liveSite: null })),
    cookies(),
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
  const open = tasks.filter((t) => !TERMINAL_STATES.has(t.state));
  const waiting = tasks.filter((t) => t.state === "APPROVAL_PENDING");
  const limits = ws.plan.limits;
  const trialActive = ws.trial?.phase.phase === "active";

  const steps = firstSteps(
    { projects: projects.filter((p) => !p.archivedAt), tasks, ...stepRecords },
    {
      checks: currentExecutionMode().mode === "sandboxed" ? null : "Checks can't run on this server yet, so changes stay unverified.",
      publishing: siteDomain() ? null : "Publishing isn't set up on this server yet.",
    },
  );
  const stepsHidden = hiddenWorkspaces(jar.get(FIRST_STEPS_COOKIE)?.value).includes(ws.id);
  const showSteps = !steps.complete && !stepsHidden;
  // Until something is described, the build box sits inside the first step.
  const composerInSteps = showSteps && steps.steps[0]!.state === "next";
  const composer = <PromptComposer mode="app" size="compact" disabledReason={ctx.mode === "demo" ? "The demo workspace is read-only." : ctx.writes.enabled ? null : ctx.writes.reason} />;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Home"
        description={
          <>
            {ws.name} is on the <span className="font-medium text-ink">{getPlan(ws.plan.planId).name}</span>
            {ws.plan.source === "trial" ? " trial" : " plan"}.
          </>
        }
      />

      {composerInSteps ? null : (
        <section id="start" aria-label="Start a build" className="aurora scroll-mt-24">
          {composer}
        </section>
      )}

      {showSteps ? <FirstStepsPanel data={steps} composer={composerInSteps ? composer : undefined} /> : null}

      {trialActive && ws.trial ? (
        <Notice>
          {ws.trial.phase.phase === "active" ? ws.trial.phase.daysRemaining : 0} days left in your {getPlan(TRIAL.basePlan).name} trial. It ends <LocalTime iso={ws.trial.endsAt} />, then
          this workspace moves to Free and nothing is charged. <Link href="/app/billing" className="font-medium text-accent hover:underline">See usage</Link>
        </Notice>
      ) : null}
      {ws.billingUnknown ? <Notice tone="warning">We couldn&apos;t read this workspace&apos;s plan, so some things are paused for safety. Please contact support.</Notice> : null}

      {recent.length > 0 ? (
        <section aria-labelledby="recent-heading" className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="recent-heading" className="flex items-center gap-2 text-lg font-medium">
              <SquaresFourIcon size={20} weight="bold" className="text-accent" aria-hidden /> Recent work
            </h2>
            <Link href="/app/projects" className="inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
              All projects <ArrowRightIcon size={14} aria-hidden />
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
          <h2 id="inbox-heading" className="flex items-center gap-2 text-lg font-medium">
            <TrayIcon size={20} weight="bold" className="text-accent" aria-hidden /> Agent inbox
          </h2>
          <Link href="/app/build" className="inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
            Build <ArrowRightIcon size={14} aria-hidden />
          </Link>
        </div>
        {ctx.mode !== "live" ? (
          <p className="text-sm leading-relaxed text-ink-2">Agent runs need a real workspace. The demo has none.</p>
        ) : inbox === null ? (
          <Notice tone="warning">The agent runs couldn&apos;t be read right now. Reload the page to try again.</Notice>
        ) : runs.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-2">
            No runs yet. Describe a build above: Farbaek drafts a plan, and once you approve it the agent works in the cloud on Farbaek&apos;s AI, with no API key.
          </p>
        ) : (
          <AgentInbox lanes={lanes} proposals={inbox.proposals} />
        )}
        <LiveRefresh active={live} />
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <StatTile
          label="Projects"
          value={`${projects.length}`}
          detail={limits.workspaces === null ? "Active projects." : `Active. Your plan allows ${number.format(limits.workspaces)}.`}
          href="/app/projects"
        />
        <StatTile label="Open tasks" value={number.format(open.length)} detail="Work that isn't finished yet." href="/app/tasks" />
        <StatTile label="Waiting for you" value={number.format(waiting.length)} detail="Changes that need your yes or no." href="/app/approvals" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Recent tasks</h2>
            <Link href="/app/tasks" className="-my-3 inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
              All tasks <ArrowRightIcon size={14} aria-hidden />
            </Link>
          </div>
          {tasks.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                icon={ListChecksIcon}
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
                      <span className="line-clamp-2 text-[15px] font-medium group-hover:text-accent">{t.title}</span>
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
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium">AI usage</h2>
              <Link href="/app/billing" className="-my-3 inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
                Details <ArrowRightIcon size={14} aria-hidden />
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
          <h2 className="text-lg font-medium">Recent proof</h2>
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
                      <span className="line-clamp-2 text-[15px] font-medium group-hover:text-accent">{task?.title ?? "Task"}</span>
                                          </span>
                    <span className="text-xs text-ink-2">
                      {p.status === "verified" ? "Verified" : p.status === "partially_verified" ? "Partly verified" : p.status === "failed" ? "Failed" : "Unverified"} ·{" "}
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
