import {
  CaretRightIcon,
  ChartPieSliceIcon,
  DesktopIcon,
  GearSixIcon,
  LifebuoyIcon,
  ListChecksIcon,
  LockSimpleIcon,
  ShieldStarIcon,
  SignOutIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ROADMAP } from "@/components/app/roadmap";
import { PageHeader } from "@/components/app/primitives";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { UsageMeterList } from "@/components/app/usage-meters";
import { CONTACT } from "@/config/contact";
import { isAdminEmail } from "@/server/admin/access";
import { loadAppContext } from "@/server/workspace/context";
import { loadUsageMeters } from "@/server/workspace/usage-summary";
import { signOut } from "../actions";

export const metadata: Metadata = { title: "More" };

export default async function MorePage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();

  const meters = await loadUsageMeters(ctx, ctx.current);
  const row = "flex h-14 items-center gap-3 px-4 text-[15px]";
  return (
    <div className="grid gap-6">
      <PageHeader title="More" />
      <WorkspaceSwitcher workspaces={ctx.workspaces} current={ctx.current} canCreate={ctx.mode === "live"} />

      <section aria-labelledby="usage-heading" className="rounded-md border border-line bg-surface p-5 shadow-e1">
        <h2 id="usage-heading" className="mb-4 text-base font-medium">
          Usage
        </h2>
        <UsageMeterList meters={meters} />
      </section>

      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
        <li>
          <Link href="/app/tasks" className={`${row} hover:bg-canvas-2`}>
            <ListChecksIcon size={20} className="text-ink-2" aria-hidden /> Tasks
            <CaretRightIcon size={16} className="ml-auto text-ink-3" aria-hidden />
          </Link>
        </li>
        <li>
          <Link href="/app/sandbox" className={`${row} hover:bg-canvas-2`}>
            <TerminalWindowIcon size={20} className="text-ink-2" aria-hidden /> Sandbox
            <CaretRightIcon size={16} className="ml-auto text-ink-3" aria-hidden />
          </Link>
        </li>
        <li>
          <Link href="/app/agents" className={`${row} hover:bg-canvas-2`}>
            <DesktopIcon size={20} className="text-ink-2" aria-hidden /> Agents
            <CaretRightIcon size={16} className="ml-auto text-ink-3" aria-hidden />
          </Link>
        </li>
        <li>
          <Link href="/app/billing" className={`${row} hover:bg-canvas-2`}>
            <ChartPieSliceIcon size={20} className="text-ink-2" aria-hidden /> Billing and usage
            <CaretRightIcon size={16} className="ml-auto text-ink-3" aria-hidden />
          </Link>
        </li>
        <li>
          <Link href="/app/settings" className={`${row} hover:bg-canvas-2`}>
            <GearSixIcon size={20} className="text-ink-2" aria-hidden /> Settings
            <CaretRightIcon size={16} className="ml-auto text-ink-3" aria-hidden />
          </Link>
        </li>
        <li>
          <a href={`mailto:${CONTACT.support}`} className={`${row} hover:bg-canvas-2`}>
            <LifebuoyIcon size={20} className="text-ink-2" aria-hidden /> Help
            <span className="ml-auto truncate text-sm text-ink-3">{CONTACT.support}</span>
          </a>
        </li>
        {/* A shortcut only: /admin checks the person again on the server (ADR 0026). */}
        {ctx.mode === "live" && isAdminEmail(ctx.user.email) ? (
          <li>
            <Link href="/admin" className={`${row} hover:bg-canvas-2`}>
              <ShieldStarIcon size={20} className="text-ink-2" aria-hidden /> Admin console
              <CaretRightIcon size={16} className="ml-auto text-ink-3" aria-hidden />
            </Link>
          </li>
        ) : null}
      </ul>

      <section aria-labelledby="later-heading">
        <h2 id="later-heading" className="px-1 text-sm font-medium text-ink-3">
          Coming in later stages
        </h2>
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
          {ROADMAP.map((r) => (
            <li key={r.label} className={`${row} text-ink-3`}>
              <LockSimpleIcon size={18} aria-hidden /> {r.label}
              <span className="sr-only">, not available yet</span>
              <span className="ml-auto text-xs tabular">Stage {r.stage}</span>
            </li>
          ))}
        </ul>
      </section>

      {ctx.mode === "live" ? (
        <form action={signOut}>
          <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line bg-surface text-[15px] text-ink shadow-e1">
            <SignOutIcon size={18} aria-hidden /> Sign out of {ctx.user.email}
          </button>
        </form>
      ) : (
        <Link href="/" className="flex h-12 items-center justify-center rounded-full border border-line bg-surface text-[15px] shadow-e1">
          Leave the demo
        </Link>
      )}
    </div>
  );
}
