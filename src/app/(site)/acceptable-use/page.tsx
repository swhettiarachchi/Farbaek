import type { Metadata } from "next";
import { Bullets, DocLink, LegalDocument, type LegalSection } from "@/components/site/legal-document";
import { LEGAL } from "@/config/legal";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description: "What you can't build, run or publish with Farbaek, how to report abuse or copyright infringement, and what we do about it.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "scope",
    title: "What this covers",
    body: (
      <p>
        This policy applies to everything you do with Farbaek: what you ask the AI to make, what runs in sandboxes, and every site published on farbaek.si or a domain connected to Farbaek. It&apos;s
        part of the <DocLink href="/terms">Terms of Service</DocLink>. If someone in your workspace breaks it, the workspace can be affected too.
      </p>
    ),
  },
  {
    id: "content",
    title: "Content you can't make or publish",
    body: (
      <Bullets
        items={[
          <>Anything illegal where you or your visitors are, or that helps someone break the law.</>,
          <>Sexual content involving minors, of any kind. We report it to the authorities.</>,
          <>Threats, harassment, or content that promotes violence or hatred against people for who they are.</>,
          <>Someone else&apos;s copyrighted work, trademarks or private information, without the right to use them.</>,
          <>Sites that pretend to be another person, company or government, or collect passwords, card numbers or other details under false pretences.</>,
          <>Images, audio or video made to look real that show a real person saying or doing something they didn&apos;t, unless it&apos;s clearly labelled.</>,
          <>AI-written text about matters of public interest, such as news or elections, presented as written by a person.</>,
        ]}
      />
    ),
  },
  {
    id: "conduct",
    title: "Things you can't do",
    body: (
      <Bullets
        items={[
          <>Make or spread malware, or code that harms the people who run it.</>,
          <>Send spam, or use Farbaek&apos;s email or sites to send messages people didn&apos;t ask for.</>,
          <>Scan, probe or attack other systems from a sandbox or a published site, or try to get past a sandbox&apos;s limits.</>,
          <>Mine cryptocurrency, or use sandboxes for anything other than building and checking your project.</>,
          <>Try to get around the AI models&apos; safety measures, or Farbaek&apos;s limits, checks or approvals.</>,
          <>Test Farbaek&apos;s security without our written permission. Found a weakness? Tell us at <DocLink href={`mailto:${LEGAL.support}`}>{LEGAL.support}</DocLink>.</>,
          <>Create several accounts or use throwaway addresses to get more trials, or resell Farbaek&apos;s AI or sandboxes.</>,
          <>Claim site names to hold them or sell them on, or to look like a brand you don&apos;t represent.</>,
        ]}
      />
    ),
  },
  {
    id: "report",
    title: "Reporting abuse",
    body: (
      <>
        <p>
          If a site on farbaek.si, or anything else made with Farbaek, breaks this policy, tell us. Email <DocLink href={`mailto:${LEGAL.support}`}>{LEGAL.support}</DocLink>, or if you have an
          account, open a request in Help and choose &quot;Report a site or abuse&quot;. Include the address of the site or page and what&apos;s wrong with it.
        </p>
        <p>We read every report, and deal with the most harmful first. We may not be able to tell you what we did, but we&apos;ll tell you when we&apos;ve looked.</p>
      </>
    ),
  },
  {
    id: "copyright",
    title: "Copyright notices",
    body: (
      <>
        <p>If you think a site uses your copyrighted work without permission, send a notice to {LEGAL.support} with:</p>
        <Bullets
          items={[
            <>Your name and contact details, and your signature (typing your full name is enough).</>,
            <>The work you own, and the address of each page that copies it.</>,
            <>A statement that you believe in good faith the use isn&apos;t authorised by you, your agent or the law.</>,
            <>A statement that the notice is accurate and that you own the copyright or may act for its owner.</>,
          ]}
        />
        <p>
          We&apos;ll take the material, or the site, offline and tell the site&apos;s owner. If they believe it was a mistake, they can send a counter-notice with the same details. Unless the person who
          complained tells us they&apos;ve started legal action, we can restore the material after 10 working days. We close the accounts of people who infringe again and again.
        </p>
      </>
    ),
  },
  {
    id: "enforcement",
    title: "What we do",
    body: (
      <>
        <p>Depending on how serious it is, we may:</p>
        <Bullets
          items={[
            <>warn you and ask you to fix it;</>,
            <>take a site offline;</>,
            <>suspend a workspace, which stops new work in it and takes its sites offline;</>,
            <>close an account;</>,
            <>report it to the authorities when the law requires it or someone is in danger.</>,
          ]}
        />
        <p>
          When we act, we tell the people affected what we did, why, and which rule it was under, unless the law or safety stops us. If you think we got it wrong, reply to that message or write to{" "}
          <DocLink href={`mailto:${LEGAL.support}`}>{LEGAL.support}</DocLink>, and a person will look again.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: <p>We&apos;ll post changes here with a new date. When a change matters, we&apos;ll email you before it applies.</p>,
  },
];

export default function AcceptableUsePage() {
  return (
    <LegalDocument
      title="Acceptable Use Policy"
      path="/acceptable-use"
      summary={
        <p>
          Build and publish what you like, as long as it&apos;s legal, honest and doesn&apos;t harm anyone. No malware, spam, phishing or attacks from sandboxes, and no farming free trials. Report
          abuse or copyright problems to {LEGAL.support}. When we take action, we tell you why and you can ask us to look again.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
