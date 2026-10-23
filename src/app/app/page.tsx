import { ArrowRightIcon, CheckCircleIcon, CircleDashedIcon, ListChecksIcon, LockSimpleIcon, RobotIcon, SquaresFourIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, Notice, PageHeader, StatTile, TaskStateBadge } from "@/components/app/primitives";
import { ProjectCard } from "@/components/app/project-card";
import { UsageMeterList } from "@/components/app/usage-meters";
import { PromptComposer } from "@/components/build/prompt-composer";
import { ButtonLink } from "@/components/ui/button";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { TRIAL, getPlan } from "@/core/billing/catalog";
import { TERMINAL_STATES, type TaskState } from "@/core/realityloop/task-machine";
import { shortHash } from "@/core/trust/canonical-json";
import { loadAppContext } from "@/server/workspace/context";
import { currentExecutionMode } from "@/server/execution/sandbox";
import { listRuns, proposalStates, type RunView } from "@/server/cloud-agent/store";
import { groupInbox, type ProposalState } from "@/core/agent/inbox";
import { AgentInbox } from "@/components/build/agent-inbox";
import { LiveRefresh } from "@/components/app/live-refresh";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { aiMeter, loadUsageSummary } from "@/server/workspace/usage-summary";

export const metadata: Metadata = { title: "Mission Control" };

const number = new Intl.NumberFormat("en-US");

