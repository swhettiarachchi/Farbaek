import { CaretRightIcon, EnvelopeSimpleIcon, LifebuoyIcon, ListBulletsIcon, PlusIcon, UsersThreeIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardTitle, EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { SupportStatusChip } from "@/components/app/support-thread";
import { BrandLogo } from "@/components/brand/brand-logo";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { CONTACT } from "@/config/contact";
import { checkFeature } from "@/core/billing/entitlements";
import { TOPIC_LABELS } from "@/core/support/support";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { listMyRequests, type SupportRequestView } from "@/server/workspace/support";

export const metadata: Metadata = { title: "Help and support" };

export default async function HelpPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const live = ctx.mode === "live";
  const client = live ? await createSupabaseServerClient() : null;
  let requests: SupportRequestView[] = [];
  let readError = false;
  if (client) {
    requests = await listMyRequests(client).catch(() => {
      readError = true;
      return [];
    });
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Help and support"
        description="Write to Farbaek's team about anything: a build, your plan, your account or a site you want reported. We answer here, and Help shows a dot when there's a reply."
        actions={
          live ? (
            <Link href="/app/help/new" className={buttonClasses("primary", "sm")}>
              <PlusIcon size={16} weight="bold" aria-hidden /> New request
            </Link>
          ) : null
        }
      />

      {live && checkFeature(ctx.current.plan, "priority_support").allowed ? (
        // Priority support (ADR 0084): what it does, and nothing more.
        <p className="flex items-start gap-2 text-sm text-ink-2">
          <LifebuoyIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
          <span>Your plan includes priority support: requests from {ctx.current.name} go first in Farbaek&apos;s queue while they wait on us.</span>
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <section aria-labelledby="requests-title" className="grid gap-3">
          <CardTitle id="requests-title" icon={ListBulletsIcon} className="sr-only">
            Your requests
          </CardTitle>
          {!live ? (
            <Notice>Support isn&apos;t available in the demo workspace, because nothing here is saved. Sign in with your own email to write to Farbaek.</Notice>
          ) : readError ? (
            <Notice tone="warning">Your requests couldn&apos;t be loaded just now. Reload in a moment; nothing you sent is lost.</Notice>
          ) : requests.length === 0 ? (
            <EmptyState
              icon={LifebuoyIcon}
              title="No requests yet"
              action={
                <Link href="/app/help/new" className={buttonClasses("primary", "sm")}>
                  <PlusIcon size={16} weight="bold" aria-hidden /> New request
                </Link>
              }
            >
              When something isn&apos;t working, or you&apos;re not sure how to do something, write to us. Each request keeps the whole conversation in one place.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/app/help/${r.id}`} className="group flex min-h-16 items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-canvas-2">
                    <span className="grid min-w-0 flex-1 gap-2">
                      <span className="flex min-w-0 items-start gap-2">
                        {r.unread ? <span className="mt-[7px] size-2 shrink-0 rounded-full bg-accent" aria-hidden /> : null}
                        <span className={`line-clamp-2 text-[0.9375rem] leading-snug text-ink ${r.unread ? "font-semibold" : "font-medium"}`}>{r.subject}</span>
                        {r.unread ? <span className="sr-only">, new reply</span> : null}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-ink-3">
                        <SupportStatusChip status={r.status} />
                        <span>
                          {TOPIC_LABELS[r.topic]} · updated <RelativeTime iso={r.updatedAt} />
                        </span>
                      </span>
                    </span>
                    <CaretRightIcon size={16} weight="bold" className="shrink-0 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="grid gap-4 rounded-lg border border-line bg-surface p-6 shadow-e1">
          <BrandLogo height={34} />
          <div className="grid gap-1.5">
            <CardTitle icon={UsersThreeIcon}>Real people at Farbaek</CardTitle>
            <p className="text-sm leading-relaxed text-ink-2">
              Requests go to Farbaek&apos;s own team, not a bot. Tell us the project, the site or the run it&apos;s about, and what you expected to happen.
            </p>
          </div>
          <p className="flex items-start gap-2 border-t border-line pt-4 text-sm text-ink-2">
            <EnvelopeSimpleIcon size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Can&apos;t sign in? Email{" "}
              <a href={`mailto:${CONTACT.support}`} className="font-medium text-accent hover:underline">
                {CONTACT.support}
              </a>
              .
            </span>
          </p>
        </aside>
      </div>
    </div>
  );
}
