import { SignOutIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { PageTransition } from "@/components/app/page-transition";
import { BrandLogo } from "@/components/brand/brand-logo";
import { deploymentName, EnvPill, RoleBadge } from "@/components/office/badges";
import { IdleWarning } from "@/components/office/idle-warning";
import { OfficeNav } from "@/components/office/office-nav";
import { OfficeSearch, OfficeSearchTrigger } from "@/components/office/office-search";
import { LocalTime } from "@/components/ui/local-time";
import { OFFICE_POLICY } from "@/config/office";
import { requireStaff } from "@/server/office/access";
import { supportWaitingCount } from "@/server/office/support-data";
import { signOutOfficeAction, stayActiveAction } from "../actions";

/**
 * Office Space's console: a quiet sidebar, the deployment and your role
 * always in view, and a warning before an idle session ends. Every page
 * inside checks the session again on its own.
 */
export default async function OfficeConsoleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const staff = await requireStaff();
  const env = deploymentName();
  const endsAt = new Date(staff.firstFactorAt.getTime() + OFFICE_POLICY.maxSessionHours * 3_600_000).toISOString();
  const badges = staff.can("support.read") ? { "/support": await supportWaitingCount(staff.admin) } as const : {};

  return (
    <div className="lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-[100dvh] flex-col gap-6 overflow-y-auto border-r border-line bg-canvas-2 px-4 py-5 lg:flex">
        <div className="grid gap-1 px-1.5">
          <Link href="/" className="flex min-h-11 w-fit items-center gap-2 rounded-full" aria-label="Office Space, overview">
            <BrandLogo height={30} />
            <span className="text-[16px] font-semibold tracking-[-0.02em]">Farbaek</span>
          </Link>
          <p className="text-[13px] text-ink-3">Office Space</p>
        </div>
        <OfficeNav layout="column" badges={badges} />
        <div className="mt-auto grid gap-3 border-t border-line pt-4">
          <div className="grid gap-1 px-2">
            <p className="truncate text-sm text-ink">{staff.user.email}</p>
            <p className="text-xs text-ink-3">
              Session ends by <LocalTime iso={endsAt} />
            </p>
          </div>
          <form action={signOutOfficeAction}>
            <button type="submit" className="inline-flex min-h-11 w-full items-center gap-2 rounded-full px-2 text-sm text-ink-2 hover:text-ink">
              <SignOutIcon size={16} aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
          <Link href="/" className="flex min-h-11 items-center gap-2 lg:hidden" aria-label="Office Space, overview">
            <BrandLogo height={26} />
            <span className="text-[13px] font-medium text-ink-2">Office</span>
          </Link>
          <p className="hidden text-sm text-ink-3 lg:block">Office Space</p>
          <div className="flex items-center gap-2">
            <OfficeSearchTrigger />
            <EnvPill label={env} />
            <RoleBadge role={staff.role} />
          </div>
        </header>

        <main id="main" className="overflow-x-clip px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
          <div className="mx-auto grid max-w-[1180px] gap-8">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <OfficeNav layout="bar" badges={badges} />
      </div>
      <OfficeSearch />
      <IdleWarning lastSeenAt={staff.lastSeenAt.toISOString()} idleMinutes={OFFICE_POLICY.idleMinutes} warnSeconds={OFFICE_POLICY.idleWarningSeconds} stayActive={stayActiveAction} />
    </div>
  );
}
