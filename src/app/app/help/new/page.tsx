import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/app/primitives";
import { NewRequestForm } from "@/components/app/support-forms";
import { isSupportTopic } from "@/core/support/support";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "New request" };

export default async function NewHelpRequestPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const { topic } = await searchParams;

  return (
    <div className="grid gap-6">
      <Link href="/app/help" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeftIcon size={14} aria-hidden /> Help and support
      </Link>
      <PageHeader title="Write to Farbaek" description={`It's sent from ${ctx.mode === "live" ? ctx.user.email : "the demo"}, about the workspace ${ctx.current.name}. You'll find the answer under Help.`} />
      <Card className="max-w-[760px]">
        <NewRequestForm topic={isSupportTopic(topic) ? topic : null} disabledReason={ctx.mode === "live" ? null : "Support isn't available in the demo workspace. Sign in to write to Farbaek."} />
      </Card>
    </div>
  );
}
