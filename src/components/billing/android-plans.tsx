import { DeviceMobileIcon } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import { sessionsLine } from "@/components/pricing/pricing-plans";
import type { Plan } from "@/core/billing/catalog";

/**
 * The one notice inside Farbaek for Android (ADR 0150), in place of a "can't
 * be bought" pill on every card. Like the iPhone app outside the United
 * States, it says plainly that plans aren't sold in the app and points
 * nowhere else, as Google Play's Payments policy asks. Billing passes other
 * words when Google Play sells plans but can't for this workspace or phone
 * (ADR 0154).
 */
export function AndroidPlansNotice({
  title = "Plans aren't sold in the Android app",
  children = "Your plan, its usage and its renewal date are all here, and everything you build works the same in the app.",
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex gap-4 rounded-md border border-line bg-surface p-5 shadow-e1">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-2 ring-1 ring-line">
        <DeviceMobileIcon size={20} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{children}</p>
      </div>
    </div>
  );
}

/**
 * Billing's plans inside the Android app: the notice, then what each plan
 * includes in one quiet list, with the workspace's plan marked. No prices
 * and no buttons, since nothing here can be bought.
 */
export function AndroidPlans({ plans, current, currentLabel, notice = <AndroidPlansNotice /> }: { plans: readonly Plan[]; current: string | null; currentLabel: string; notice?: ReactNode }) {
  return (
    <div className="grid gap-4">
      {notice}
      <div className="rounded-md border border-line bg-surface shadow-e1">
        <p className="px-5 pt-5 text-sm text-ink-2">What each plan includes</p>
        <ul className="mt-2 divide-y divide-line">
          {plans.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="font-medium">{p.name}</p>
                <p className="mt-1 text-sm text-ink-2">{sessionsLine(p)}</p>
                <p className="mt-0.5 text-sm text-ink-3 tabular">{planLimitsLine(p)}</p>
              </div>
              {p.id === current ? <span className="shrink-0 rounded-full border border-line-2 px-2.5 py-0.5 text-xs font-medium text-ink-2">{currentLabel}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** "2 test space hours · 1 seat": a plan's test space time and seats on one line. */
export function planLimitsLine(p: Plan): string {
  return `${p.limits.sandboxHours} test space ${p.limits.sandboxHours === 1 ? "hour" : "hours"} · ${p.limits.seats === 1 ? "1 seat" : `${p.limits.seats} seats`}`;
}
