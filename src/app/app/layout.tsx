import { CaretDownIcon, EyeIcon, PauseCircleIcon, PlusIcon, ShieldStarIcon, SignOutIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AndroidEarlyMark } from "@/components/billing/android-early-mark";
import { nonceFromCsp } from "@/server/http/app-headers";
import { waitingChanges } from "@/server/workspace/waiting-changes";
import { MobileTabBar, SidebarNav } from "@/components/app/app-nav";
import { CommandPalette, PaletteTrigger } from "@/components/app/command-palette";
import { CspSafe } from "@/components/app/csp-safe";
import { ServiceWorker } from "@/components/app/service-worker";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import { PAGE_NAV, PageTransition } from "@/components/app/page-transition";
import { UsagePanel } from "@/components/app/usage-meters";
import { CreateOrganizationForm } from "@/components/app/forms";
import { FirstRunTour } from "@/components/app/first-run";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { BrandLogo } from "@/components/brand/brand-logo";
import { PresenceOrb } from "@/components/build/presence-orb";
import { PromptComposer } from "@/components/build/prompt-composer";
import { agentPresence } from "@/core/agent/inbox";
import { liveRunStatuses } from "@/server/cloud-agent/store";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { AnnouncementBanner } from "@/components/app/announcement-banner";
import { liveAnnouncements } from "@/server/platform/announcements";
import { unreadSupportCount } from "@/server/workspace/support";
import { TRIAL, getPlan } from "@/core/billing/catalog";
import { isAdminEmail } from "@/server/admin/access";
import { loadAppContext } from "@/server/workspace/context";
import { TestModeBand } from "@/components/billing/test-mode-band";
import { PlayPurchaseRecovery } from "@/components/billing/play-billing";
import { googlePlayReady } from "@/server/billing/google/wiring";
import { checkoutOpenFor, readBillingConfig } from "@/server/billing/config";
import { buttonClasses } from "@/components/ui/button";
import { signOut } from "./actions";
import { DISPLAY_TITLE, FOCUSED_TITLE } from "@/components/ui/titles";

/** The page-wide bands (demo, saving off, agents paused): one neutral style, the icon's colour says which kind (ADR 0183). */
// The icon sits beside the first line, and the words wrap beside it, never under it.
const BAND = "flex items-start justify-center gap-2 border-b border-line bg-surface-raised px-4 py-2.5 text-label text-ink [&>svg]:mt-0.5";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s | Farbaek" },
  robots: { index: false, follow: false },
};

// Per-user pages: always rendered at request time.
export const dynamic = "force-dynamic";

function Brand() {
  return (
    <Link href="/app" className="flex min-h-11 min-w-[44px] items-center gap-2 rounded-full" aria-label="Farbaek, Home">
      <BrandLogo height={32} />
      <span className="text-base font-medium tracking-[-0.02em] max-[18em]:sr-only">Farbaek</span>
    </Link>
  );
}

