import { ProhibitIcon, ShieldWarningIcon, UserCheckIcon } from "@phosphor-icons/react/ssr";
import { EFFECTS, explainRule, type RuleEffect, type WorkspaceRule } from "@/core/trust/workspace-rules";

const ICON: Record<RuleEffect, { icon: typeof ProhibitIcon; className: string }> = {
  block: { icon: ProhibitIcon, className: "text-failed" },
  owner_approval: { icon: ShieldWarningIcon, className: "text-approval" },
  person_approval: { icon: UserCheckIcon, className: "text-accent" },
};

/** The active workspace rules (ADR 0082), each as Farbaek's own sentence with its patterns and reason. */
export function RuleList({ rules }: { rules: readonly WorkspaceRule[] }) {
  return (
    <ol className="grid gap-3">
      {rules.map((r) => {
        const { icon: EffectIcon, className } = ICON[r.effect];
        return (
          <li key={r.id} className="grid gap-1.5 rounded-sm border border-line bg-surface-raised/50 px-4 py-3">
            <p className="flex items-start gap-2.5 text-[15px] leading-relaxed">
              <EffectIcon size={18} weight="bold" className={`mt-1 shrink-0 ${className}`} aria-hidden />
              <span>
                <span className="sr-only">{EFFECTS[r.effect].label}: </span>
                {explainRule(r)}
              </span>
            </p>
            <p className="flex flex-wrap gap-1.5 pl-7">
              {r.paths.map((p) => (
                <code key={p} className="rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-xs text-ink-2">
                  {p}
                </code>
              ))}
            </p>
            <p className="pl-7 text-sm text-ink-2">Why: {r.reason}</p>
          </li>
        );
      })}
    </ol>
  );
}
