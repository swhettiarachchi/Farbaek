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
    note: "Live at www.farbaek.com, tested and used end to end.",
    icon: CheckCircleIcon,
    iconClass: "text-verified",
    items: [
      "Sign-in by email link, workspaces with row-level tenant isolation",
      "One sentence to a plan: Claude or Gemini drafts an intent contract you approve by hash",
      "The cloud agent builds under that plan, and you can message it mid-run",
      "Projects with versioned files, import, search and the Studio editor",
      "Previews of static sites",
      "Security checks, site checks in an isolated sandbox with real exit codes, and undo",
      "Signed ProofPacks anyone can check, in the browser or with OpenSSL",
      "Publishing static sites to their own address",
      "14-day trial and plan limits that fail closed",
    ],
  },
  {
    title: "Next",
    note: "Planned next, in no fixed order.",
    icon: HourglassMediumIcon,
    iconClass: "text-approval",
    items: ["Payments, so plans can be bought", "Trial reminder emails", "Previews of apps in isolated sandboxes", "Image generation", "Your own domain for a published site"],
  },
  {
    title: "Later",
    note: "As each one is proven.",
    icon: CircleDashedIcon,
    iconClass: "text-unverified",
    items: ["Mesh device transfer", "LaunchOS deployments", "iOS and Android apps"],
  },
];

export function StatusSection() {
  return (
    <section id="status" aria-labelledby="status-title" className="py-20 lg:py-28">
      <Container>
        <SectionHeading id="status-title" title="What works today, and what doesn't yet.">
          Anyone can sign in and start a 14-day trial. Payments aren&apos;t connected yet, so nothing is charged.
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
