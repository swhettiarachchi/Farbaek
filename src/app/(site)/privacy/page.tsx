import type { Metadata } from "next";
import { Bullets, DocLink, LegalDocument, type LegalSection } from "@/components/site/legal-document";
import { LEGAL, SUBPROCESSORS } from "@/config/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Farbaek collects, why, who processes it, how long it's kept, and how to see, export or delete it.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <>
        <p>
          Farbaek is run by {LEGAL.operator}, in {LEGAL.country}. We decide how your personal data is used, which makes us its controller. Write to{" "}
          <DocLink href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</DocLink> about anything in this policy.
        </p>
        <p>This policy covers www.farbaek.com, the Farbaek app, sites people publish on farbaek.si, and the Farbaek desktop app.</p>
      </>
    ),
  },
  {
    id: "what",
    title: "What we collect",
    body: (
      <Bullets
        items={[
          <>
            <strong className="font-medium text-ink">Your account:</strong> your email address, when you signed in, and the workspaces you belong to with your role in each.
          </>,
          <>
            <strong className="font-medium text-ink">Your work:</strong> what you write to plan software, the files in your projects and their history, AI drafts and changes, approvals, check results,
            ProofPacks, and sites you publish.
          </>,
          <>
            <strong className="font-medium text-ink">Usage:</strong> how much AI and sandbox time each workspace uses, so plans and limits work.
          </>,
          <>
            <strong className="font-medium text-ink">Messages:</strong> support requests you send us and our replies, and the emails we send you.
          </>,
          <>
            <strong className="font-medium text-ink">Security records:</strong> our sign-in service logs sign-in attempts with the email address and the IP address they came from. We keep a
            one-way fingerprint (a SHA-256 hash) of each address that has had a free trial, so the same address can&apos;t start another. To limit how many sign-in emails can be
            requested, we count requests by fingerprints of the email address and the network address.
          </>,
        ]}
      />
    ),
  },
  {
    id: "why",
    title: "Why we use it",
    body: (
      <>
        <p>Under the GDPR and similar laws, each use needs a lawful basis:</p>
        <Bullets
          items={[
            <>To provide Farbaek: your account, your workspaces, the AI work you ask for, checks, publishing and support. That&apos;s needed for our agreement with you.</>,
            <>To keep Farbaek safe and fair: security logs, rate limits, one trial per address. That&apos;s our legitimate interest, and yours.</>,
            <>To send emails about your own work and your trial. You can turn both off in Settings, under Email.</>,
            <>To keep tax and payment records once payments start, because the law requires it.</>,
          ]}
        />
        <p>We don&apos;t sell your personal data, share it for advertising, or use it to train AI models. We don&apos;t make decisions about you that are based only on automated processing and have legal or similarly significant effects.</p>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI and your work",
    body: (
      <>
        <p>
          When you ask Farbaek to draft a plan or a change, what you wrote and the files you chose go to one AI provider: Anthropic (Claude) or, when the server uses it, Google (Gemini). Only
          what that request needs is sent.
        </p>
        <p>
          Anthropic&apos;s commercial terms don&apos;t let it train its models on what we send. It deletes API inputs and outputs within 30 days, except content its safety systems flag, which it can
          keep for up to two years. We use Gemini only on a paid account, whose terms don&apos;t let Google use the content to improve its products.
        </p>
        <p>Farbaek labels AI-drafted work, records which model drafted each change, and asks you to review it before it&apos;s applied. AI output can be wrong; see our Terms.</p>
      </>
    ),
  },
  {
    id: "processors",
    title: "Who processes it for us",
    body: (
      <>
        <p>These services handle personal data on our behalf, under their data processing terms:</p>
        <ul className="grid gap-3 sm:hidden">
          {SUBPROCESSORS.map((p) => (
            <li key={p.name} className="rounded-md border border-line bg-surface p-4 text-sm">
              <p className="font-medium text-ink">{p.name}</p>
              <dl className="mt-2 grid gap-1.5">
                <div>
                  <dt className="text-ink-3">What for</dt>
                  <dd>{p.purpose}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Data</dt>
                  <dd>{p.data}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Where</dt>
                  <dd>{p.where}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-hidden rounded-sm border border-line sm:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-sunken text-ink">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Service</th>
                <th scope="col" className="px-3 py-2 font-medium">What for</th>
                <th scope="col" className="px-3 py-2 font-medium">Data</th>
                <th scope="col" className="px-3 py-2 font-medium">Where</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {SUBPROCESSORS.map((p) => (
                <tr key={p.name}>
                  <td className="px-3 py-2 align-top font-medium text-ink">{p.name}</td>
                  <td className="px-3 py-2 align-top">{p.purpose}</td>
                  <td className="px-3 py-2 align-top">{p.data}</td>
                  <td className="px-3 py-2 align-top">{p.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>We&apos;ll update this list before adding a service that handles personal data.</p>
        <p>
          If you connect your own hosting account, such as Vercel, we send your project&apos;s files to that account only when you launch, and the provider handles them under
          your own agreement with it, not ours. We keep the token you gave us encrypted, never show it again, and delete it when you disconnect.
        </p>
      </>
    ),
  },
  {
    id: "where",
    title: "Where it's stored",
    body: (
      <p>
        Farbaek runs on {LEGAL.hosting}, and is operated from {LEGAL.country}. So your data is processed in the United States and can be reached from {LEGAL.country}, which may not have the
        same data protection laws as where you live. Where the law requires it, transfers to our processors rely on safeguards such as the European Commission&apos;s standard contractual clauses
        in their data processing terms.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <Bullets
        items={[
          <>Your account and your work: until you delete them, or your account. Deleting is immediate in Farbaek itself.</>,
          <>Nightly backups: each is overwritten after {LEGAL.backupDays} days, so deleted data is gone from them within {LEGAL.backupDays} days. Until then it&apos;s kept out of use.</>,
          <>
            Server and sign-in logs: each service keeps at most {LEGAL.logLimit}, and the oldest lines are overwritten first. While Farbaek is small, that can be several months.
          </>,
          <>Trial fingerprints: kept, because they only exist to stop repeat trials and can&apos;t be turned back into an address.</>,
          <>Sign-in request counts: deleted within {LEGAL.rateLimitHours} hours.</>,
          <>In workspaces you leave or that others own, what you did there stays, such as tasks, approvals and history, but tied to an ID that no longer points to you.</>,
        ]}
      />
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>You can ask to see, correct, export or delete your personal data, or to restrict or object to how we use it. Most of it you can do yourself:</p>
        <Bullets
          items={[
            <>Download what we hold about you in Settings, under Your data: one JSON file.</>,
            <>Delete your account in Settings, under Delete your account. You&apos;ll see what happens to each workspace first.</>,
            <>Export a project with its files, tasks, ProofPacks and history: Export everything, on the project&apos;s page.</>,
            <>Turn off emails in Settings, under Email.</>,
          ]}
        />
        <p>
          For anything else, write to <DocLink href={`mailto:${LEGAL.support}`}>{LEGAL.support}</DocLink>. We answer within one month. If you&apos;re in the
          EU or UK, you can also complain to your data protection authority.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    body: (
      <>
        <p>We use only what Farbaek needs to work, so there&apos;s no cookie banner. No analytics, no advertising, no tracking across sites.</p>
        <Bullets
          items={[
            <>
              <code className="font-mono text-[13px]">sb-…-auth-token</code>: keeps you signed in, until you sign out or the session ends.
            </>,
            <>
              <code className="font-mono text-[13px]">fb_ws</code>: remembers which workspace you had open.
            </>,
            <>
              <code className="font-mono text-[13px]">fb_steps</code>: remembers the workspaces where you hid the first steps.
            </>,
            <>
              <code className="font-mono text-[13px]">__Host-fb-office</code>: Farbaek staff only, for our own console.
            </>,
            <>
              <code className="font-mono text-[13px]">__Host-fb-device</code>: Farbaek staff only, so our console opens only on devices they&apos;ve approved.
            </>,
            <>In your browser&apos;s local storage: a prompt you typed before signing in, so it&apos;s still there after, and notices you dismissed. It stays on your device.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Your workspace&apos;s data is separated from others&apos; in the database, every change goes through the server, and Farbaek never runs your project&apos;s code on its own servers: checks run
        in isolated sandboxes. No system is perfectly secure. If a breach puts your data at risk, we&apos;ll tell you and the authorities as the law requires. You can see how we test our own boundaries on the{" "}
        <DocLink href="/security">security tests</DocLink> page.
      </p>
    ),
  },
  {
    id: "children",
    title: "Age",
    body: <p>Farbaek is for people aged {LEGAL.minimumAge} and over. We don&apos;t knowingly collect data from anyone younger. If you think a child has signed up, tell us and we&apos;ll delete the account.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: <p>We&apos;ll post any change here with a new date. If a change matters to how we use your data, we&apos;ll email you before it applies.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      path="/privacy"
      summary={
        <p>
          We collect what Farbaek needs to work: your email, your work, and usage. We use it to run Farbaek and keep it safe, never to sell or advertise. AI providers receive only what each
          request needs, and their terms don&apos;t let them train on it. You can export your projects, turn off emails and delete your account yourself.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
