import "@/styles/chat-theme.css";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Workbench } from "@/components/workbench/workbench";
import { ClearKeptPrompt } from "@/components/build/prompt-composer";
import { UUID } from "@/core/workbench/key";
import { loadWorkbench } from "@/server/workbench/page-data";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Build" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ projectId: string }>; searchParams: Promise<{ task?: string | string[] }> };

/**
 * Build's workspace for one project (stage 202, ADR 0219): the agent, the preview, the code and the output on one screen.
 * Everything is read as the signed-in person; a project they can't see is simply not found.
 */
export default async function WorkbenchPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  if (!UUID.test(projectId)) notFound();
  const ctx = await loadAppContext();
  if (!ctx) redirect(`/sign-in?next=/app/workbench/${projectId}`);
  if (!ctx.current) redirect("/app");
  const { task } = await searchParams;
  const data = await loadWorkbench({ ...ctx, current: ctx.current }, projectId, typeof task === "string" ? task : null);
  if (!data) notFound();
  return (
    <>
      {/* Arriving at a request means the kept prompt became it: forget it, as the plan page does. */}
      {typeof task === "string" ? <ClearKeptPrompt /> : null}
      <Workbench data={data} />
    </>
  );
}
