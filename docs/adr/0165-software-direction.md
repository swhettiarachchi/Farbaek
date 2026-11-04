# ADR 0165: The software site as a premium direction

- Status: accepted (2026-11-04).
- Extends ADR 0158, ADR 0160 and ADR 0163 (premium directions). Amends ADR 0028 (templates).

## Context

Nine of the eleven templates were premium directions on the Studio kit. The software site (Ledgerly) was still the older self-contained page:
- system fonts and no photos;
- its own CSS rather than the kit's looks, reveals and tilt.

Prompts for software, startups or tools didn't map to any direction, so they started from the general kit starter, unless the person picked the template. Stage 146 listed this as next.

## Decision

- **The software site is rebuilt as a direction on the Studio kit** (`saas-site`), light by default, keeping its product and its working demo.
  - **Brand:** the signal look tuned warm (burnt orange `#c2410c`, a brighter orange for fills on dark, an ink-black featured plan). Sora for display, DM Sans for text, JetBrains Mono with tabular figures for amounts and dates.
  - **The hero is the product, in 3D:** the live ledger is tilted in space, with the Paid notice and the next reminder floating in front of it at their own depth (CSS 3D). It leans toward the pointer (kit tilt) and drifts slowly. Reminders send, invoices get paid, and the total and notice follow.
  - **A dark chapter over a Farbaek Scenes horizon:** the follow-ups (day 0, 3, 7 and 14) pass as you scroll, and the slider drives the same email. The late fee appears on the final notice.
  - **The rest of the page:**
    - a bento of features that show the thing working (a payment sheet, a tone switch, a late fee that counts up, a log), with a team photo;
    - a quote beside a photo, labelled as a sample;
    - two plans with a monthly and yearly switch;
    - questions, and a sign-up that checks the address and says plainly that no account was made.
  - **Real photos** from the sorted stand-ins ("teams") in replaceable slots.
  - **Honest content:** no invented customer logos, user counts or ratings.
- **Prompts map to it** (`templateForPrompt`): software, startups, B2B, developer tools, productivity tools, invoicing and accounting tools, and a tool or platform for teams, freelancers, businesses, studios or agencies.
  - These are checked after the event words and before the shop and launch words, so software that sells or launches stays software.
  - A hardware launch still goes to the launch page.
  - Prompts with app words ("app", "SaaS", "dashboard") still start a Next.js app, as before.

## Consequences

- **Ten of the eleven templates are premium directions now.** The dashboard and the CRM are applications rather than websites, and stay self-contained.
- The software site passes every premium site check; only its placeholder photos are left to replace, like the other directions.
- Sites already built from the old software template keep their look until the agent or Studio's "Upgrade its design" touches them.
