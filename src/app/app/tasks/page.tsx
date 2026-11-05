import { ListChecksIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { TaskList } from "@/components/app/task-list";
import { ButtonLink } from "@/components/ui/button";
import { stateTone } from "@/core/realityloop/progress";
import { loadAppContext } from "@/server/workspace/context";
import type { Task } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Tasks" };

const GROUPS: { key: string; title: string; match: (t: Task) => boolean }[] = [
  { key: "needs-you", title: "Needs a person", match: (t) => stateTone(t.state) === "approval" },
  { key: "in-progress", title: "In progress", match: (t) => stateTone(t.state) === "info" },
  { key: "verified", title: "Verified", match: (t) => stateTone(t.state) === "verified" },
  { key: "stopped", title: "Stopped or cancelled", match: (t) => ["failed", "unverified"].includes(stateTone(t.state)) },
];

export default async function TasksPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const tasks = await ctx.reader.listTasks(ctx.current.id);

  return (
    <div className="grid gap-8">
      <PageHeader title="Tasks" description="Every task in this workspace, grouped by what it needs." />
      {tasks.length === 0 ? (
        <EmptyState icon={ListChecksIcon} title="No tasks yet" action={<ButtonLink href="/app/projects" size="sm">Go to projects</ButtonLink>}>
          Tasks are created inside a project.
        </EmptyState>
      ) : (
        GROUPS.map((g) => {
          const items = tasks.filter(g.match);
          if (items.length === 0) return null;
          return (
            <section key={g.key} aria-labelledby={`group-${g.key}`} className="grid gap-3">
              <h2 id={`group-${g.key}`} className="text-base font-medium">
                {g.title} <span className="text-ink-3 tabular">{items.length}</span>
              </h2>
              <TaskList tasks={items} />
            </section>
          );
        })
      )}
    </div>
  );
}
