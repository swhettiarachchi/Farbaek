import { CheckCircleIcon, CircleDashedIcon, HourglassMediumIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "./section-heading";

interface Group {
  title: string;
  note: string;
  icon: Icon;
  iconClass: string;
  items: string[];
}

// Keep in step with docs/stages/. Only list something under "Built and working"
// when it is implemented, covered by tests in this repository and has been
// used end to end on a real setup.
const GROUPS: Group[] = [
  {
    title: "Built and working",
    note: "Tested and used end to end. Not hosted for customers yet.",
    icon: CheckCircleIcon,
    iconClass: "text-verified",
    items: [
      "Sign-in by email link, workspaces with row-level tenant isolation",
      "Projects with versioned files, import, search and the Studio editor",
      "Intent contracts, drafted with Claude or Gemini, approved by hash",
      "Agent-proposed changes with per-chunk diff review",
      "Policy checks, approvals and escalation to owners",
      "Contract checks run in Firecracker microVMs, with real exit codes",
      "ProofPacks and receipts, and undo of applied changes",
      "14-day trial and plan limits that fail closed",
    ],
  },
  {
    title: "Next",
    note: "Before sign-ups open.",
    icon: HourglassMediumIcon,
    iconClass: "text-approval",
    items: ["Hosting on a public domain", "Trial reminder emails", "Signed ProofPacks", "First Farbaek Agent runs with a real model, and signed installers"],
  },
  {
    title: "Later",
    note: "Stages 5 to 8, as each one is proven.",
    icon: CircleDashedIcon,
    iconClass: "text-unverified",
    items: ["Mesh device transfer", "LaunchOS deployments", "iOS and Android apps", "Payments"],
  },
];

export function StatusSection() {
  return (
    <section id="status" aria-labelledby="status-title" className="py-20 lg:py-28">
      <Container>
        <SectionHeading id="status-title" title="What works today, and what doesn't yet.">
          Sign-ups aren&apos;t open yet. Here is the honest state of the build.
        </SectionHeading>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1.25fr_1fr_1fr] lg:gap-0 lg:divide-x lg:divide-line">
          {GROUPS.map((group, i) => (
            <div key={group.title} className={i === 0 ? "lg:pr-10" : "lg:px-10"}>
              <h3 className="flex items-center gap-2 text-[17px] font-medium">
                <group.icon size={20} weight="bold" className={group.iconClass} aria-hidden />
                {group.title}
              </h3>
              <p className="mt-1 text-sm text-ink-3">{group.note}</p>
              <ul className="mt-5 grid gap-2.5 text-[15px] text-ink-2">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
