import { BugBeetleIcon, LockKeyIcon, WrenchIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/primitives";
import { RescueImport } from "@/components/files/rescue-import";
import { checkFeature } from "@/core/billing/entitlements";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Check an app" };

const STEPS = [
  { icon: LockKeyIcon, title: "Unpacked on your computer", body: "Secrets, binaries and dependency folders are left out before anything is sent." },
  { icon: BugBeetleIcon, title: "Checked and scored", body: "Farbaek's rules, your packages' known vulnerabilities and an AI review of the riskiest code." },
  { icon: WrenchIcon, title: "Fixed with the agent", body: "Each finding can become a task; you approve the plan before anything changes." },
];

export default async function RescuePage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const feature = checkFeature(ctx.current.billingUnknown ? null : ctx.current.plan, "security_checks");
  const canImport = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const reason =
    ctx.mode !== "live"
      ? "Checking an app needs a real workspace. The demo is read-only."
      : !ctx.writes.enabled
        ? ctx.writes.reason
        : !canImport
          ? "Your role can view projects but not import them."
          : null;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-8">
      <PageHeader
        title="Check an app you built elsewhere"
        description="Made it with another AI builder or by hand? Bring it here: Farbaek looks for what could go wrong before your users find it, then helps you fix it."
      />
      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="grid content-start gap-2 rounded-md border border-line bg-surface p-4 shadow-e1">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="grid size-7 place-items-center rounded-full bg-accent/[0.08] text-[13px] font-semibold text-accent tabular">{i + 1}</span>
              <s.icon size={16} className="text-accent" aria-hidden /> {s.title}
            </span>
            <span className="text-sm leading-relaxed text-ink-2">{s.body}</span>
          </li>
        ))}
      </ol>
      <RescueImport disabledReason={reason} />
      {!feature.allowed ? (
        <p className="text-sm text-ink-3">
          {feature.code === "FEATURE_NOT_IN_PLAN" ? "Security checks are included from the Plus plan up, and in the trial." : feature.message} You can still import the app; the check
          starts when your plan includes it.
        </p>
      ) : null}
      <p className="text-xs leading-relaxed text-ink-3">A guide to what to fix first, not a certification. Nothing in your app changes until you approve a fix.</p>
    </div>
  );
}
