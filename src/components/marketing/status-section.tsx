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

// Keep in step with docs/stages/. Only list something under "Built and tested"
// when it is implemented and covered by tests in this repository.
const GROUPS: Group[] = [
  {
    title: "Built and tested",
    note: "Unit-tested in the repository. Not live for customers yet.",
    icon: CheckCircleIcon,
    iconClass: "text-verified",
    items: [
      "Plan catalog and annual pricing math",
      "14-day trial rules, reminders and expiry to Free",
      "Entitlement checks that fail closed",
      "Idempotent usage metering",
      "Task lifecycle state machine with evidence guards",
      "Approval binding with RFC 8785 and SHA-256",
      "Intent contract schema and checks",
      "Organizations with row-level tenant isolation",
    ],
  },
  {
    title: "Next",
    note: "Stages 1 to 3.",
    icon: HourglassMediumIcon,
    iconClass: "text-approval",
    items: [
      "Accounts and sign-in, opened to customers",
      "Projects, tasks and contracts with real storage",
      "Studio editor and diff review",
      "Sandboxed builds and test runs",
      "Signed ProofPacks",
    ],
  },
  {
    title: "Later",
    note: "Stages 4 to 8, as each one is proven.",
    icon: CircleDashedIcon,
    iconClass: "text-unverified",
    items: ["Desktop agent runtime", "Mesh device transfer", "LaunchOS deployments", "iOS and Android apps", "Payments"],
  },
];

export function StatusSection() {
  return (
    <section id="status" aria-labelledby="status-title" className="border-t border-line py-20 lg:py-28">
      <Container>
        <SectionHeading id="status-title" title="What works today, and what doesn't yet.">
          No account can be created yet. Here is the honest state of the build.
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
