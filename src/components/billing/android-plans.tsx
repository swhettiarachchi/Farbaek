import { DeviceMobileIcon } from "@phosphor-icons/react/ssr";
import { sessionsLine } from "@/components/pricing/pricing-plans";
import type { Plan } from "@/core/billing/catalog";

/**
 * The one notice inside Farbaek for Android (ADR 0150), in place of a "can't
 * be bought" pill on every card. Like the iPhone app outside the United
 * States, it says plainly that plans aren't sold in the app and points
 * nowhere else, as Google Play's Payments policy asks.
 */
export function AndroidPlansNotice() {
  return (
    <div className="flex gap-4 rounded-md border border-line bg-surface p-5 shadow-e1">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/[0.08] text-accent">
        <DeviceMobileIcon size={20} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-medium">Plans aren&apos;t sold in the Android app</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">Your plan, its usage and its renewal date are all here, and everything you build works the same in the app.</p>
      </div>
    </div>
  );
}

/**
 * Billing's plans inside the Android app: the notice, then what each plan
 * includes in one quiet list, with the workspace's plan marked. No prices
 * and no buttons, since nothing here can be bought.
 */
export function AndroidPlans({ plans, current, currentLabel }: { plans: readonly Plan[]; current: string | null; currentLabel: string }) {
  return (
    <div className="grid gap-4">
      <AndroidPlansNotice />
      <div className="rounded-md border border-line bg-surface shadow-e1">
        <p className="px-5 pt-5 text-sm text-ink-2">What each plan includes</p>
        <ul className="mt-2 divide-y divide-line">
          {plans.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="font-medium">{p.name}</p>
                <p className="mt-1 text-sm text-ink-2">{sessionsLine(p)}</p>
                <p className="mt-0.5 text-sm text-ink-3 tabular">
                  {p.limits.sandboxHours} sandbox {p.limits.sandboxHours === 1 ? "hour" : "hours"} · {p.limits.seats === 1 ? "1 seat" : `${p.limits.seats} seats`}
                </p>
              </div>
              {p.id === current ? <span className="shrink-0 rounded-full bg-accent/[0.08] px-2.5 py-0.5 text-xs font-medium text-accent">{currentLabel}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