const PAST_CONTRACT: ReadonlySet<TaskState> = new Set([
  "CONTRACT_APPROVED",
  "PLAN_PROPOSED",
  "POLICY_EVALUATED",
  "APPROVAL_PENDING",
  "EXECUTION_AUTHORIZED",
  "EXECUTING",
  "VERIFYING",
  "VERIFIED",
  "PARTIALLY_VERIFIED",
]);

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
  const [usage, recentEvidence, inbox] = await Promise.all([
    loadUsageSummary(ctx, ws),
    ctx.reader.listRecentProofPacks(ws.id, 5),
    ctx.mode === "live" ? loadInbox(ws.id) : Promise.resolve(null),
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

  const execution = currentExecutionMode();
  const verifying = tasks.find((t) => t.state === "VERIFYING");
  const checklist = [
    { label: "Create a workspace", done: true, href: "/app/settings", locked: null },
    { label: "Create a project", done: projects.length > 0, href: "/app/projects", locked: null },
    { label: "Describe your first task", done: tasks.length > 0, href: projects[0] ? `/app/projects/${projects[0].id}` : "/app/projects", locked: null },
    {
      label: "Approve an intent contract",
      done: tasks.some((t) => PAST_CONTRACT.has(t.state)),
      href: tasks.find((t) => ["RECEIVED", "CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED"].includes(t.state)) ? `/app/tasks/${tasks.find((t) => ["RECEIVED", "CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED"].includes(t.state))!.id}` : "/app/tasks",
      locked: null,
    },
    {
      label: "Get your first verified ProofPack",
      done: recentEvidence.some((p) => p.status === "verified"),
      // A task whose change is applied is the next step: its checks run in a sandbox.
      href: execution.mode === "sandboxed" ? (verifying ? `/app/tasks/${verifying.id}` : "/app/tasks") : null,
      locked: execution.mode === "sandboxed" ? null : `Needs checks to run in a sandbox. ${execution.reason}`,
    },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Mission Control"
        description={
          <>
            {ws.name} is on the <span className="font-medium text-ink">{getPlan(ws.plan.planId).name}</span>
            {ws.plan.source === "trial" ? " trial" : " plan"}. Everything here is read from your workspace&apos;s records.
          </>
        }
        actions={<ButtonLink href="/app/projects" size="sm">New project</ButtonLink>}
      />

      <section aria-label="Start a build" className="aurora">
        <PromptComposer mode="app" size="compact" disabledReason={ctx.mode === "demo" ? "The demo workspace is read-only." : ctx.writes.enabled ? null : ctx.writes.reason} />
      </section>

      {trialActive && ws.trial ? (
        <Notice>
          {ws.trial.phase.phase === "active" ? ws.trial.phase.daysRemaining : 0} days left in your {getPlan(TRIAL.basePlan).name} trial. It ends <LocalTime iso={ws.trial.endsAt} />, then
          this workspace moves to Free and nothing is charged. <Link href="/app/billing" className="font-medium text-accent hover:underline">See usage</Link>
        </Notice>
      ) : null}
      {ws.billingUnknown ? <Notice tone="warning">Billing state for this workspace is missing, so plan limits fail closed. Contact support.</Notice> : null}

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
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recent.map((p) => (
              <li key={p.id}>
                <ProjectCard id={p.id} name={p.name} compact meta={<>Created <RelativeTime iso={p.createdAt} /></>} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="inbox-heading" className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="inbox-heading" className="flex items-center gap-2 text-lg font-medium">
            <RobotIcon size={20} weight="bold" className="text-accent" aria-hidden /> Agent inbox
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Projects"
          value={`${projects.length}`}
          detail={`Active projects. Your plan allows ${limits.workspaces === null ? "a contract number" : number.format(limits.workspaces)}.`}
          href="/app/projects"
        />
        <StatTile label="Open tasks" value={number.format(open.length)} detail="Tasks not yet finished, cancelled or stopped." href="/app/tasks" />
        <StatTile label="Awaiting approval" value={number.format(waiting.length)} detail="Tasks paused until a person approves the exact change." href="/app/approvals" />
        <StatTile
          label="Governed evaluations"
          value={number.format(usage.evaluations)}
          detail={`Since ${usage.period.start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}. Limit ${limits.evaluationsPerMonth === null ? "by contract" : number.format(limits.evaluationsPerMonth)}${usage.period.kind === "trial" ? " for the trial" : " a month"}.`}
          href="/app/billing"
        />
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
                Tasks live inside projects. Describe one outcome and Farbaek tracks it from contract to proof.
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {tasks.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <Link href={`/app/tasks/${t.id}`} className="group flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium group-hover:text-accent">{t.title}</span>
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

          <Card>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-medium">Your first verified change</h2>
              <span className="text-sm text-ink-3 tabular">
                {doneCount} of {checklist.length}
              </span>
            </div>
            <ol className="mt-4 grid gap-1">
              {checklist.map((item) => {
                const icon = item.done ? (
                  <CheckCircleIcon size={20} weight="fill" className="shrink-0 text-verified" aria-label="Done" />
                ) : item.locked ? (
                  <LockSimpleIcon size={18} className="shrink-0 text-ink-3" aria-label="Not available yet" />
                ) : (
                  <CircleDashedIcon size={20} className="shrink-0 text-unverified" aria-label="To do" />
                );
                const body = (
                  <>
                    {icon}
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[15px] ${item.done ? "text-ink-2 line-through decoration-line-strong/60" : "text-ink"}`}>{item.label}</span>
                      {item.locked && !item.done ? <span className="block text-xs text-ink-3">{item.locked}</span> : null}
                    </span>
                  </>
                );
                return (
                  <li key={item.label}>
                    {item.href && !item.done ? (
                      <Link href={item.href} className="flex min-h-11 items-center gap-3 rounded-sm px-2 py-2.5 hover:bg-surface-raised">
                        {body}
                        <ArrowRightIcon size={14} className="text-ink-3" aria-hidden />
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-2 py-2.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-ink-3">
              Progress comes from your records, not from clicks. The trial gives {getPlan(TRIAL.basePlan).name} features for {TRIAL.lengthDays} days.
            </p>
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Recent evidence</h2>
          <span className="text-[13px] text-ink-3">ProofPacks</span>
        </div>
        {recentEvidence.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">No evidence yet. A ProofPack is recorded each time you approve and apply a change.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {recentEvidence.map((p) => {
              const task = tasks.find((t) => t.id === p.taskId);
              return (
                <li key={p.digest}>
                  <Link href={`/app/tasks/${p.taskId}`} className="group flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium group-hover:text-accent">{task?.title ?? "Task"}</span>
                      <span className="mt-0.5 block font-mono text-xs text-ink-3">{shortHash(p.digest)}</span>
                    </span>
                    <span className="text-xs text-ink-2">
                      {p.status === "verified" ? "Verified" : p.status === "partially_verified" ? "Partially verified" : p.status === "failed" ? "Failed" : "Unverified"} ·{" "}
                      <RelativeTime iso={p.createdAt} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
