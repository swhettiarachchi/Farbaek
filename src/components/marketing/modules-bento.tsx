import { ArrowsLeftRightIcon, DeviceMobileIcon, FingerprintIcon, RobotIcon, RocketLaunchIcon } from "@phosphor-icons/react/ssr";
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
  children,
}: {
  title: string;
  body: string;
  icon?: Icon;
  className?: string;
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
      <h3 className={`text-[17px] font-medium tracking-[-0.01em] ${CellIcon ? "mt-4" : ""}`}>{title}</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{body}</p>
      {children}
    </li>
  );
}

const LIFECYCLE = ["RECEIVED", "CONTRACT_APPROVED", "EXECUTING", "VERIFYING", "VERIFIED"] as const;

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
              <p className="mt-2 font-mono text-xs text-ink-3">sample diff</p>
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
                <li key={outcome} className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11.5px] text-ink-2 shadow-e1">
                  {outcome}
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
            <p className="mt-4 font-mono text-[11.5px] leading-relaxed text-ink-3">{LIFECYCLE.join(" → ")}</p>
          </Cell>

          <Cell title="Core" body="Identity, organizations, projects, tasks and entitlements." icon={FingerprintIcon} className="bg-surface" />
          <Cell title="Mesh" body="Local-first transfer of Workspace Capsules between your own devices." icon={ArrowsLeftRightIcon} className="bg-surface" />
          <Cell title="LaunchOS" body="Deploys with a cost preview, explicit authorization and real health checks." icon={RocketLaunchIcon} className="bg-surface" />
          <Cell title="Mobile" body="Review, approve and hand work to your desktop from your phone." icon={DeviceMobileIcon} className="bg-surface" />
        </ul>
      </Container>
    </section>
  );
}
