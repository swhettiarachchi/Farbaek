import { CaretRightIcon, ClockIcon, GaugeIcon, LockSimpleIcon, ShieldStarIcon, SignOutIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MoreList } from "@/components/app/app-nav";
import { ROADMAP } from "@/components/app/roadmap";
import { CardTitle, PageHeader } from "@/components/app/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { UsageMeterList } from "@/components/app/usage-meters";
import { isAdminEmail } from "@/server/admin/access";
import { loadAppContext } from "@/server/workspace/context";
import { loadUsageMeters } from "@/server/workspace/usage-summary";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { unreadSupportCount } from "@/server/workspace/support";
import { signOut } from "../actions";
import { SignOutForm } from "@/components/device/device-account";

export const metadata: Metadata = { title: "More" };

export default async function MorePage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();

  const client = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const [meters, helpUnread] = await Promise.all([loadUsageMeters(ctx, ctx.current), client ? unreadSupportCount(client) : Promise.resolve(0)]);
  const row = "flex h-14 items-center gap-3 px-4 text-body";
  return (
    <div className="grid gap-6">
      <PageHeader title="More" />
      <WorkspaceSwitcher workspaces={ctx.workspaces} current={ctx.current} canCreate={ctx.mode === "live"} />

      <section aria-labelledby="usage-heading" className="rounded-md border border-line bg-surface p-5 shadow-e1">
        <CardTitle id="usage-heading" icon={GaugeIcon} className="mb-4">
          Usage
        </CardTitle>
        <UsageMeterList meters={meters} />
      </section>

      <MoreList helpUnread={helpUnread}>
        {/* A shortcut only: /admin checks the person again on the server (ADR 0026). */}
        {ctx.mode === "live" && isAdminEmail(ctx.user.email) ? (
          <li>
            <Link href="/admin" className={`${row} hover:bg-canvas-2`}>
              <ShieldStarIcon size={20} className="text-ink-2" aria-hidden /> Admin console
              <CaretRightIcon size={16} weight="bold" className="ml-auto text-ink-3" aria-hidden />
            </Link>
          </li>
        ) : null}
      </MoreList>

      <section aria-labelledby="later-heading">
        <CardTitle id="later-heading" icon={ClockIcon} className="px-1">
          Coming later
        </CardTitle>
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
          {ROADMAP.map((r) => (
            <li key={r.label} className={`${row} text-ink-3`}>
              <LockSimpleIcon size={20} className="shrink-0" aria-hidden />
              <span className="min-w-0">{r.label}</span>
              <span className="sr-only">, not available yet</span>
              <span className="ml-auto">
                <StatusBadge status={r.kind} label={r.status} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      {ctx.mode === "live" ? (
        <SignOutForm action={signOut}>
          <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line bg-surface text-body text-ink shadow-e1">
            <SignOutIcon size={20} aria-hidden /> Sign out of {ctx.user.email}
          </button>
        </SignOutForm>
      ) : (
        <Link href="/" className="flex h-12 items-center justify-center rounded-full border border-line bg-surface text-body shadow-e1">
          Leave the demo
        </Link>
      )}
    </div>
  );
}
