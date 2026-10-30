import type { Metadata } from "next";
import { Bullets, DocLink, LegalDocument, type LegalSection } from "@/components/site/legal-document";
import { TRIAL } from "@/core/billing/catalog";
import { LEGAL, PAID_TERMS_VERSION } from "@/config/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The agreement for using Farbaek: accounts, the free trial, who owns what, AI output, published sites, and what happens when things go wrong.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "This agreement",
    body: (
      <p>
        These terms are an agreement between you and {LEGAL.operator} (&quot;we&quot;, &quot;us&quot;). By creating an account or using Farbaek, you accept them, the{" "}
        <DocLink href="/acceptable-use">Acceptable Use Policy</DocLink> and the <DocLink href="/privacy">Privacy Policy</DocLink>. If you use Farbaek for an organisation, you accept them for it and
        confirm you&apos;re allowed to.
      </p>
    ),
  },
  {
    id: "eligibility",
    title: "Who can use Farbaek",
    body: (
      <p>
        You must be at least {LEGAL.minimumAge}. If you&apos;re under 18, or under the age where you live at which you can use online services on your own (16 in some countries), a parent or guardian must agree to these terms for you. Only someone 18 or over can buy a paid plan. One person, one account: keep your sign-in to yourself.
      </p>
    ),
  },
  {
    id: "workspaces",
    title: "Accounts and workspaces",
    body: (
      <p>
        Work lives in workspaces. A workspace&apos;s owners decide who joins it and with which role, and are responsible for what happens in it. You&apos;re responsible for what you do with your
        account. Tell us at <DocLink href={`mailto:${LEGAL.support}`}>{LEGAL.support}</DocLink> if you think someone else has used it.
      </p>
    ),
  },
  {
    id: "trial",
    title: "The free trial and plans",
    body: (
      <>
        <Bullets
          items={[
            <>
              A new workspace gets a {TRIAL.lengthDays}-day trial with the limits shown on the <DocLink href="/pricing">pricing page</DocLink>. No card is needed.
            </>,
            <>One trial per email address. Addresses from disposable-email services don&apos;t get a trial; their workspaces start on Free.</>,
            <>When the trial ends, the workspace moves to Free automatically. Nothing is charged, and your projects stay.</>,
            <>A paid plan starts only when you choose one and agree to its price; the terms for paid plans are below.</>,
          ]}
        />
        <p>Plans have limits on AI use, sandbox time and more. When a limit is reached, the work it covers pauses until the limit resets or the plan changes. To keep Farbaek running for everyone, we may also pause AI work across the platform for the rest of a day.</p>
      </>
    ),
  },
  {
    id: "paid-plans",
    title: "Paid plans",
    body: (
      <>
        <p>This section, version {PAID_TERMS_VERSION}, applies when you buy a plan or more AI usage.</p>
        <Bullets
          items={[
            <>
              <strong>Who you pay.</strong> Dodo Payments is the merchant of record for Farbaek&apos;s paid plans. You pay Dodo Payments, which runs the checkout, works out and collects sales
              tax or VAT, issues your receipts and invoices, and keeps your payment method. Farbaek never sees your card details.
            </>,
            <>
              <strong>Price, currency and tax.</strong> Prices on the <DocLink href="/pricing">pricing page</DocLink> are in US dollars, without tax. At checkout you can pay in US dollars or
              another currency you choose; paying in another currency adds Dodo Payments&apos; conversion fee of up to 4%. Applicable tax is added based on where you are. Dodo Payments shows the
              exact amount before you pay.
            </>,
            <>
              <strong>Renewal.</strong> A monthly plan renews every month on the day you subscribed and charges your payment method until you cancel. Lite and Maker can be paid yearly or
              monthly; paid yearly, they renew every year on that day, and we email you about 30 days before each yearly renewal, so you can cancel first. Before checkout you agree to the exact price and
              these renewal terms, and we keep a record of what you agreed to and when.
            </>,
            <>
              <strong>Cancelling.</strong> You can cancel at any time from Billing. Your plan keeps working until the end of the period you paid for, then the workspace moves to Free and
              nothing more is charged. Until then you can keep the plan instead. Your projects and data stay; anything over Free&apos;s limits is kept, but you can&apos;t add more until
              you&apos;re under them.
            </>,
            <>
              <strong>Refunds.</strong> Payments aren&apos;t refunded for part of a period once it has started, except where the law requires a refund. If something went wrong on Farbaek&apos;s
              side, write to <DocLink href={`mailto:${LEGAL.support}`}>{LEGAL.support}</DocLink> and we&apos;ll put it right.
            </>,
            <>
              <strong>Changing plans.</strong> An upgrade takes effect once its payment goes through, and you pay the difference for the rest of the current period; Billing shows the amount
              first. Moving from a yearly plan to a monthly one takes the unused part of the year off the new plan&apos;s price, and anything left over goes toward later renewals. A downgrade takes
              effect at the end of the current period, with nothing extra charged.
            </>,
            <>
              <strong>Failed payments.</strong> If a renewal payment fails, paid features keep working while you update your payment method from Billing. If it still can&apos;t be collected,
              paid features pause until it is. Your data is kept, and exports, billing and safety controls always work.
            </>,
            <>
              <strong>More AI usage.</strong> On a paid plan you can buy more AI usage at the plan&apos;s own rate (Lite and Maker at Starter&apos;s), never past the monthly limit your
              workspace sets. It lasts 12 months, is
              used after your plan&apos;s own usage, has no cash value and can&apos;t be transferred.
            </>,
            <>
              <strong>The free trial.</strong> The trial is Farbaek&apos;s own: it needs no card and never turns into a paid plan by itself. Choosing a paid plan during the trial ends the trial
              that day.
            </>,
            <>
              <strong>Price changes.</strong> We tell you by email at least 30 days before a new price applies to your plan, and you can cancel before then.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "app-store",
    title: "Plans bought in the iPhone app",
    body: (
      <p>
        If you subscribe in Farbaek for iPhone, Apple bills your Apple account under Apple&apos;s own terms, at the price the App Store shows, which can differ from the price on our
        website. The plan renews monthly until you cancel it on your iPhone, in Settings, your name, Subscriptions, at least 24 hours before it renews. Refunds for these
        purchases are Apple&apos;s to decide, at reportaproblem.apple.com. Everything else in these terms applies to the plan as if you&apos;d bought it from us.
      </p>
    ),
  },
  {
    id: "ownership",
    title: "Your work is yours",
    body: (
      <>
        <p>
          You own what you bring to Farbaek and what Farbaek makes for you: your prompts, files, code and sites, including what AI drafts. To the extent we have any rights in AI output we make for
          you, we pass them to you.
        </p>
        <p>
          You give us permission to store, copy, process, run and back up your work, and to publish it where you ask, only to provide Farbaek to you and the people you share it with. This permission
          ends when you delete the work, apart from backups that age out as the Privacy Policy says.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI output can be wrong",
    body: (
      <>
        <p>
          Farbaek uses AI models from Anthropic and Google to draft plans and code. AI output can be inaccurate, incomplete, insecure, or similar to someone else&apos;s work. Don&apos;t rely on factual
          statements in it without checking them yourself.
        </p>
        <p>
          That&apos;s why Farbaek shows you each change before it&apos;s applied and records what was checked. Review changes before you apply, publish or use them. Checks and ProofPacks record what
          ran and what it returned; they don&apos;t prove that software is free of other faults.
        </p>
        <p>
          You also agree to follow the usage policies of the AI providers we use, such as <DocLink href="https://www.anthropic.com/legal/aup">Anthropic&apos;s Usage Policy</DocLink>.
        </p>
      </>
    ),
  },
  {
    id: "publishing",
    title: "Published sites",
    body: (
      <p>
        You&apos;re responsible for the sites you publish, on farbaek.si or your own domain, and what they say and do. They must follow the{" "}
        <DocLink href="/acceptable-use">Acceptable Use Policy</DocLink>. We may take a site offline when it breaks that policy or the law, and we&apos;ll tell you why.
      </p>
    ),
  },
  {
    id: "service",
    title: "Changes and availability",
    body: (
      <p>
        We work to keep Farbaek available and your work safe, but we can&apos;t promise it will always be available or free of errors. We may change, add or remove features. If we stop offering
        Farbaek, we&apos;ll give at least 30 days&apos; notice so you can export your work.
      </p>
    ),
  },
  {
    id: "suspension",
    title: "Suspension and ending",
    body: (
      <p>
        You can stop using Farbaek and delete your account at any time in Settings. We may suspend or close an account or workspace that breaks these terms or the Acceptable Use Policy, or puts
        others at risk. Unless the law or safety stops us, we&apos;ll tell you why and how to respond.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Warranties and liability",
    body: (
      <>
        <p>
          Farbaek is provided as it is. As far as the law allows, we disclaim implied warranties, and we aren&apos;t liable for indirect or consequential losses, or for lost profits or data you could
          have kept a copy of. Our total liability for any claim is limited to the greater of what you paid us in the 12 months before it and USD 100.
        </p>
        <p>
          Nothing in these terms limits liability that the law doesn&apos;t allow to be limited, such as for fraud or for death or injury caused by negligence, or takes away rights you have as a
          consumer under the laws of where you live.
        </p>
      </>
    ),
  },
  {
    id: "law",
    title: "Governing law",
    body: (
      <p>
        These terms are governed by the laws of {LEGAL.country}, and the courts of Colombo can hear disputes about them. If you&apos;re a consumer in the EU or UK, you also keep the protection of
        your own country&apos;s mandatory laws and can bring a claim in your own courts.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We&apos;ll post changes here with a new date. When a change matters, we&apos;ll email you at least 30 days before it applies. If you keep using Farbaek after that, the new terms apply; if you
        don&apos;t agree, you can delete your account first.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about these terms: <DocLink href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</DocLink>. Help with your account: <DocLink href={`mailto:${LEGAL.support}`}>{LEGAL.support}</DocLink>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      path="/terms"
      summary={
        <p>
          You own your work, including what AI drafts for you. AI output can be wrong, so review changes before you rely on them. The trial is {TRIAL.lengthDays} days, needs no card and moves to Free on
          its own. Follow the Acceptable Use Policy, especially on sites you publish. You can leave and delete your account whenever you like.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
