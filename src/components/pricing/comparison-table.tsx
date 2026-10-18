import { CheckIcon, MinusIcon } from "@phosphor-icons/react/ssr";
import { FEATURE_LABELS, FEATURE_STATUS, SELF_SERVE_PLANS, planSessionsGuide, type FeatureKey, type Plan, type PlanLimits } from "@/core/billing/catalog";

const number = new Intl.NumberFormat("en-US");

type Row = { label: string; value: (plan: Plan) => React.ReactNode };

function limitRow(label: string, key: keyof PlanLimits, unit = ""): Row {
  return {
    label,
    value: (plan) => {
      const v = plan.limits[key];
      return v === null ? "Contract" : `${number.format(v)}${unit}`;
    },
  };
}

function featureRow(feature: FeatureKey): Row {
  return {
    label: FEATURE_LABELS[feature],
    value: (plan) =>
      plan.features.includes(feature) && FEATURE_STATUS[feature] === "coming" ? (
        <span className="text-xs text-ink-3">Coming soon</span>
      ) : plan.features.includes(feature) ? (
        <>
          <CheckIcon size={18} weight="bold" className="inline text-verified" aria-hidden />
          <span className="sr-only">Included</span>
        </>
      ) : (
        <>
          <MinusIcon size={18} className="inline text-ink-3" aria-hidden />
          <span className="sr-only">Not included</span>
        </>
      ),
  };
}

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Usage",
    rows: [
      { label: "Agent sessions a month (about)", value: (plan) => { const n = planSessionsGuide(plan); return n === null ? "Contract" : number.format(n); } },
      limitRow("Sandbox hours a month", "sandboxHours"),
      { label: "Unused usage rolls over", value: (plan) => (plan.features.includes("usage_rollover") ? "2 months" : "No") },
      limitRow("Projects", "workspaces"),
      limitRow("Seats", "seats"),
      limitRow("Desktop agents", "agents"),
      limitRow("Governed evaluations a month", "evaluationsPerMonth"),
      limitRow("Activity history", "historyDays", " days"),
    ],
  },
  { title: "Build", rows: (["cloud_agent", "live_previews", "security_checks", "opus_models", "fable_models", "free_retries", "developer_api", "usage_alerts"] as const).map(featureRow) },
  {
    title: "Governance",
    rows: (["basic_policies", "action_receipts", "advanced_approvals", "policy_builder", "shadow_mode", "replay_and_recovery", "advanced_rbac", "incident_response", "advanced_autonomy", "impact_analysis", "evidence_exports"] as const).map(featureRow),
  },
  { title: "Team and support", rows: (["team_collaboration", "community_support", "priority_support"] as const).map(featureRow) },
];

export function ComparisonTable() {
  return (
    <div className="grid gap-4">
      {GROUPS.map((group) => (
        <details key={group.title} open className="group min-w-0 rounded-md border border-line bg-surface">
          <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between px-4 py-3 text-[17px] font-medium sm:px-5 [&::-webkit-details-marker]:hidden">
            {group.title}
            <span className="text-sm font-normal text-ink-3 group-open:hidden">Show</span>
            <span className="hidden text-sm font-normal text-ink-3 group-open:inline">Hide</span>
          </summary>
          <div className="overflow-x-auto border-t border-line [contain:paint]">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <caption className="sr-only">{group.title} by plan</caption>
              <thead>
                <tr className="text-left">
                  <th scope="col" className="sticky left-0 w-[38%] bg-surface px-4 py-3 font-normal text-ink-3 sm:px-5">
                    <span className="sr-only">Feature</span>
                  </th>
                  {SELF_SERVE_PLANS.map((plan) => (
                    <th key={plan.id} scope="col" className="px-3 py-3 text-center font-medium">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.label} className="border-t border-line">
                    <th scope="row" className="sticky left-0 bg-surface px-4 py-3 text-left font-normal text-ink-2 sm:px-5">
                      {row.label}
                    </th>
                    {SELF_SERVE_PLANS.map((plan) => (
                      <td key={plan.id} className="px-3 py-3 text-center tabular">
                        {row.value(plan)}
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
  );
}
