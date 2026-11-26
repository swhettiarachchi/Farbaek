import { UserGearIcon, UserPlusIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardTitle, Notice, PageHeader } from "@/components/app/primitives";
import { AgentList, type AgentView } from "@/components/scheduled/agent-list";
import { NewAgent } from "@/components/scheduled/new-agent";
import { ScheduledTabs } from "@/components/scheduled/tabs";
import { AGENT_LIMITS } from "@/core/automation/agents";
import { SCHEDULED_LIMITS, type ScheduledLimit } from "@/core/automation/tasks";
import { agentCounts, latestRuns, listAgents } from "@/server/automation/agents";
import { demoAgents } from "@/server/automation/demo";
import { pageLinks } from "@/server/automation/links";
import { listRuns, listTasks } from "@/server/automation/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { resolvePlan } from "@/server/workspace/ai-usage";
import { loadAppContext } from "@/server/workspace/context";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Agents" };

/**
 * Agents (stage 275, ADR 0282): helpers that keep working toward a goal a person gave them. Their own agents, read as them through
 * row-level security. Each works by its schedule, within its limit, and writes its answers into its own conversation in Chat.
 */
export default async function AgentsPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const live = ctx.mode === "live";
  const user = live ? await createSupabaseServerClient() : null;
  const admin = live ? createSupabaseAdminClient() : null;
  const serverNow = new Date().getTime();
  // The demo workspace shows a made-up agent, named as a sample: nothing there is saved or run.
  const sample = ctx.mode === "demo" ? demoAgents(new Date(serverNow)) : null;

  let views: AgentView[] | null = sample;
  if (!sample) {
    const tasks = user ? await listTasks(user, ctx.current.id) : [];
    const agents = user && tasks ? await listAgents(user, ctx.current.id, tasks) : tasks ? [] : null;
    if (agents && user && agents.length > 0) {
      const [runs, counts] = await Promise.all([listRuns(user, ctx.current.id), agentCounts(user, agents, new Date(serverNow))]);
      // Runs that couldn't be read are said as that on each card: never as an agent that hasn't worked.
      views = agents.map((agent) => ({ agent, runs: runs ? latestRuns(agent, runs) : null, runsIn30Days: counts.get(agent.id)?.runsIn30Days ?? null, notesGiven: counts.get(agent.id)?.notesGiven ?? null }));
    } else {
      views = agents ? [] : null;
    }
  }

  // Each agent's link, the way another app starts it (stage 277); read only when there are agents to show it on.
  const links = views && views.length > 0 ? await pageLinks(user, ctx.current.id, ctx.mode === "demo") : "off";
  // The plan's limits, read on the server. Unreadable: the smallest plan's are shown, and saving is refused until it can be read.
  const plan = user && admin ? await resolvePlan(createSupabaseWriteDeps(user, admin, ctx.user.id), ctx.current.id) : null;
  const planId = plan?.ok ? plan.value.plan.planId : sample ? "pro" : "free";
  const limit: ScheduledLimit = SCHEDULED_LIMITS[planId];
  const most = AGENT_LIMITS[planId];
  const disabledReason =
    ctx.mode === "demo"
      ? "The demo workspace is read-only: this agent is a sample, and nothing here is saved or run."
      : !ctx.writes.enabled
        ? (ctx.writes.reason ?? "Changes are off for this workspace right now.")
        : !ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)
          ? "Viewers can read the workspace but can't use its AI."
          : !user || !admin
            ? "Agents aren't set up on this server."
            : null;
  // Turning a link off is held back only where nothing can be saved at all: never by a pause, a plan or a viewer's role.
  const stopReason = ctx.mode === "demo" || !user || !admin ? disabledReason : null;
  const count = views?.length ?? 0;
  const full = count >= most;

  return (
    <div className="grid max-w-3xl gap-6 lg:gap-8">
      <PageHeader title="Scheduled" description="Tell Farbaek what to do and when. It does the work by itself at that time, writes the answer into Chat, and tells you when it has run." />
      <ScheduledTabs current="agents" />

      {views === null ? <Notice tone="warning">Your agents couldn&apos;t be read just now. Reload the page: nothing has been lost.</Notice> : null}
      {disabledReason ? <Notice>{disabledReason}</Notice> : null}

      {views && views.length > 0 ? (
        <section aria-labelledby="agents-yours" className="grid gap-3">
          <CardTitle icon={UserGearIcon} id="agents-yours">
            Your agents
          </CardTitle>
          <p className="text-sm text-ink-2">
            {count} of the {most} your plan keeps. Each run uses your plan&apos;s AI usage, as a message in Chat does, and an agent&apos;s work counts as one of your scheduled tasks.
          </p>
          <AgentList agents={views} limit={limit} links={links} disabledReason={disabledReason} stopReason={stopReason} serverNow={serverNow} />
        </section>
      ) : null}

      <Card>
        <CardTitle icon={UserPlusIcon}>{count > 0 ? "Start another agent" : "Start your first agent"}</CardTitle>
        <p className="mt-1 text-sm text-ink-2">
          Give an agent a name and a goal. It works by itself on the schedule you set: each time it picks the next useful piece of work, builds on its notes from before, and writes what it found into Chat. It answers and researches; it can&apos;t build, send or change anything for you yet.
        </p>
        <div className="mt-4">
          <NewAgent limit={limit} disabledReason={disabledReason ?? (full && views ? `Your plan keeps ${most} ${most === 1 ? "agent" : "agents"}. Remove one first, or choose a larger plan.` : null)} serverNow={serverNow} />
        </div>
      </Card>
    </div>
  );
}
