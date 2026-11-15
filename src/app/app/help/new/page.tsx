import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/app/primitives";
import { NewRequestForm } from "@/components/app/support-forms";
import { isSupportTopic, reportPrefill } from "@/core/support/support";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";

/** A Survey Studio project's name, read as the person: only one they can see. */
async function surveyProjectName(orgId: string, id: string): Promise<{ id: string; name: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data } = await client.from("survey_projects").select("id, name").eq("org_id", orgId).eq("id", id).maybeSingle();
  return data && typeof data.name === "string" ? { id: String(data.id), name: data.name } : null;
}

export const metadata: Metadata = { title: "New request" };

export default async function NewHelpRequestPage({ searchParams }: { searchParams: Promise<{ topic?: string; task?: string; project?: string; survey?: string }> }) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const { topic, task, project, survey } = await searchParams;
  // "Report this result" (ADR 0171): named from what this person can read, never from the address.
  const orgId = ctx.current.id;
  const [reportedTask, reportedProject, reportedSurvey] = await Promise.all([
    task ? ctx.reader.getTask(orgId, task).catch(() => null) : null,
    project ? ctx.reader.getProject(orgId, project).catch(() => null) : null,
    survey && ctx.mode === "live" ? surveyProjectName(orgId, survey).catch(() => null) : null,
  ]);
  const prefill = reportedTask
    ? reportPrefill({ name: reportedTask.task.title, path: `/app/tasks/${reportedTask.task.id}` })
    : reportedProject
      ? reportPrefill({ name: reportedProject.name, path: `/app/projects/${reportedProject.id}` })
      : reportedSurvey
        ? reportPrefill({ name: reportedSurvey.name, path: `/app/survey/${reportedSurvey.id}` })
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
