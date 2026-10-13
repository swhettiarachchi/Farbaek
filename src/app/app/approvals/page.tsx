import { CheckSquareOffsetIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { TaskList } from "@/components/app/task-list";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const waiting = (await ctx.reader.listTasks(ctx.current.id)).filter((t) => t.state === "APPROVAL_PENDING");

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Approvals"
        description="Changes that policy says a person must approve. Each approval covers one exact payload, bound to its hash."
      />
      {waiting.length === 0 ? (
        <EmptyState icon={CheckSquareOffsetIcon} title="Nothing waiting for you">
          Approvals appear when an agent proposes a change that your policy requires a person to review. The approval screen itself arrives
          with Trust in Stage 3.
        </EmptyState>
      ) : (
        <TaskList tasks={waiting} />
      )}
    </div>
  );
}
