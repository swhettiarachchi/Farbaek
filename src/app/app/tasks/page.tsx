import { ClockUserIcon, HammerIcon, ListBulletsIcon, SealCheckIcon, StopCircleIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardTitle, EmptyState, PageHeader } from "@/components/app/primitives";
import { TaskList } from "@/components/app/task-list";
import { ButtonLink } from "@/components/ui/button";
import { taskGroup } from "@/core/realityloop/progress";
import { loadAppContext } from "@/server/workspace/context";
import type { Task } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Tasks" };

// Grouped by taskGroup, as the phone's filters are, so a task sits under the same heading on both, and the
// heading always agrees with the task's own chip (ADR 0183).
const GROUPS: { key: string; title: string; icon: Icon; match: (t: Task) => boolean }[] = [
  { key: "needs-you", title: "Needs a person", icon: ClockUserIcon, match: (t) => taskGroup(t.state) === "needs-you" },
  { key: "in-progress", title: "In progress", icon: HammerIcon, match: (t) => taskGroup(t.state) === "in-progress" },
  { key: "verified", title: "Verified", icon: SealCheckIcon, match: (t) => taskGroup(t.state) === "verified" },
  { key: "stopped", title: "Stopped or cancelled", icon: StopCircleIcon, match: (t) => taskGroup(t.state) === "stopped" },
];

export default async function TasksPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const tasks = await ctx.reader.listTasks(ctx.current.id);

  return (
    <div className="grid gap-8">
      <PageHeader title="Tasks" description="Every task in this workspace, grouped by what it needs." />
      {tasks.length === 0 ? (
        <EmptyState icon={ListBulletsIcon} title="No tasks yet" action={<ButtonLink href="/app/new" size="sm">Describe what you want to build</ButtonLink>}>
          Describe a site or app, and Farbaek sets up the project and a plan for its first task.
        </EmptyState>
      ) : (
        GROUPS.map((g) => {
          const items = tasks.filter(g.match);
          if (items.length === 0) return null;
          return (
            <section key={g.key} aria-labelledby={`group-${g.key}`} className="grid gap-3">
              <CardTitle id={`group-${g.key}`} icon={g.icon}>
                {g.title}
              </CardTitle>
              <TaskList tasks={items} />
            </section>
          );
        })
      )}
    </div>
  );
}
