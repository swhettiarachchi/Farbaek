import {
  BuildingsIcon,
  CaretRightIcon,
  ChartLineUpIcon,
  ChatsCircleIcon,
  CpuIcon,
  CreditCardIcon,
  ShieldCheckIcon,
  GlobeIcon,
  HeartbeatIcon,
  IdentificationBadgeIcon,
  MegaphoneIcon,
  PulseIcon,
  ScrollIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/primitives";
import { RoleBadge } from "@/components/office/badges";
import {
  OFFICE_PAGES,
  type OfficeHref,
} from "@/components/office/office-pages";
import { requireStaff } from "@/server/office/access";
import { signOutOfficeAction } from "../../actions";

export const metadata: Metadata = { title: "More" };

const ICONS: Record<OfficeHref, Icon> = {
  "/": ChartLineUpIcon,
  "/workspaces": BuildingsIcon,
  "/people": UsersThreeIcon,
  "/support": ChatsCircleIcon,
  "/activity": PulseIcon,
  "/sites": GlobeIcon,
  "/health": HeartbeatIcon,
  "/controls": SlidersHorizontalIcon,
  "/models": CpuIcon,
  "/payments": CreditCardIcon,
  "/announcements": MegaphoneIcon,
  "/staff": IdentificationBadgeIcon,
  "/audit": ScrollIcon,
  "/security": ShieldCheckIcon,
};

/** On phones, every office page in one list. */
export default async function OfficeMore() {
  const staff = await requireStaff();
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Office Space"
        description={staff.user.email}
        actions={<RoleBadge role={staff.role} />}
      />
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
        {OFFICE_PAGES.map((p) => {
          const PageIcon = ICONS[p.href];
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                className="flex min-h-14 items-center gap-3 px-4 text-[0.9375rem] text-ink hover:bg-surface-raised"
              >
                <PageIcon size={20} className="text-ink-2" aria-hidden />
                <span className="flex-1">{p.label}</span>
                <CaretRightIcon size={14} className="text-ink-3" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <form action={signOutOfficeAction}>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-2 hover:text-ink"
        >
          <SignOutIcon size={16} aria-hidden /> Sign out
        </button>
      </form>
    </div>
  );
}
