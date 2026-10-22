import { ShieldCheckIcon, UserCircleIcon } from "@phosphor-icons/react/ssr";
import { ROLE_LABELS, type StaffRole } from "@/core/office/permissions";
import { deploymentInfo } from "@/server/deployment";

/**
 * Which deployment this is, impossible to miss: a label, an icon and a
 * hatched band, never colour alone (ADR 0032).
 */
export function EnvPill({ label }: { label: string }) {
  return (
    <span className="relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-full border border-ink/15 bg-surface pl-2.5 pr-3 text-xs font-medium text-ink">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5 bg-[repeating-linear-gradient(135deg,var(--color-ink)_0_3px,transparent_3px_6px)] opacity-70"
      />
      <ShieldCheckIcon size={14} weight="bold" className="ml-1 text-ink" aria-hidden />
      {label}
    </span>
  );
}

export function RoleBadge({ role }: { role: StaffRole }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent/[0.08] px-3 text-xs font-medium text-accent">
      <UserCircleIcon size={14} weight="bold" aria-hidden />
      {ROLE_LABELS[role]}
    </span>
  );
}

export function deploymentName(env: Record<string, string | undefined> = process.env): string {
  const name = deploymentInfo(env).environment;
  if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  return env.NODE_ENV === "production" ? "Production build" : "Local";
}
