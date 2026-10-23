import type { ReactNode } from "react";
import { FeatureFilmsSection, ProductFilmSection, ProofFilmSection } from "@/components/films/film-sections";
import { AnchorLayout } from "@/components/marketing/anchor-layout";
import { DemoSection } from "@/components/marketing/demo-section";
import { EvidenceSection } from "@/components/marketing/evidence-section";
import { HomeFaq } from "@/components/marketing/faq";
import { Hero } from "@/components/marketing/hero";
import { ModulesBento } from "@/components/marketing/modules-bento";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";
import { StatementSection } from "@/components/marketing/statement-section";
import { StatusSection } from "@/components/marketing/status-section";
import { ShowcaseSection } from "@/components/showcase/showcase-section";

/**
 * Below the first screen, each section is laid out only as it nears the
 * screen (content-visibility), so a phone paints the hero sooner: about
 * 350 ms on a mid-range phone profile (ADR 0052). AnchorLayout lays them
 * all out before an in-page jump, so anchors land exactly; find-in-page and
 * the films' visibility checks work as before.
 */
function Later({ children }: { children: ReactNode }) {
  return <div className="home-later">{children}</div>;
}

export default function HomePage() {
  return (
    <>
      <AnchorLayout />
      <Hero />
      <ProductFilmSection />
      <Later>
        <StatementSection />
      </Later>
      <Later>
        <FeatureFilmsSection />
      </Later>
      <Later>
        <ShowcaseSection />
      </Later>
      <Later>
        <ProofFilmSection />
      </Later>
      <Later>
        <DemoSection />
      </Later>
      <Later>
        <ModulesBento />
      </Later>
      <Later>
        <EvidenceSection />
      </Later>
      <Later>
        <StatusSection />
      </Later>
      <Later>
        <PricingTeaser />
      </Later>
      <Later>
        <HomeFaq />
      </Later>
    </>
  );
}
