import {
  BookOpenTextIcon,
  CloudArrowUpIcon,
  DesktopIcon,
  DeviceMobileIcon,
  FlowArrowIcon,
  PackageIcon,
  PencilRulerIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { DiffView } from "@/components/code/diff-view";
import { Container } from "@/components/ui/container";
import { SAMPLE_CHANGED_FILE, SAMPLE_DIFF } from "@/content/samples";
import { SectionHeading } from "./section-heading";

interface Tool {
  icon: Icon;
  title: string;
  body: string;
  /** Built and tested, not yet proven on real accounts and devices: said in a sentence, never as a stamp (ADR 0180). */
  beta?: boolean;
}

const TOOLS: Tool[] = [
  {
    icon: TerminalWindowIcon,
    title: "Test space",
    body: "Run an app and try it, apart from everything else. Checks run here against the files that will ship.",
  },
  {
    icon: BookOpenTextIcon,
    title: "Skills",
    body: "Teach the agent how you design and build, from Farbaek's library or your own SKILL.md files.",
  },
  {
    icon: FlowArrowIcon,
    title: "Workflows",
    body: "A bigger goal, broken into steps and done one at a time.",
  },
  {
    icon: CloudArrowUpIcon,
    title: "Launch",
    body: "Publish to Farbaek's own address, or launch to your Vercel or Netlify account with what goes named first and live checks after.",
    beta: true,
  },
  {
    icon: DesktopIcon,
    title: "Desktop app",
    body: "Let the agent work on your own computer, with the same plans and approvals.",
    beta: true,
  },
  {
    icon: DeviceMobileIcon,
    title: "On your phone",
    body: "Install Farbaek on your phone: approve work, get told when builds finish, and send files to your computer.",
    beta: true,
  },
  {
    icon: PackageIcon,
    title: "Move projects",
    body: "Send projects between your own devices: nearby, directly over the internet, or through Farbaek's relay, encrypted end to end and checked byte for byte.",
    beta: true,
  },
];

/** Everything around a build, on /build (ADR 0214): Studio first, with its sample diff, then the tools in a grid. */
export function BuildToolsSection() {
  return (
    <section id="tools" aria-labelledby="tools-title" className="py-14 sm:py-20 lg:py-28">
      <Container>
        <SectionHeading id="tools-title" title="Everything around the build.">
          The same rules, approvals and proof hold in every one of these, because they all run on one shared core.
        </SectionHeading>

        <div className="mt-10 grid gap-4 sm:mt-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="flex flex-col rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6 lg:row-span-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-canvas-2 text-ink-2 ring-1 ring-line">
              <PencilRulerIcon size={20} aria-hidden />
            </span>
            <h3 className="mt-4 text-title-4 font-medium tracking-[-0.01em]">Studio</h3>
            <p className="mt-1.5 max-w-[52ch] text-body leading-relaxed text-ink-2">
              A visual editor for sites and a real code workspace on one source of truth. Every visual edit, and every change the agent suggests, is shown line by line for you to review.
            </p>
            <div className="mt-6">
              <DiffView lines={SAMPLE_DIFF} path={SAMPLE_CHANGED_FILE.path} />
              <p className="mt-2 text-xs text-ink-3">Sample diff</p>
            </div>
          </div>
          {TOOLS.slice(0, 3).map((t) => (
            <ToolCard key={t.title} tool={t} />
          ))}
        </div>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.slice(3).map((t) => (
            <li key={t.title} className="flex">
              <ToolCard tool={t} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const ToolIcon = tool.icon;
  return (
    <div className="flex w-full flex-col rounded-md border border-line bg-surface p-5 shadow-e1">
      <span className="flex size-10 items-center justify-center rounded-full bg-canvas-2 text-ink-2 ring-1 ring-line">
        <ToolIcon size={20} aria-hidden />
      </span>
      <h3 className="mt-4 text-title-4 font-medium tracking-[-0.01em]">{tool.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{tool.body}</p>
      {tool.beta ? (
        <p className="mt-auto pt-3 text-sm text-ink-3">
          Built and tested, being proven on real accounts and devices.{" "}
          <Link href="/proof#status" className="font-medium text-ink-2 underline-offset-4 hover:underline">
            What works today
          </Link>
        </p>
      ) : null}
    </div>
  );
}
