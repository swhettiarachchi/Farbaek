# Stage 189: Subscribe that always gets you to checkout

- **Branch:** `feat/subscribe-flow`, from `main` at 966533a.
- **ADR:** 0197, "One way to subscribe".
- **Migration:** none.
- **Skills:**
  - **`premium-app-ui`:** one clear action per card, with the peak (checkout) reached without detours.
  - **`ui-ux-pro-max`:**
    - 44px targets;
    - one link per card, with no nested links;
    - context kept across sign-in.
  - **`farbaek-ui` and `farbaek-human-made`:**
    - pills and tokens;
    - plain words, with the button saying what happens;
    - the done kind's check for finished steps.
  - **`ecc-security-review`:**
    - the plan id is checked on the server;
    - `next` only goes to paths on this site;
    - nothing is bought without the consent box;
    - no purchase targets in the store apps.

## What the owner asked

"When a user clicks on a plan, they are redirected to the cart. Add a Subscribe button. Think about the best experience and decide." Clicking a plan on the home page did nothing.

## What was wrong

- **The home page's plan grid** had no links.
- **The /pricing cards** lifted on hover, as if clickable, but only their Choose button worked.
- **Someone with no workspace** lost their choice after signing in, and landed on "What do you want to build?".
- **Someone already paying, or a member** who isn't an owner or admin, saw Billing with nothing open.

## Done

- **`/subscribe/<plan>`** (`src/app/(site)/subscribe/[plan]/page.tsx`): the one address every Subscribe button links to.
  - **Signed out:** it sends you to sign in and back.
  - **No workspace:** you name one here ("Continue to review").
  - **Otherwise:** it goes on to Billing's review step.
  - **Plans that aren't paid and self-serve:** it goes to /pricing.
- **`src/core/billing/subscribe.ts`, with tests:**
  - `subscribePath` and `billingChoosePath`;
  - `planFromSubscribeNext`, which reads only an exact `/subscribe/<plan>`;
  - `baseName` and `billingPeriods` (Lite and Maker are monthly or yearly);
  - `subscribeStep`, the answer Billing gives a chosen plan.
- **Billing (`src/app/app/billing/page.tsx`):** a chosen plan opens the review step, becomes a change for someone paying through Dodo Payments, or shows why not. The cases for "why not":
  - already on it;
  - billed through the App Store or Google Play;
  - not an owner or admin;
  - checkout closed.
- **The review step (`ChoosePlanStep`):**
  - "Subscribe to <plan>";
  - it names the workspace, and says to switch first when there are others;
  - Monthly and Yearly pills for Lite and Maker.
- **Plan cards:**
  - **`PlanCardLink`** (`src/components/pricing/plan-card-link.tsx`): the pill is the card's one link, and its hit area covers the card.
  - **The home page's grid** is now a list of cards with Subscribe (Start free on Free).
  - **/pricing:** the cards use it too. Pay yearly instead and its note stay their own targets.
- **The plan stays in view:** `SubscribeSummary` (price, what's included, the four steps, where you are) shows on sign-in and the workspace step. Sign-in reads "Sign in to subscribe to <plan>".
- **Creating a workspace** (`createOrganization`) goes on to the review step when the form carries a paid plan.
- **The proxy** refreshes the session on `/subscribe`.
- **Store apps:** the home page's Subscribe pills carry `data-web-purchase`, so the Android and iPhone apps have no paid links.

## Verified

- **Tests:**
  - `src/core/billing/subscribe.test.ts`: 12 tests;
  - `tests/design`, `src/core/billing`, `src/config` and `src/server/billing`: 42 files, 398 tests;
  - `pnpm typecheck` and lint pass.
- **Dev server:**
  - **Signed out:** `/subscribe/pro` gives 307 to `/sign-in?next=/subscribe/pro`, and `/subscribe/free` gives 307 to `/pricing`.
  - **A real click on Pro's card text** (not its button) went to sign-in. It read "Sign in to subscribe to Pro", with the plan and steps beside it.
  - **Links:** every card on the home page and /pricing has one link with the right name and address, and a point on the card's text resolves to that link. On /pricing, Pay yearly instead resolves to the yearly plan.
- **The demo workspace:** `/subscribe/maker_monthly` lands on Billing with the honest "Payments aren't connected" notice.
- **The review step and the workspace step** were drawn on a temporary local page (deleted) and looked at at full size.
- **375 px:**
  - the home grid is one column with 48px pills;
  - sign-in has the summary under the form;
  - nothing scrolls sideways.
- **With `?client=android-app`:** the home grid shows no prices and no Subscribe, only Start free.
- **`qa:a11y`** on `/`, `/pricing` and sign-in for a plan, at 1280 and 375: 0 findings.
- **`qa:responsive`** on those and `/app/billing?choose=pro`, from 320 to 1440: nothing sideways, cut off or too small.
  - The home page logs a hydration warning from the showroom's Motion figures in dev, which this change doesn't touch.
- **An independent review** found these, and all are fixed:
  - **A plan set to end could be switched from a pricing card.** Billing's own buttons blocked it, but the server didn't, and the downgrade wording ("you keep Pro until…, then move to Plus") would have been false.
    - The server now refuses a change while a plan is set to end (`CANCELLING`), with a test.
    - A chosen plan shows "Pro is set to end on … press Keep Pro below first".
  - **An owner of a paused workspace was told to ask an owner.** The role and the reason saves are off are now separate, and the real reason is shown.
  - **Members of someone else's workspace had no way on.** Their notice links to `/subscribe/<plan>?new=1`, and /subscribe offers them a workspace of their own (the open one stays as it is).
  - **A server without sign-in bounced Subscribe back to /pricing.** It now goes to sign-in, which says sign-in isn't connected.
  - **The trial wasn't mentioned on the way.** /subscribe says new workspaces get the trial once per email address, and subscribing ends it.
  - **Smaller fixes:**
    - the notice's anchor is used only when no step has it;
    - notices about buying stay out of the store apps.
  - **After the fixes:** `pnpm typecheck` and lint pass, and design, billing and config pass 401 tests. On the demo server, `/subscribe/pro` and `?new=1` go to Billing and an unknown plan goes to /pricing.
- **Not checked here:**
  - a real sign-in, making a workspace and Dodo's checkout, because the local Supabase project is paused;
  - the review step with checkout open.

  These are checked on production after merging, stopping before payment.
