import { ShieldStarIcon, SignOutIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { MobileTabBar, SidebarNav } from "@/components/app/app-nav";
import { PageTransition } from "@/components/app/page-transition";
import { UsagePanel } from "@/components/app/usage-meters";
import { CreateOrganizationForm } from "@/components/app/forms";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { BrandLogo } from "@/components/brand/brand-logo";
import { TRIAL, getPlan } from "@/core/billing/catalog";
import { isAdminEmail } from "@/server/admin/access";
import { loadAppContext } from "@/server/workspace/context";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s | Farbaek" },
  robots: { index: false, follow: false },
};

// Per-user pages: always rendered at request time.
export const dynamic = "force-dynamic";

function Brand() {
  return (
    <Link href="/app" className="flex items-center gap-2 rounded-full" aria-label="Farbaek, Mission Control">
      <BrandLogo height={32} />
      <span className="text-[16px] font-semibold tracking-[-0.02em]">Farbaek</span>
    </Link>
  );
}

function NotConfigured() {
  return (
    <main id="main" className="mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center px-6 py-16">
      <Brand />
      <h1 className="mt-10 text-3xl font-medium tracking-[-0.03em]">The app isn&apos;t connected here</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
        Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code> and restart the
        server. To look around without an account, set <code>FARBAEK_DEMO_APP=1</code> on a machine without Supabase keys.
      </p>
    </main>
  );
}

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ctx = await loadAppContext();
  if (!ctx) return <NotConfigured />;

  if (!ctx.current) {
    return (
      <main id="main" className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-6 py-16">
        <Brand />
        <h1 className="mt-10 text-3xl font-medium tracking-[-0.03em]">Create your first workspace</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          It starts with the {TRIAL.lengthDays}-day {getPlan(TRIAL.basePlan).name} trial. No card is needed, and when the trial ends the workspace moves to Free.
        </p>
        <div className="mt-8 rounded-md border border-line bg-surface p-6 shadow-e2">
          <CreateOrganizationForm />
        </div>
        <form action={signOut} className="mt-6">
          <button type="submit" className="text-sm text-ink-2 underline-offset-4 hover:underline">
            Sign out of {ctx.user.email}
          </button>
        </form>
      </main>
    );
  }

  const current = ctx.current;
  const tasks = await ctx.reader.listTasks(current.id);
  const approvals = tasks.filter((t) => t.state === "APPROVAL_PENDING").length;
  const trialDays = current.trial?.phase.phase === "active" ? current.trial.phase.daysRemaining : null;

  return (
    <div className="min-h-[100dvh] bg-canvas lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-[100dvh] flex-col gap-6 overflow-y-auto border-r border-line bg-canvas-2 px-4 py-5 lg:flex">
        <div className="px-1.5">
          <Brand />
        </div>
        <WorkspaceSwitcher workspaces={ctx.workspaces} current={current} canCreate={ctx.mode === "live"} />
        <SidebarNav approvals={approvals} />
        <div className="mt-auto grid gap-3 border-t border-line pt-4">
          {/* A shortcut only: /admin checks the person again on the server (ADR 0026). */}
          {ctx.mode === "live" && isAdminEmail(ctx.user.email) ? (
            <Link href="/admin" className="flex h-10 items-center gap-3 rounded-full px-3.5 text-[14.5px] text-ink-2 hover:bg-surface/70 hover:text-ink">
              <ShieldStarIcon size={19} aria-hidden /> Admin console
            </Link>
          ) : null}
          <UsagePanel planLabel={`${getPlan(current.plan.planId).name}${current.plan.source === "trial" ? " trial" : " plan"}${trialDays !== null ? `, ${trialDays} ${trialDays === 1 ? "day" : "days"} left` : ""}`} />
          <div className="flex items-center gap-2 px-2">
            <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{ctx.user.email}</span>
            {ctx.mode === "live" ? (
              <form action={signOut}>
                <button type="submit" className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface hover:text-ink" aria-label="Sign out">
                  <SignOutIcon size={16} aria-hidden />
                </button>
              </form>
            ) : (
              <Link href="/" className="text-xs text-ink-2 hover:text-ink">
                Leave demo
              </Link>
            )}
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {ctx.mode === "demo" ? (
          <p className="border-b border-accent/20 bg-accent/[0.06] px-4 py-2.5 text-center text-[13px] text-ink">
            <span className="font-medium">Demo workspace.</span> Sample data only. Nothing you do here is saved or sent anywhere.
          </p>
        ) : !ctx.writes.enabled ? (
          <p className="border-b border-approval/25 bg-approval/[0.06] px-4 py-2.5 text-center text-[13px] text-ink">{ctx.writes.reason}</p>
        ) : null}

        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/85 px-4 backdrop-blur-xl lg:hidden">
          <Brand />
          <Link href="/app/more" className="max-w-[45%] truncate rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium shadow-e1">
            {current.name}
          </Link>
        </header>

        <main id="main" className="px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
          <div className="mx-auto max-w-[1120px]">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>

      <MobileTabBar approvals={approvals} />
    </div>
  );
}
