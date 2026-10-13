import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "./section-heading";

export interface FaqItem {
  q: string;
  a: string;
}

export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-medium [&::-webkit-details-marker]:hidden">
            {item.q}
            <CaretDownIcon
              size={18}
              className="shrink-0 text-ink-3 transition-transform duration-[220ms] ease-standard group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden
            />
          </summary>
          <p className="max-w-[65ch] pb-5 text-[15px] leading-relaxed text-ink-2">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

const HOME_FAQ: FaqItem[] = [
  {
    q: "Can I sign up today?",
    a: "Not yet. Accounts open once the core workflow works end to end: sign in, create a project, approve a contract, run real tests and get a ProofPack.",
  },
  {
    q: "Does Farbaek run my code safely?",
    a: "Builds and tests will run in an isolated sandbox with time, memory and network limits. Where isolation can't be verified, Farbaek drops to Review Only instead of pretending.",
  },
  {
    q: "What does a ProofPack prove?",
    a: "That specific commands ran against a specific state with specific results, under stated assumptions. It does not prove your software is free of defects.",
  },
  {
    q: "Which AI models does it use?",
    a: "Officially supported model APIs, through Farbaek's own provider layer. Farbaek records which model worked on each task and never switches providers silently.",
  },
  {
    q: "Is there lock-in?",
    a: "Projects are standard repositories. You can export the code, contracts, ProofPacks and history and build without Farbaek.",
  },
];

export function HomeFaq() {
  return (
    <section aria-labelledby="faq-title" className="border-t border-line py-20 lg:py-28">
      <Container className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <SectionHeading id="faq-title" title="Questions, answered plainly." />
        <FaqList items={HOME_FAQ} />
      </Container>
    </section>
  );
}
