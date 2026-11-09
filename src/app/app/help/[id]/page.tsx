import { ArrowLeftIcon, CheckCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReplyForm } from "@/components/app/support-forms";
import { SupportConversation, SupportStatusChip } from "@/components/app/support-thread";
import { LocalTime } from "@/components/ui/local-time";
import { StatusGlyph } from "@/components/ui/status-badge";
import { TOPIC_LABELS } from "@/core/support/support";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { loadMyRequest, markSupportSeen } from "@/server/workspace/support";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { closeSupportAction } from "../actions";

export const metadata: Metadata = { title: "Support request" };

export default async function HelpRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await loadAppContext();
  if (!ctx?.current || ctx.mode !== "live") notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const client = await createSupabaseServerClient();
  if (!client) notFound();
  // Read with the person's own client: RLS shows only their request, never internal notes.
  const found = await loadMyRequest(client, id);
  if (!found) notFound();
  const { request, messages } = found;
  if (request.unread) {
    const admin = createSupabaseAdminClient();
    if (admin) await markSupportSeen((fn, args) => admin.rpc(fn, args), ctx.user.id, request.id).catch(() => undefined);
  }
  const closed = request.status === "closed";

  return (
    <div className="grid gap-6">
      <Link href="/app/help" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeftIcon size={14} weight="bold" aria-hidden /> Help and support
      </Link>

      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SupportStatusChip status={request.status} />
          <span className="text-xs text-ink-3">
            {TOPIC_LABELS[request.topic]} · opened <LocalTime iso={request.createdAt} />
          </span>
        </div>
        <h1 className="text-balance text-[1.6rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2rem]">{request.subject}</h1>
        {request.status === "waiting_on_farbaek" ? <p className="text-sm text-ink-2">Farbaek&apos;s team has it. The reply will appear here.</p> : null}
      </header>

      <div className="mx-auto grid w-full max-w-[820px] gap-8">
        <SupportConversation messages={messages} />

        {closed ? (
          <p className="flex items-center gap-2 rounded-md border border-line bg-surface-raised/60 px-4 py-3 text-sm text-ink-2">
            <StatusGlyph status="done" />
            <span>This request is closed. Writing again opens it.</span>
          </p>
        ) : null}

        {/* Sits above the phone tab bar while writing, so the reply box is always in reach. */}
        <section aria-label="Reply" className="sticky bottom-[calc(var(--tab-bar)+0.5rem)] z-10 rounded-lg border border-line bg-surface/95 p-4 shadow-e2 backdrop-blur-xl lg:bottom-6">
          <ReplyForm threadId={request.id} closed={closed} />
        </section>

        {!closed ? (
          <ConfirmAction
            action={closeSupportAction}
            fields={{ threadId: request.id }}
            className="justify-self-start"
            trigger={
              <>
                <CheckCircleIcon size={16} weight="bold" aria-hidden /> Close request, it&apos;s sorted
              </>
            }
            triggerVariant="ghost"
            question="Close this request? You can still read it here, and open a new one any time."
            confirmLabel="Close it"
            pendingLabel="Closing…"
            keepLabel="Keep it open"
            danger={false}
          />
        ) : null}
      </div>
    </div>
  );
}
