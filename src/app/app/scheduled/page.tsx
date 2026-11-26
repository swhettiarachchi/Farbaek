import { CalendarCheckIcon, ListChecksIcon } from "@/components/icons";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardTitle, Notice, PageHeader } from "@/components/app/primitives";
import { NewTask } from "@/components/scheduled/new-task";
import { ScheduledTabs } from "@/components/scheduled/tabs";
import { TaskList } from "@/components/scheduled/task-list";
import { SCHEDULED_LIMITS, type ScheduledLimit } from "@/core/automation/tasks";
import { demoScheduled } from "@/server/automation/demo";
import { pageLinks } from "@/server/automation/links";
import { listRuns, listTasks } from "@/server/automation/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { resolvePlan } from "@/server/workspace/ai-usage";
import { loadAppContext } from "@/server/workspace/context";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Scheduled" };

/**
 * Scheduled tasks (stage 271, ADR 0278): work Farbaek does by itself, when the person said. Their own tasks, read as them through
 * row-level security; each run's answer is a conversation in Chat.
 */
export default async function ScheduledPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const live = ctx.mode === "live";
  const user = live ? await createSupabaseServerClient() : null;
  const admin = live ? createSupabaseAdminClient() : null;
  // The demo workspace shows made-up tasks, named as samples: nothing there is saved or run.
  const sample = ctx.mode === "demo" ? demoScheduled(new Date()) : null;
  const all = sample ? sample.tasks : user ? await listTasks(user, ctx.current.id) : [];
  // An agent's work is shown and changed with its agent, on the Agents tab (stage 275): here are the tasks that are no agent's.
  const tasks = all ? all.filter((t) => !t.agentId) : null;
  const agentsWork = all ? all.filter((t) => t.agentId && t.state === "active").length : 0;
  const runs = sample ? sample.runs : user && tasks && tasks.length > 0 ? await listRuns(user, ctx.current.id) : [];
  // Each task's link, the way another app starts it (stage 277); read only when there are tasks to show it on.
  const links = tasks && tasks.length > 0 ? await pageLinks(user, ctx.current.id, ctx.mode === "demo") : "off";
  // The server's clock at render: the forms start from it, so the page and the browser first draw the same thing.
  const serverNow = new Date().getTime();
  // The plan's limits, read on the server. Unreadable: the smallest plan's are shown, and saving is refused until it can be read.
  // The demo workspace is a sample on a Pro trial, so it shows that plan's.
  const plan = user && admin ? await resolvePlan(createSupabaseWriteDeps(user, admin, ctx.user.id), ctx.current.id) : null;
  const limit: ScheduledLimit = plan?.ok ? SCHEDULED_LIMITS[plan.value.plan.planId] : sample ? SCHEDULED_LIMITS.pro : SCHEDULED_LIMITS.free;
  const disabledReason =
    ctx.mode === "demo"
      ? "The demo workspace is read-only: these tasks are samples, and nothing here is saved or run."
      : !ctx.writes.enabled
        ? (ctx.writes.reason ?? "Changes are off for this workspace right now.")
        : !ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)
          ? "Viewers can read the workspace but can't use its AI."
          : !user || !admin
            ? "Scheduled tasks aren't set up on this server."
            : null;
  // Turning a link off is held back only where nothing can be saved at all: never by a pause, a plan or a viewer's role.
  const stopReason = ctx.mode === "demo" || !user || !admin ? disabledReason : null;
  // What the plan's limit counts: every active task, an agent's work among them.
  const active = (all ?? []).filter((t) => t.state === "active").length;

  return (
    <div className="grid max-w-3xl gap-6 lg:gap-8">
      <PageHeader title="Scheduled" description="Tell Farbaek what to do and when. It does the work by itself at that time, writes the answer into Chat, and tells you when it has run." />
      <ScheduledTabs current="tasks" />

      {tasks === null ? <Notice tone="warning">Your scheduled tasks couldn&apos;t be read just now. Reload the page: nothing has been lost.</Notice> : null}
      {disabledReason ? <Notice>{disabledReason}</Notice> : null}
      {runs === null ? <Notice tone="warning">The runs of your tasks couldn&apos;t be read just now. Your tasks are as shown; reload to see their runs.</Notice> : null}

      {tasks && tasks.length > 0 ? (
        <section aria-labelledby="scheduled-yours" className="grid gap-3">
          <CardTitle icon={ListChecksIcon} id="scheduled-yours">
            Your tasks
          </CardTitle>
          <p className="text-sm text-ink-2">
            {active} of {limit.active} active on your plan{agentsWork > 0 ? `, counting ${agentsWork === 1 ? "one agent's work" : `the work of ${agentsWork} agents`}` : ""}. {limit.hourly ? "A task can run as often as every hour." : "A task runs once a day at most."} Each run uses your plan&apos;s AI usage, as a message in Chat does.
          </p>
          <TaskList tasks={tasks} runs={runs ?? []} limit={limit} links={links} disabledReason={disabledReason} stopReason={stopReason} serverNow={serverNow} />
        </section>
      ) : null}

      <Card>
        <CardTitle icon={CalendarCheckIcon}>{tasks && tasks.length > 0 ? "Schedule another" : "Schedule your first task"}</CardTitle>
        <p className="mt-1 text-sm text-ink-2">A task starts within 15 minutes of its time. If Farbaek can&apos;t finish a run, the task says why, and it&apos;s paused after five runs in a row that didn&apos;t finish.</p>
        <div className="mt-4">
          <NewTask limit={limit} disabledReason={disabledReason} serverNow={serverNow} />
        </div>
      </Card>
    </div>
  );
}
