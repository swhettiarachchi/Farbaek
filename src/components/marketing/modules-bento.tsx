import { ArrowsLeftRightIcon, CaretRightIcon, CircleDashedIcon, DeviceMobileIcon, FingerprintIcon, RobotIcon, RocketLaunchIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { DiffView } from "@/components/code/diff-view";
import { Container } from "@/components/ui/container";
import { SAMPLE_CHANGED_FILE, SAMPLE_DIFF } from "@/content/samples";
import { POLICY_OUTCOMES } from "@/core/billing/usage";
import { SectionHeading } from "./section-heading";

function Cell({
  title,
  body,
  icon: CellIcon,
  className = "",
  later = false,
  children,
}: {
  title: string;
  body: string;
  icon?: Icon;
  className?: string;
  /** Not built yet: says so in words and icon, so the tile never reads as a product that exists. */
  later?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={`relative flex flex-col overflow-hidden rounded-md border border-line p-5 shadow-e1 transition-[transform,box-shadow] duration-300 ease-enter hover:-translate-y-0.5 hover:shadow-e2 sm:p-6 ${className}`}
    >
      {CellIcon ? (
        <span className="flex size-10 items-center justify-center rounded-full bg-accent/[0.08] text-accent">
          <CellIcon size={20} aria-hidden />
        </span>
      ) : null}
      <h3 className={`flex flex-wrap items-center gap-2 text-[17px] font-medium tracking-[-0.01em] ${CellIcon ? "mt-4" : ""}`}>
        {title}
        {later ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong/50 px-2 py-0.5 text-xs font-normal text-ink-3">
            <CircleDashedIcon size={12} aria-hidden /> Later
          </span>
        ) : null}
      </h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{body}</p>
      {children}
    </li>
  );
}

const LIFECYCLE = ["Received", "Contract approved", "Executing", "Verifying", "Verified"] as const;

/** The policy's six outcomes, in words. */
const OUTCOME_WORDS: Record<(typeof POLICY_OUTCOMES)[number], string> = {
  ALLOW: "Allow",
  ALLOW_WITHIN_LIMITS: "Allow within limits",
  REQUIRE_APPROVAL: "Require approval",
  SIMULATE_FIRST: "Simulate first",
  ESCALATE: "Escalate",
  BLOCK: "Block",
};

export function ModulesBento() {
  return (
    <section id="modules" aria-labelledby="modules-title" className="py-20 lg:py-28">
      <Container>
        <SectionHeading id="modules-title" title="Eight parts, one shared core.">
          Studio, Agent, Mesh and LaunchOS all call the same policy, evidence and entitlement services. Nothing is built twice.
        </SectionHeading>

        <ul className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Cell
            title="Studio"
            body="A visual builder and a real code workspace on one source of truth. Every visual edit is a reviewable diff."
            className="bg-surface md:col-span-2 lg:row-span-2"
          >
            <div className="mt-6">
              <DiffView lines={SAMPLE_DIFF} path={SAMPLE_CHANGED_FILE.path} />
              <p className="mt-2 text-xs text-ink-3">Sample diff</p>
            </div>
          </Cell>

          <Cell
            title="Trust"
            body="Policy, approvals, permission leases and audit, enforced on the server. A prompt is never a security boundary."
            className="bg-canvas-2 md:col-span-2"
          >
            <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent,black)]" />
            <ul className="relative mt-5 flex flex-wrap gap-2" aria-label="Policy outcomes">
              {POLICY_OUTCOMES.map((outcome) => (
                <li key={outcome} className="rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-ink-2 shadow-e1">
                  {OUTCOME_WORDS[outcome]}
                </li>
              ))}
            </ul>
          </Cell>

          <Cell
            title="Agent"
            body="Farbaek's own runtime. The model proposes; Farbaek validates and authorizes every tool call."
            icon={RobotIcon}
            className="border-accent/20 bg-[linear-gradient(150deg,rgb(36_80_240/0.09),rgb(10_110_133/0.06)_60%,transparent)]"
          />

          <Cell title="RealityLoop" body="Intent contracts, context readiness and outcome tracking for every task." className="bg-surface">
            <ol className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] text-ink-3" aria-label="A task's lifecycle">
              {LIFECYCLE.map((step, i) => (
                <li key={step} className="flex items-center gap-1">
                  {i > 0 ? <CaretRightIcon size={12} className="text-line-strong" aria-hidden /> : null}
                  {step}
                </li>
              ))}
            </ol>
          </Cell>

          <Cell title="Core" body="Identity, organizations, projects, tasks and entitlements." icon={FingerprintIcon} className="bg-surface" />
          <Cell title="Mesh" body="Local-first transfer of Workspace Capsules between your own devices." icon={ArrowsLeftRightIcon} className="bg-surface" later />
          <Cell title="LaunchOS" body="Deploys with a cost preview, explicit authorization and real health checks." icon={RocketLaunchIcon} className="bg-surface" later />
          <Cell title="Mobile" body="Review, approve and hand work to your desktop from your phone." icon={DeviceMobileIcon} className="bg-surface" later />
        </ul>
      </Container>
    </section>
  );
}
