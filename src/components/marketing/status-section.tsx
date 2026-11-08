import { CheckCircleIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { Container } from "@/components/ui/container";
import { PLANS, formatUsd } from "@/core/billing/catalog";
import { SectionHeading } from "./section-heading";

interface Group {
  title: string;
  note: string;
  /** Only what's done carries a mark (ADR 0180); the other columns are their words alone. */
  icon: Icon | null;
  iconClass: string;
  items: string[];
}

/** The lowest price a plan can be bought for, from the catalog. */
const FROM = formatUsd(Math.min(...PLANS.flatMap((p) => (p.pricing.kind === "paid" ? [p.pricing.monthlyCents] : []))));

// Keep in step with docs/stages/. Only list something under "Built and working"
// when it is implemented, covered by tests in this repository and has been
// used end to end on a real setup. "Beta" is built and tested here, waiting
// for its first use on real accounts and devices.
const GROUPS: Group[] = [
  {
    title: "Built and working",
    note: "Live at www.farbaek.com, tested and used end to end.",
    icon: CheckCircleIcon,
    iconClass: "text-verified",
    items: [
      "Sign-in by email link, and workspaces kept strictly apart",
      "One sentence to a plan: Farbaek drafts it, and you read and approve it",
      "The cloud agent builds under that plan, and you can message it mid-run",
      "Projects with versioned files, import, search and the Studio editor",
      "Previews of static sites",
      "Security checks, site checks in an isolated test space with real exit codes, and undo",
      "Signed ProofPacks anyone can check, in the browser or with OpenSSL",
      "Publishing static sites to their own address",
      "14-day trial and plan limits that fail closed",
      `Paid plans from ${FROM} a month, through Dodo Payments`,
      "Farbaek Agent for Windows, Mac and Linux",
    ],
  },
  {
    title: "Being proven",
    note: "Built and tested, being proven on real accounts and devices.",
    icon: null,
    iconClass: "",
    items: [
      "Moving projects between your own devices, nearby or over the internet",
      "Launches to your own Vercel or Netlify account",
      "Farbaek installed on your phone, with notifications",
      "Previews of running apps in isolated test spaces",
      "Your own domain for a published site",
      "Image generation from a description, and your own images in projects",
    ],
  },
  {
    title: "Next",
    note: "Planned next, in no fixed order.",
    icon: null,
    iconClass: "",
    items: [
      "The Android app on Google Play",
      "Farbaek for iPhone on the App Store, approving changes with Face ID or Touch ID (Farbaek installs from Safari today)",
      "Launches from a repository (Render, Railway, Fly.io)",
    ],
  },
];

export function StatusSection() {
  return (
    <section id="status" aria-labelledby="status-title" className="py-20 lg:py-28">
      <Container>
        <SectionHeading id="status-title" title="What works today, and what doesn't yet.">
          New workspaces start a 14-day trial with no card, one per email address. After it, stay on Free or choose a plan from {FROM} a month.
        </SectionHeading>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1.25fr_1fr_1fr] lg:gap-0 lg:divide-x lg:divide-line">
          {GROUPS.map((group, i) => (
            <div key={group.title} className={i === 0 ? "lg:pr-10" : "lg:px-10"}>
              <h3 className="flex items-center gap-2 text-[1.0625rem] font-medium">
                {group.icon ? <group.icon size={20} weight="bold" className={group.iconClass} aria-hidden /> : null}
                {group.title}
              </h3>
              <p className="mt-1 text-sm text-ink-3">{group.note}</p>
              <ul className="mt-5 grid gap-2.5 text-[0.9375rem] text-ink-2">
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
