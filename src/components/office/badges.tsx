import { ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import { ROLE_LABELS, type StaffRole } from "@/core/office/permissions";
import { deploymentInfo } from "@/server/deployment";

/**
 * Which deployment this is, impossible to miss: a label and an icon in the
 * ink, never colour alone (ADR 0032). No hatched band (ADR 0183).
 */
export function EnvPill({ label }: { label: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-ink/25 bg-surface px-3 text-xs font-medium text-ink">
      <ShieldCheckIcon size={14} weight="bold" className="shrink-0 text-ink" aria-hidden />
      {label}
    </span>
  );
}

/** A role is a tag, not a state: a neutral pill with no icon (ADR 0183). */
export function RoleBadge({ role }: { role: StaffRole }) {
  return <span className="inline-flex h-8 items-center rounded-full border border-line-2 bg-surface px-3 text-xs font-medium text-ink-2">{ROLE_LABELS[role]}</span>;
}

export function deploymentName(env: Record<string, string | undefined> = process.env): string {
  const name = deploymentInfo(env).environment;
  if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  return env.NODE_ENV === "production" ? "Production build" : "Local";
}
