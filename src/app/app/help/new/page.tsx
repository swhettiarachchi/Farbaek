import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/app/primitives";
import { NewRequestForm } from "@/components/app/support-forms";
import { isSupportTopic, reportPrefill } from "@/core/support/support";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "New request" };

export default async function NewHelpRequestPage({ searchParams }: { searchParams: Promise<{ topic?: string; task?: string; project?: string }> }) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const { topic, task, project } = await searchParams;
  // "Report this result" (ADR 0171): named from what this person can read, never from the address.
  const orgId = ctx.current.id;
  const [reportedTask, reportedProject] = await Promise.all([
    task ? ctx.reader.getTask(orgId, task).catch(() => null) : null,
    project ? ctx.reader.getProject(orgId, project).catch(() => null) : null,
  ]);
  const prefill = reportedTask
    ? reportPrefill({ name: reportedTask.task.title, path: `/app/tasks/${reportedTask.task.id}` })
    : reportedProject
      ? reportPrefill({ name: reportedProject.name, path: `/app/projects/${reportedProject.id}` })
      : null;

  return (
    <div className="grid gap-6">
      <Link href="/app/help" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeftIcon size={14} weight="bold" aria-hidden /> Help and support
      </Link>
      <PageHeader title={prefill ? "Report this result" : "Write to Farbaek"} description={`It's sent from ${ctx.mode === "live" ? ctx.user.email : "the demo"}, about the workspace ${ctx.current.name}. You'll find the answer under Help.`} />
      <Card className="max-w-[760px]">
        <NewRequestForm topic={isSupportTopic(topic) ? topic : null} subject={prefill?.subject} body={prefill?.body} disabledReason={ctx.mode === "live" ? null : "Support isn't available in the demo workspace. Sign in to write to Farbaek."} />
      </Card>
    </div>
  );
}
