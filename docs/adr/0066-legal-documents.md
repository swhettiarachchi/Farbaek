# ADR 0066: Terms, Privacy Policy and Acceptable Use Policy

- Status: accepted (2026-10-24). The wording is a draft for the owner and a lawyer to review before it's relied on.
- Based on the research report `reports/Farbaek public launch readiness.md` (legal section and `research_notes/Farbaek public launch readiness/legal_policies.md`).
- Builds on ADR 0063 (email choices), ADR 0064 (account deletion, one trial per address) and ADR 0065 (launch guards), whose behaviour the documents describe.

## Context

Farbaek had no Terms of Service, Privacy Policy or Acceptable Use Policy. Sign-in creates an account, so people were joining without any agreement, and nothing told them who holds their data, where, or for how long.

The research found:
- **GDPR and UK GDPR apply** under Article 3(2), because Farbaek offers a signed-up service to people in Europe. The privacy policy follows Article 13's list.
- **CCPA doesn't apply** at Farbaek's size. Sri Lanka's PDPA controller duties start on 1 January 2027.
- **Hosting user sites** brings a US repeat-infringer policy and the EU Digital Services Act's notice-and-action and statement-of-reasons duties.
- **Anthropic's terms** require telling people that AI output can be wrong and that factual claims need checking.

A policy is only honest if the system does what it says, so the documents were written from what is built and running today.

## Decision

**Three pages, one layout.**
- `/terms`, `/privacy` and `/acceptable-use`, built with `LegalDocument` (`src/components/site/legal-document.tsx`).
- Each page has the title, "Last updated", a short version in plain words, then numbered sections.
- The contents list sits beside the text on wide screens and folds under the short version on narrow ones.
- The footer links all three, and so does each document.

**Facts in one place.** `src/config/legal.ts` holds:
- the operator, country and hosting;
- the contacts, the backup count, the log limit and the minimum age;
- the list of processors.

`src/config/legal.test.ts` ties the backup count, the log limit and the "no access log" claim to the scripts that make them true, so changing one fails the test until the policy changes too.

**Consent at sign-in.** Under the sign-in button: "By continuing, you accept the Terms of Service and Acceptable Use Policy. The Privacy Policy explains how we use your data."
- There's no checkbox.
- The privacy policy is information, not something people agree to.

**What the Terms say:**
- 18 and over.
- People own their inputs and what Farbaek makes for them; Farbaek gets only the permission it needs to store, run, back up and publish.
- AI output can be wrong, so review it before relying on it. Checks and ProofPacks record what ran; they don't prove software is fault-free.
- The trial as built: 14 days, no card, one per address, none for disposable addresses, then Free automatically, with nothing charged.
- The platform's daily AI pause.
- 30 days' notice before stopping the service or changing the terms in a way that matters.
- Provided as it is, with a liability cap of the greater of 12 months' fees and USD 100. Non-excludable liability and consumer rights are kept.
- Sri Lankan law and the courts of Colombo, with EU and UK consumers keeping their own mandatory law and courts.

**What the Privacy Policy says:**
- The controller.
- Each purpose with its lawful basis.
- AI providers' training and retention terms.
- A processors table: Anthropic, Google, Vercel, Hostinger and Spaceship.
- Where data is, and the transfer safeguards.
- Retention: until deleted, 14 nightly backups, 30 MB of logs per service, trial fingerprints kept.
- Rights, and how to use most of them in the product.
- Only essential cookies, named, so there's no banner.
- Security, and age.

**What the Acceptable Use Policy says:**
- The content and conduct that aren't allowed, including trial farming and attacks from sandboxes.
- Reporting abuse by email or Help ("Report a site or abuse").
- Copyright notices and counter-notices, with restoring after 10 working days, and repeat infringers.
- What staff can actually do: take a site offline, suspend a workspace, close an account.
- A statement of reasons and a human second look.

## Consequences

- **People see the terms before their account exists,** and every footer links them.
- **A change to backups or logs fails a test** until the Privacy Policy changes with it.
- **The processors table must change before a new service handles personal data,** including a payment provider when payments start.
- **Not done in code, and needing the owner:**
  - legal review of all three documents;
  - a DMCA designated agent (US Copyright Office, about USD 6 for 3 years);
  - quotes for an EU and UK representative (GDPR Article 27, DSA Article 13);
  - confirming Hostinger's DPA and Spacemail's DPA and server location;
  - asking Sri Lankan counsel about the PDPA before 1 January 2027.
- **Not built yet:** an export of everything a person has across workspaces. The policy offers it by email until then.
