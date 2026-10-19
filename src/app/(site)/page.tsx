import { FilmSection } from "@/components/film/film-section";
import { DemoSection } from "@/components/marketing/demo-section";
import { EvidenceSection } from "@/components/marketing/evidence-section";
import { HomeFaq } from "@/components/marketing/faq";
import { Hero } from "@/components/marketing/hero";
import { ModulesBento } from "@/components/marketing/modules-bento";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";
import { StatementSection } from "@/components/marketing/statement-section";
import { StatusSection } from "@/components/marketing/status-section";
import { ThreadSection } from "@/components/marketing/thread-section";
import { ShowcaseSection } from "@/components/showcase/showcase-section";

export default function HomePage() {
  return (
    <>
      <Hero />
      <FilmSection />
      <StatementSection />
      <ShowcaseSection />
      <ThreadSection />
      <DemoSection />
      <ModulesBento />
      <EvidenceSection />
      <StatusSection />
      <PricingTeaser />
      <HomeFaq />
    </>
  );
}
