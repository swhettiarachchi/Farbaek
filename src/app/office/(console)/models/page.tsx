import { CheckCircleIcon, ClockIcon, CpuIcon, QuestionIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { Notice, PageHeader } from "@/components/app/primitives";
import { LiveRefresh } from "@/components/app/live-refresh";
import { AdminTable, Cell, Chip } from "@/components/admin/table";
import { OfficeActionForm } from "@/components/office/action-form";
import { officeInputClass, ReasonField, StepUpField } from "@/components/office/fields";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { CANARY_SUITE } from "@/content/canary-suite";
import { TIER_MODELS, TIERS, tierModels, type Tier } from "@/core/agent/routing";
import { pricedModel, type CanarySide } from "@/core/ai/model-canary";
import { findingWords, listedAs } from "@/core/ai/model-watch";
import { RATE_CARD, USD_PER_UNIT } from "@/core/billing/rate-card";
import { estimateSuite } from "@/server/ai/model-canary-runner";
import { requireStaff } from "@/server/office/access";
import { readModelsPage, type CanaryRun } from "@/server/office/models-data";
import { overridesFrom } from "@/server/platform/state";
import { restoreDefaultModelAction, startCanaryAction, switchModelAction } from "./actions";

export const metadata: Metadata = { title: "Models" };

const TIER_WORDS: Record<Tier, { label: string; use: string }> = {
  fast: { label: "Fast", use: "Reading, searching and planning, and everything on Free." },
  standard: { label: "Standard", use: "Writing code and drafting." },
  strong: { label: "Strong", use: "Deep effort and retries, from Pro up." },
  frontier: { label: "Frontier", use: "Deep effort on Max 2x and up." },
};

const POLICY_WORDS: Record<string, string> = {
  ALLOW: "Allowed",
  ALLOW_WITHIN_LIMITS: "Within autonomy limits",
  SIMULATE_FIRST: "Rehearse first",
  REQUIRE_APPROVAL: "A person approves",
  ESCALATE: "An owner or admin approves",
  BLOCK: "Blocked",
};

const usd = (units: number) => `$${(units * USD_PER_UNIT).toFixed(2)}`;
const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;
const WEEK = 7 * 86_400_000;

function SideRow({ label, s }: { label: string; s: CanarySide }) {
  return (
    <tr>
      <Cell>
        <span className="block text-xs text-ink-3">{label}</span>
        <span className="font-mono text-[0.8125rem]">{s.model}</span>
      </Cell>
      <Cell>
        {s.ok ? (
          <span className="inline-flex items-center gap-1.5">
            <CheckCircleIcon size={16} weight="fill" className="text-verified" aria-hidden /> Usable
          </span>
        ) : (
          <span className="inline-flex items-start gap-1.5">
            <XCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> {s.failure}
          </span>
        )}
      </Cell>
      <Cell mono muted={!s.files.length}>
        {s.files.length ? s.files.join(", ") : "None"}
      </Cell>
      <Cell>{s.ok ? s.violations : "-"}</Cell>
      <Cell>{s.outcome ? (POLICY_WORDS[s.outcome] ?? s.outcome) : "-"}</Cell>
      <Cell mono>{usd(s.units)}</Cell>
      <Cell mono>{seconds(s.ms)}</Cell>
    </tr>
  );
}

function RunStatus({ run }: { run: CanaryRun }) {
  if (run.status === "running")
    return (
      <Chip tone="approval">
        <ClockIcon size={14} weight="bold" className="mr-1" aria-hidden /> Running
      </Chip>
    );
  if (run.status === "failed")
    return (
      <Chip tone="failed">
        <XCircleIcon size={14} weight="bold" className="mr-1" aria-hidden /> Stopped
      </Chip>
    );
  return (
    <Chip tone="verified">
      <CheckCircleIcon size={14} weight="bold" className="mr-1" aria-hidden /> Report ready
    </Chip>
  );
}

/**
 * Which model serves each tier, what Anthropic lists, and canaries that
 * compare a candidate before anyone switches (ADR 0090). Canaries run
 * Farbaek's own sample tasks, never customer work. Only an owner switches,
 * with a fresh authenticator code, and only to a model a recent canary
 * compared.
 */
export default async function OfficeModels() {
  const staff = await requireStaff();
  const { switches, runs, check } = await readModelsPage(staff.admin);
  const canCanary = staff.can("models.canary");
  const canSwitch = staff.can("models.switch");
  const effective = tierModels("anthropic", overridesFrom(switches));
  const running = runs.some((r) => r.status === "running");
  const listedIds = check?.listed.map((m) => m.id) ?? [];
  const candidates = [...new Set([...(Object.keys(RATE_CARD) as string[]).filter((m) => m.startsWith("claude-")), ...listedIds])].sort();
  const now = new Date().getTime();

  return (
    <div className="grid gap-8">
      <LiveRefresh active={running} />
      <PageHeader
        title="Models"
        description="Which model serves each tier, what Anthropic lists, and canaries that compare a candidate before anyone switches. Canaries run Farbaek's own sample tasks, never customer work. Nothing switches on its own."
      />
      {!canCanary ? <Notice>Owners and admins run canaries, and only owners switch a tier. You can see where things stand.</Notice> : null}

      <section aria-labelledby="tiers-heading" className="grid gap-4">
        <h2 id="tiers-heading" className="text-lg font-medium">
          In use
        </h2>
        <ul className="grid gap-4 lg:grid-cols-2">
          {TIERS.map((tier) => {
            const sw = switches.find((s) => s.tier === tier);
            const model = effective[tier];
            const found = check ? listedAs(model, check.listed) : null;
            return (
              <li key={tier} className="grid content-start rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
                <div className="grid gap-4 rounded-md bg-surface p-5 shadow-e1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[1.0625rem] font-medium tracking-[-0.01em]">{TIER_WORDS[tier].label}</h3>
                      <p className="mt-1 text-sm text-ink-2">{TIER_WORDS[tier].use}</p>
                      <p className="mt-2 font-mono text-[0.8125rem] text-ink">{model}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {sw ? <Chip tone="accent">Switched</Chip> : <Chip>Default</Chip>}
                      {!check ? (
                        <Chip>
                          <QuestionIcon size={14} weight="bold" className="mr-1" aria-hidden /> Not checked yet
                        </Chip>
                      ) : found ? (
                        <Chip tone="verified">
                          <CheckCircleIcon size={14} weight="bold" className="mr-1" aria-hidden /> Listed
                        </Chip>
                      ) : (
                        <Chip tone="failed">
                          <WarningCircleIcon size={14} weight="bold" className="mr-1" aria-hidden /> Not listed
                        </Chip>
                      )}
                    </div>
                  </div>
                  {sw ? (
                    <p className="rounded-sm bg-surface-raised px-3 py-2 text-sm text-ink-2">
                      Switched from <span className="font-mono text-[0.8125rem]">{TIER_MODELS.anthropic[tier]}</span> <RelativeTime iso={sw.setAt} />: {sw.reason}
                    </p>
                  ) : null}

                  {canCanary ? (
                    <details className="text-sm">
                      <summary className="flex min-h-11 cursor-pointer items-center font-medium text-ink-2 hover:text-ink">Run a canary for this tier</summary>
                      <OfficeActionForm action={startCanaryAction} submit="Run the canary" tone="secondary" className="mt-2 grid gap-3">
                        <input type="hidden" name="tier" value={tier} />
                        <label htmlFor={`candidate-${tier}`} className="grid gap-1.5">
                          <span className="font-medium text-ink">Candidate</span>
                          <select id={`candidate-${tier}`} name="candidate" required className={officeInputClass} disabled={running}>
                            {candidates
                              .filter((c) => c !== model)
                              .map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                  {pricedModel(c) ? "" : " (no price yet)"}, at most {usd(estimateSuite(model, c).units)}
                                </option>
                              ))}
                          </select>
                          <span className="text-xs text-ink-3">
                            {CANARY_SUITE.length} sample tasks on both models. The figure is the most it could cost at list price; a model without a price is counted at the most expensive rate.
                          </span>
                        </label>
                        <ReasonField id={`canary-reason-${tier}`} />
                      </OfficeActionForm>
                    </details>
                  ) : null}

                  {canSwitch && sw ? (
                    <details className="text-sm">
                      <summary className="flex min-h-11 cursor-pointer items-center font-medium text-ink-2 hover:text-ink">Return to {TIER_MODELS.anthropic[tier]}</summary>
                      <OfficeActionForm action={restoreDefaultModelAction} submit={`Return ${TIER_WORDS[tier].label.toLowerCase()} to its default`} tone="secondary" className="mt-2 grid gap-3">
                        <input type="hidden" name="tier" value={tier} />
                        <ReasonField id={`restore-reason-${tier}`} />
                        <StepUpField id={`restore-totp-${tier}`} />
                      </OfficeActionForm>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-ink-3">Gemini isn&apos;t watched: only Anthropic&apos;s models are checked and switched here.</p>
      </section>

      <section aria-labelledby="check-heading" className="grid gap-3">
        <h2 id="check-heading" className="text-lg font-medium">
          The daily check
        </h2>
        {check ? (
          <div className="grid gap-3 rounded-md border border-line bg-surface p-5 shadow-e1">
            <p className="text-sm text-ink-2">
              Checked <RelativeTime iso={check.checkedAt} /> (<LocalTime iso={check.checkedAt} />) against {check.listed.length} models Anthropic lists.
            </p>
            {check.findings.length ? (
              <ul className="grid gap-2">
                {check.findings.map((f) => (
                  <li key={`${f.kind}-${f.tier}`} className="flex items-start gap-2 text-sm text-ink">
                    <WarningCircleIcon size={18} weight="bold" className={`mt-0.5 shrink-0 ${f.kind === "missing" ? "text-failed" : "text-approval"}`} aria-hidden />
                    {findingWords(f)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-ink">
                <CheckCircleIcon size={18} weight="fill" className="text-verified" aria-hidden /> Every model in use is listed, and none has a newer one.
              </p>
            )}
          </div>
        ) : (
          <Notice>No check has run yet. It runs with the hourly jobs, once a day, when this server has an Anthropic key.</Notice>
        )}
      </section>

      <section aria-labelledby="runs-heading" className="grid gap-4">
        <h2 id="runs-heading" className="flex items-center gap-2 text-lg font-medium">
          <CpuIcon size={20} className="text-ink-3" aria-hidden /> Canaries
        </h2>
        {runs.length === 0 ? <p className="text-sm text-ink-3">No canary has run yet.</p> : null}
        <ul className="grid gap-4">
          {runs.map((run) => {
            const tier = run.tier as Tier;
            const fresh = run.finishedAt !== null && now - Date.parse(run.finishedAt) < WEEK;
            const priced = pricedModel(run.candidate);
            const inUse = effective[tier] === run.candidate;
            const switchReason = !canSwitch
              ? "Only an owner can switch a tier."
              : run.status !== "finished"
                ? null
                : inUse
                  ? "This tier already uses the candidate."
                  : !priced
                    ? "Farbaek has no price for this model yet. Add it to the rate card first (a code change)."
                    : !fresh
                      ? "This report is more than 7 days old. Run a new canary to switch."
                      : null;
            return (
              <li key={run.id} className="grid gap-4 rounded-md border border-line bg-surface p-5 shadow-e1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-medium">
                      {TIER_WORDS[tier]?.label ?? run.tier}: <span className="font-mono text-[0.8125rem]">{run.current}</span> against <span className="font-mono text-[0.8125rem]">{run.candidate}</span>
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      Started <RelativeTime iso={run.startedAt} />. At most {usd(run.estimateUnits)} at list price. {run.reason}
                    </p>
                  </div>
                  <RunStatus run={run} />
                </div>
                {run.failure ? <p className="text-sm text-failed">{run.failure}</p> : null}
                {run.report ? (
                  <>
                    <ul className="grid gap-1.5">
                      {run.report.differences.map((d) => (
                        <li key={d} className="text-sm text-ink">
                          {d}
                        </li>
                      ))}
                    </ul>
                    <details className="text-sm">
                      <summary className="flex min-h-11 cursor-pointer items-center font-medium text-ink-2 hover:text-ink">Each sample task, side by side</summary>
                      <div className="mt-2 grid gap-4">
                        {run.report.tasks.map((t) => (
                          <div key={t.taskId} className="grid gap-2">
                            <p className="font-medium text-ink">{t.title} (sample)</p>
                            <AdminTable caption={`${t.title}: both models`} columns={["Model", "Result", "Files", "Contract breaks", "Policy", "Cost", "Time"]}>
                              <SideRow label="Current" s={t.current} />
                              <SideRow label="Candidate" s={t.candidate} />
                            </AdminTable>
                          </div>
                        ))}
                        {run.reportSha256 ? <p className="font-mono text-[0.75rem] text-ink-3">Report sha256 {run.reportSha256}</p> : null}
                      </div>
                    </details>
                    {switchReason ? (
                      <p className="text-xs text-ink-3">{switchReason}</p>
                    ) : (
                      <details className="text-sm">
                        <summary className="flex min-h-11 cursor-pointer items-center font-medium text-ink-2 hover:text-ink">
                          Switch {TIER_WORDS[tier].label.toLowerCase()} to {run.candidate}
                        </summary>
                        <OfficeActionForm action={switchModelAction} submit={`Switch ${TIER_WORDS[tier].label.toLowerCase()} to ${run.candidate}`} tone="danger" className="mt-2 grid gap-3">
                          <p className="text-sm text-ink-2">
                            Every workspace that uses this tier moves to {run.candidate} within 15 seconds. Usage is metered at its real price, so a dearer model uses allowances faster. You can return to {TIER_MODELS.anthropic[tier]} at any time.
                          </p>
                          <input type="hidden" name="tier" value={tier} />
                          <input type="hidden" name="model" value={run.candidate} />
                          <input type="hidden" name="canaryId" value={run.id} />
                          <ReasonField id={`switch-reason-${run.id}`} />
                          <StepUpField id={`switch-totp-${run.id}`} />
                        </OfficeActionForm>
                      </details>
                    )}
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
