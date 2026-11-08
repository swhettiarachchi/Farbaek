import { CloudArrowUpIcon, DeviceMobileIcon, HammerIcon, PackageIcon, SquaresFourIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { DiffView } from "@/components/code/diff-view";
import { Container } from "@/components/ui/container";
import { SAMPLE_CHANGED_FILE, SAMPLE_DIFF } from "@/content/samples";
import { SectionHeading } from "./section-heading";

function Cell({
  title,
  body,
  icon: CellIcon,
  className = "",
  beta = false,
  children,
}: {
  title: string;
  body: string;
  icon?: Icon;
  className?: string;
  /** Built and tested, not yet proven on real accounts and devices: said in a sentence, never as a stamp (ADR 0180). */
  beta?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={`relative flex flex-col overflow-hidden rounded-md border border-line p-5 shadow-e1 transition-[transform,box-shadow] duration-300 ease-enter hover:-translate-y-0.5 hover:shadow-e2 sm:p-6 ${className}`}
    >
      {CellIcon ? (
        <span className="flex size-10 items-center justify-center rounded-full bg-surface text-ink-2 shadow-e1 ring-1 ring-line">
          <CellIcon size={20} aria-hidden />
        </span>
      ) : null}
      <h3 className={`text-[1.0625rem] font-medium tracking-[-0.01em] ${CellIcon ? "mt-4" : ""}`}>{title}</h3>
      <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-2">{body}</p>
      {beta ? (
        <p className="mt-3 text-sm text-ink-3">
          Built and tested, being proven on real accounts and devices.{" "}
          <Link href="#status" className="font-medium text-ink-2 underline-offset-4 hover:underline">
            What works today
          </Link>
        </p>
      ) : null}
      {children}
    </li>
  );
}

export function ModulesBento() {
  return (
    <section id="modules" aria-labelledby="modules-title" className="py-20 lg:py-28">
      <Container>
        <SectionHeading id="modules-title" title="Eight parts, one shared core.">
          Studio, the agent, moving projects and launching all use the same rules, proof and plan limits. Nothing is built twice.
        </SectionHeading>

        <ul className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Cell
            title="Studio"
            body="A visual editor for static sites and a real code workspace on one source of truth. Every visual edit, and every change the agent suggests, is shown line by line for you to review."
            className="bg-surface md:col-span-2 lg:row-span-2"
          >
            <div className="mt-6">
              <DiffView lines={SAMPLE_DIFF} path={SAMPLE_CHANGED_FILE.path} />
              <p className="mt-2 text-xs text-ink-3">Sample diff</p>
            </div>
          </Cell>

          <Cell
            title="Trust"
            body="Rules, approvals, what each agent may do, how much runs on its own, and a full history, all enforced on the server. Words in a prompt are never what keeps you safe."
            className="bg-canvas-2 md:col-span-2"
          >
            <p className="mt-4 text-sm leading-relaxed text-ink-2">
              Each change is allowed, allowed within limits, held for your approval, tried first in a test space, sent to an owner, or blocked.
            </p>
          </Cell>

          <Cell
            title="Agent"
            body="Farbaek's own runtime. The model suggests; Farbaek checks every action against your plan before it runs."
            icon={HammerIcon}
            className="bg-surface"
          />

          <Cell
            title="Plans"
            body="A plan you approve for every task, what the agent needs to know first, and how it turned out: received, plan approved, building, checking, verified."
            className="bg-surface"
          />

          <Cell title="Core" body="Sign-in, workspaces, projects, tasks and what each plan includes." icon={SquaresFourIcon} className="bg-surface" />
          <Cell
            title="Move projects"
            body="Send projects between your own devices: nearby, directly over the internet, or through Farbaek's relay, encrypted end to end and checked byte for byte."
            icon={PackageIcon}
            className="bg-surface"
            beta
          />
          <Cell
            title="Launch"
            body="Launch to your own Vercel or Netlify account, with what goes named first, your typed confirmation, and live checks after."
            icon={CloudArrowUpIcon}
            className="bg-surface"
            beta
          />
          <Cell
            title="Mobile"
            body="Install Farbaek on your phone: approve work, get told when builds finish, and send files to your computer."
            icon={DeviceMobileIcon}
            className="bg-surface"
            beta
          />
        </ul>
      </Container>
    </section>
  );
}
