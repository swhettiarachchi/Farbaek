import { ArrowsLeftRightIcon } from "@phosphor-icons/react/ssr";
import { COMPARE_PLANS, FEATURE_LABELS, FEATURE_STATUS, chargeLine, planSessionsGuide, type FeatureKey, type Plan, type PlanLimits } from "@/core/billing/catalog";
import { CompareCellView, type CompareCell, type CompareGroup, type CompareRow } from "./compare-cell";
import { ComparePlans } from "./compare-plans";

const number = new Intl.NumberFormat("en-US");
const text = (t: string): CompareCell => ({ kind: "text", text: t });

function row(label: string, value: (plan: Plan) => CompareCell): CompareRow {
  return { label, cells: Object.fromEntries(COMPARE_PLANS.map((p) => [p.id, value(p)])) };
}

function limitRow(label: string, key: keyof PlanLimits, unit = ""): CompareRow {
  return row(label, (plan) => {
    const v = plan.limits[key];
    return text(v === null ? "Contract" : `${number.format(v)}${unit}`);
  });
}

function featureRow(feature: FeatureKey): CompareRow {
  return row(FEATURE_LABELS[feature], (plan) => (!plan.features.includes(feature) ? { kind: "no" } : FEATURE_STATUS[feature] === "coming" ? { kind: "soon" } : { kind: "yes" }));
}

const charged = (plan: Plan) => (plan.pricing.kind === "paid" ? chargeLine(plan) : "Nothing");

const GROUPS: CompareGroup[] = [
  {
    title: "Usage",
    rows: [
      row("Agent sessions a month (about)", (plan) => {
        const n = planSessionsGuide(plan);
        return text(n === null ? "Contract" : number.format(n));
      }),
      limitRow("Test space hours a month", "sandboxHours"),
      row("Unused usage rolls over", (plan) => text(plan.features.includes("usage_rollover") ? "2 months" : "No")),
      limitRow("Projects", "workspaces"),
      limitRow("Seats", "seats"),
      limitRow("Desktop agents", "agents"),
      limitRow("Safety checks a month", "evaluationsPerMonth"),
      limitRow("Activity history", "historyDays", " days"),
    ],
  },
  { title: "Build", rows: (["cloud_agent", "live_previews", "site_publishing", "studio_kit_pro", "security_checks", "opus_models", "fable_models", "free_retries", "developer_api", "usage_alerts"] as const).map(featureRow) },
  {
    title: "Governance",
    rows: (["basic_policies", "action_receipts", "advanced_approvals", "policy_builder", "shadow_mode", "replay_and_recovery", "advanced_rbac", "incident_response", "advanced_autonomy", "impact_analysis", "evidence_exports"] as const).map(featureRow),
  },
  { title: "Team and support", rows: (["team_collaboration", "community_support", "priority_support"] as const).map(featureRow) },
];

/**
 * Every plan side by side. On a phone, ten columns can't fit, so people pick
 * two plans to compare (ComparePlans). From tablet width up it's the full
 * table: a narrow label column stays put while the plans scroll sideways
 * inside their own frame, never the page.
 */
export function ComparisonTable() {
  const plans = COMPARE_PLANS.map((p) => ({ id: p.id, name: p.name, charge: charged(p) }));
  return (
    <>
      <div className="md:hidden">
        <ComparePlans plans={plans} groups={GROUPS} initial={["lite_monthly", "maker_monthly"]} />
      </div>

      <div className="hidden gap-4 md:grid">
        <p className="flex items-center gap-2 text-sm text-ink-3">
          <ArrowsLeftRightIcon size={16} aria-hidden /> Scroll a table sideways to see all {COMPARE_PLANS.length} plans. The feature names stay in place.
        </p>
        {GROUPS.map((group) => (
          <details key={group.title} open className="group min-w-0 rounded-md border border-line bg-surface">
            <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between px-5 py-3 text-[1.0625rem] font-medium [&::-webkit-details-marker]:hidden">
              {group.title}
              <span className="text-sm font-normal text-ink-3 group-open:hidden">Show</span>
              <span className="hidden text-sm font-normal text-ink-3 group-open:inline">Hide</span>
            </summary>
            <div className="overflow-x-auto overscroll-x-contain border-t border-line [contain:paint]">
              <table className="w-max min-w-full border-collapse text-sm">
                <caption className="sr-only">{group.title} by plan</caption>
                <thead>
                  <tr className="text-left">
                    <th scope="col" className="sticky left-0 z-10 w-52 min-w-52 bg-surface px-5 py-3 font-normal text-ink-3 shadow-[inset_-1px_0_0_var(--color-line)] lg:w-60 lg:min-w-60">
                      <span className="sr-only">Feature</span>
                    </th>
                    {COMPARE_PLANS.map((plan) => (
                      <th key={plan.id} scope="col" className="min-w-26 px-3 py-3 text-center align-bottom">
                        <span className="block font-medium">{plan.name}</span>
                        <span data-web-purchase className="mt-0.5 block text-xs font-normal text-ink-3 tabular">{plan.pricing.kind === "paid" ? chargeLine(plan) : "$0"}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((r) => (
                    <tr key={r.label} className="border-t border-line">
                      <th scope="row" className="sticky left-0 z-10 w-52 min-w-52 bg-surface px-5 py-3 text-left font-normal text-ink-2 shadow-[inset_-1px_0_0_var(--color-line)] lg:w-60 lg:min-w-60">
                        {r.label}
                      </th>
                      {COMPARE_PLANS.map((plan) => (
                        <td key={plan.id} className="px-3 py-3 text-center tabular">
                          <CompareCellView cell={r.cells[plan.id]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
