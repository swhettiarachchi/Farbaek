import type { Metadata } from "next";
import { Bullets, DocLink, LegalDocument, type LegalSection } from "@/components/site/legal-document";
import { LEGAL } from "@/config/legal";

export const metadata: Metadata = {
  title: "Delete your Farbaek account",
  description: "How to delete your Farbaek account, what's deleted, and what's kept and for how long.",
};

/**
 * The account deletion page app stores link to (Google Play's Data safety
 * asks for one). Every fact here is the same as the Privacy Policy's and
 * what Settings > Delete your account does (ADR 0064).
 */
const SECTIONS: LegalSection[] = [
  {
    id: "steps",
    title: "How to delete it",
    body: (
      <>
        <Bullets
          items={[
            <>
              Sign in at <DocLink href="/sign-in">www.farbaek.com</DocLink>, or open the Farbaek app on your phone.
            </>,
            <>Open Settings and choose Delete your account.</>,
            <>Farbaek shows what happens to each of your workspaces. Confirm, and the account is deleted straight away.</>,
          ]}
        />
        <p>
          Some workspaces need a step first, and Settings says which. If a workspace has a paid plan, cancel it. If other people use a workspace you alone own, make one of them an owner.
        </p>
        <p>
          Can&apos;t sign in? Write to <DocLink href={`mailto:${LEGAL.support}`}>{LEGAL.support}</DocLink> from the account&apos;s email address and ask us to delete it. We
          check it&apos;s yours, then delete it within one month.
        </p>
      </>
    ),
  },
  {
    id: "deleted",
    title: "What's deleted",
    body: (
      <Bullets
        items={[
          <>Your account and how you sign in to it.</>,
          <>Workspaces where you&apos;re the only member, with their projects, files, tasks, history and published sites.</>,
          <>Your place in other people&apos;s workspaces: you leave them.</>,
          <>Nightly backups still holding your data are overwritten within {LEGAL.backupDays} days. Until then they&apos;re kept out of use.</>,
        ]}
      />
    ),
  },
  {
    id: "kept",
    title: "What's kept, and for how long",
    body: (
      <Bullets
        items={[
          <>In workspaces other people own, what you did there stays, such as tasks, approvals and history. It&apos;s tied to an ID that no longer points to you.</>,
          <>Tax and payment records for paid plans, for as long as the law requires. Dodo Payments keeps the payment details; Farbaek never sees your card.</>,
          <>A one-way fingerprint of your email address, so the same address can&apos;t start a second free trial. It can&apos;t be turned back into the address.</>,
          <>Server and sign-in logs, which keep at most {LEGAL.logLimit} per service and overwrite the oldest lines first.</>,
        ]}
      />
    ),
  },
  {
    id: "other",
    title: "Without deleting your account",
    body: (
      <>
        <Bullets
          items={[
            <>Delete files in a project, on the project&apos;s Files page.</>,
            <>Take a published site offline, on the project&apos;s page.</>,
            <>Download what we hold about you in Settings, under Your data, and turn off emails under Email.</>,
            <>
              Ask us to delete anything else, such as a whole project, by writing to <DocLink href={`mailto:${LEGAL.support}`}>{LEGAL.support}</DocLink> from your account&apos;s
              address. We answer within one month.
            </>,
          ]}
        />
        <p>
          The <DocLink href="/privacy">Privacy Policy</DocLink> has the rest.
        </p>
      </>
    ),
  },
];

export default function DeleteAccountPage() {
  return (
    <LegalDocument
      title="Delete your Farbaek account"
      path="/delete-account"
      updated="1 November 2026"
      summary={
        <p>
          Sign in to Farbaek, open Settings and choose Delete your account. It&apos;s deleted straight away, with every workspace where you&apos;re the only member. Backups are
          overwritten within {LEGAL.backupDays} days. Can&apos;t sign in? Write to {LEGAL.support}.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