function NotConfigured() {
  return (
    <main id="main" className="mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center px-6 py-16">
      <Brand />
      <h1 className={`mt-10 ${FOCUSED_TITLE}`}>The app isn&apos;t available here</h1>
      {/* How to connect it is in the setup guide (docs/deploy), never on a page anyone can open (stage 171). */}
      <p className="mt-3 text-body leading-relaxed text-ink-2">This server isn&apos;t set up to run the app yet. Try www.farbaek.com, or write to support@farbaek.com.</p>
    </main>
  );
}

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ctx = await loadAppContext();
  if (!ctx) return <NotConfigured />;

  if (!ctx.current) {
    return (
      // Below desktop widths the build box's glow would reach past the screen's edge: clipped, as on the app's other pages.
      <main id="main" data-signed-in className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 max-lg:overflow-x-clip sm:px-6 sm:pt-16">
        <Brand />
        <h1 className={`mt-10 ${DISPLAY_TITLE}`}>What do you want to build?</h1>
        <p className="mt-3 max-w-[56ch] text-body leading-relaxed text-ink-2">Describe it, and Farbaek drafts a plan for you to approve, then builds it.</p>
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-3">
          A new workspace gets the {TRIAL.lengthDays}-day {getPlan(TRIAL.basePlan).name} trial, once per email address. No card is needed, and it moves to Free when the
          trial ends.
        </p>
        <div className="aurora mt-8">
          {/* A prompt kept from the public site is sent again automatically after sign-in. */}
          <PromptComposer mode="app" autoResume />
        </div>
        <FirstRunTour />
        <details className="mt-16 rounded-md border border-line bg-surface p-5 shadow-e1">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-ink-2">Or create an empty workspace</summary>
          <div className="mt-4">
            <CreateOrganizationForm />
          </div>
        </details>
        <form action={signOut} className="mt-6">
          <button type="submit" className="min-h-11 text-sm text-ink-2 underline-offset-4 hover:underline">
            Sign out of {ctx.user.email}
          </button>
        </form>
      </main>
    );
  }

  const current = ctx.current;
  const live = ctx.mode === "live";
  const client = live ? await createSupabaseServerClient().catch(() => null) : null;
  const [tasks, projects, liveRuns, announcements, helpUnread] = await Promise.all([
    ctx.reader.listTasks(current.id),
    ctx.reader.listProjects(current.id).catch(() => []),
    client ? liveRunStatuses(client, current.id).catch(() => []) : Promise.resolve([]),
    client ? liveAnnouncements(client) : Promise.resolve([]),
    client ? unreadSupportCount(client) : Promise.resolve(0),
  ]);
  const presence = agentPresence(liveRuns);
  const admin = live && isAdminEmail(ctx.user.email);
  const canBuild = live && ctx.writes.enabled && ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  // Only what this person can still decide: a change that ran out of time is listed, but it isn't their turn (ADR 0174).
  const approvals = (await waitingChanges(ctx.reader, { orgId: current.id, tasks, archivedProjects: new Set(projects.filter((p) => p.archivedAt).map((p) => p.id)), role: ctx.role, permissions: ctx.permissions, tour: ctx.mode === "demo" }, new Date())).mine.length;
  const trialDays = current.trial?.phase.phase === "active" ? current.trial.phase.daysRemaining : null;
  const nonce = nonceFromCsp((await headers()).get("content-security-policy"));

  return (
    <div data-signed-in className="min-h-[100dvh] bg-canvas lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <AndroidEarlyMark nonce={nonce} />
      {/* Children never shrink: on a short screen the sidebar scrolls instead of squeezing its controls. */}
      <aside className="sticky top-0 hidden h-[100dvh] flex-col gap-4 overflow-y-auto border-r border-line bg-canvas-2 px-4 py-5 [scrollbar-width:none] lg:flex [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
        <div className="px-1.5">
          <Brand />
        </div>
        <PaletteTrigger />
        <WorkspaceSwitcher workspaces={ctx.workspaces} current={current} canCreate={ctx.mode === "live"} />
        <Link href="/app/new" transitionTypes={PAGE_NAV} className={buttonClasses("primary", "sm", "w-full")}>
          <PlusIcon size={16} weight="bold" aria-hidden /> New build
        </Link>
        {live ? <PresenceOrb key={`${presence.state}:${presence.count}`} orgId={current.id} initial={presence} /> : null}
        <SidebarNav approvals={approvals} helpUnread={helpUnread} />
        <div className="mt-auto grid gap-3 border-t border-line pt-4">
          {/* A shortcut only: /admin checks the person again on the server (ADR 0026). */}
          {admin ? (
            <Link href="/admin" className="flex h-10 items-center gap-3 rounded-full px-3.5 text-sm text-ink-2 hover:bg-surface/70 hover:text-ink">
              <ShieldStarIcon size={20} aria-hidden /> Admin console
            </Link>
          ) : null}
          <UsagePanel planLabel={`${getPlan(current.plan.planId).name}${current.plan.source === "trial" ? " trial" : " plan"}${trialDays !== null ? `, ${trialDays} ${trialDays === 1 ? "day" : "days"} left` : ""}`} />
          <div className="flex items-center gap-2 px-2">
            <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{ctx.user.email}</span>
            {ctx.mode === "live" ? (
              <form action={signOut}>
                <button type="submit" className="inline-flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface hover:text-ink" aria-label="Sign out">
                  <SignOutIcon size={16} weight="bold" aria-hidden />
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
        <AnnouncementBanner items={announcements} />
        {ctx.mode === "demo" ? (
          <p className={BAND}>
            <EyeIcon size={16} weight="fill" className="shrink-0 text-simulated" aria-hidden />
            <span>
              <span className="font-medium">Demo workspace.</span> Sample data only. Nothing you do here is saved or sent anywhere.
            </span>
          </p>
        ) : !ctx.writes.enabled ? (
          <p className={BAND}>
            <WarningCircleIcon size={16} weight="fill" className="shrink-0 text-caution" aria-hidden />
            {/* The link sits inside the words, so on a phone it wraps with them instead of squeezing beside them. */}
            <span>
              {ctx.writes.reason}
              {/* A paused workspace can still write to support (migration v23), so the notice never ends in a dead end. */}
              {current.suspension ? (
                <>
                  {" "}
                  <Link href="/app/help/new?topic=account" className="font-medium text-accent underline-offset-4 hover:underline">
                    Contact Farbaek support
                  </Link>
                </>
              ) : null}
            </span>
          </p>
        ) : null}
        {current.agentsPaused ? (
          // The workspace's emergency pause (ADR 0083): said on every page until someone resumes agents.
          <p className={BAND}>
            <PauseCircleIcon size={16} weight="fill" className="shrink-0 text-caution" aria-hidden />
            <span>
              <span className="font-medium">Agents are paused.</span> No agent runs or automatic changes until an owner or admin resumes them. Changes already applied stay as
              they are.{" "}
              <Link href="/app/incidents" className="font-medium text-accent underline-offset-4 hover:underline">
                Problems and pause
              </Link>
            </span>
          </p>
        ) : null}

        {ctx.mode === "live" && readBillingConfig()?.mode === "test" && checkoutOpenFor(readBillingConfig(), current.id) ? <TestModeBand /> : null}

        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/85 px-4 backdrop-blur-xl lg:hidden">
          <Brand />
          <div className="flex min-w-0 items-center gap-1">
            {live ? <PresenceOrb key={`${presence.state}:${presence.count}`} orgId={current.id} initial={presence} compact /> : null}
            {/* The pill stays small; the link around it is a full 44px target. */}
            <Link href="/app/more" aria-label={`${current.name}, switch workspace and more`} className="flex min-h-11 min-w-0 max-w-[42vw] items-center rounded-full">
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-line bg-surface py-1.5 pl-3 pr-2 text-xs font-medium shadow-e1">
                <span className="truncate">{current.name}</span>
                <CaretDownIcon size={14} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
              </span>
            </Link>
          </div>
        </header>

        <main id="main" className="overflow-x-clip px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
          <div className="mx-auto max-w-[1120px]">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>

      <MobileTabBar approvals={approvals} helpUnread={helpUnread} />
      <CommandPalette
        projects={projects.filter((p) => !p.archivedAt).slice(0, 50).map((p) => ({ id: p.id, name: p.name }))}
        workspaces={ctx.workspaces.map((w) => ({ id: w.id, name: w.name, current: w.id === current.id }))}
        canBuild={canBuild}
        admin={admin}
      />
      <CspSafe />
      <ServiceWorker />
      {/* Farbaek for Android: Google Play purchases are sent again when the app opens (ADR 0154). */}
      <PlayPurchaseRecovery enabled={googlePlayReady()} />
    </div>
  );
}
