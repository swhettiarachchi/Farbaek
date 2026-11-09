import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import { Container } from "@/components/ui/container";
import { TRIAL, getPlan } from "@/core/billing/catalog";
import { SectionHeading } from "./section-heading";

export interface FaqItem {
  /** About how the website takes payment, which Farbaek for Android doesn't show (ADR 0150). */
  webOnly?: boolean;
  q: string;
  a: string;
}

export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item) => (
        <details key={item.q} data-web-purchase={item.webOnly ? "" : undefined} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-title-4 font-medium [&::-webkit-details-marker]:hidden">
            {item.q}
            <CaretDownIcon
              size={20}
              className="shrink-0 text-ink-3 transition-transform duration-[220ms] ease-standard group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden
            />
          </summary>
          <p className="max-w-[65ch] pb-5 text-body leading-relaxed text-ink-2">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

const HOME_FAQ: FaqItem[] = [
  {
    q: "Can I sign up today?",
    a: `Yes. Sign in with your email and your workspace starts a ${TRIAL.lengthDays}-day ${getPlan(TRIAL.basePlan).name} trial, with no card. When the trial ends you move to Free, and nothing is charged unless you choose a paid plan.`,
  },
  {
    q: "Does Farbaek run my code safely?",
    a: "Builds, tests and checks run in isolated test spaces with time and memory limits, away from Farbaek's own servers. Where isolation can't be verified, Farbaek drops to Review Only instead of pretending.",
  },
  {
    q: "What does a ProofPack prove?",
    a: "That specific commands ran against a specific state with specific results, under stated assumptions. It does not prove your software is free of defects.",
  },
  {
    q: "Which AI models does it use?",
    a: "Claude models from Anthropic for plans and code, and Google's Gemini for images. Farbaek records which model worked on each task and never switches quietly.",
  },
  {
    q: "Is there lock-in?",
    a: "No. Projects are plain files. Export everything gives you the code, plans, ProofPacks and history, and you can carry on without Farbaek.",
  },
];

export function HomeFaq() {
  return (
    <section aria-labelledby="faq-title" className="py-20 lg:py-28">
      <Container className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <SectionHeading id="faq-title" title="Common questions" />
        <FaqList items={HOME_FAQ} />
      </Container>
    </section>
  );
}
