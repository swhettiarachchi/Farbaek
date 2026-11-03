# ADR 0160: Four more premium directions: store, launch, portfolio and event

- Status: accepted (2026-11-03). Completes ADR 0158 (premium starting pages) and amends ADR 0028 (templates).
- Asked for by the owner: every site Farbaek builds should be premium, 3D, animated, light unless dark is asked for, human-made, with real images, and the platform should be complete for launch.

## Context

ADR 0158 rebuilt two templates as premium directions on the Studio kit (bakery and café, hotel and luxury) and mapped prompts to them. The store, landing, portfolio and event templates were still the older self-contained pages: drawn media, system fonts, no matched photos. A prompt for a shop, a launch, a portfolio or an event therefore started from a plain page, and the agent kept that plain structure.

The launch-day platform check also found a bug in the bakery direction: its menu filter set `hidden` on dishes, but the dishes' own `display: flex` kept them on screen. The booking, CRM and dashboard templates use the same pattern.

## Decision

- **Four new directions** on the Studio kit, all light by default, each with a distinct look and font pairing, real photos from the sorted stand-ins in placeholder slots, a 3D signature, kit motion, sample content labelled as such, and features that work:
  - **Online store** (`online-store`): Palm Row, a concept store, built on the "Shop and product pages" craft.
    - A promo bar of true messages with a pause, and a hero of three stories that wipe across, with a count, arrows and a pause.
    - Category pills and sorting that really filter the page, with a result count.
    - Sizes, with sold-out ones struck through. The button says "Select a size" until one is chosen.
    - A wishlist, and a bag drawer that remembers what's in it, with a free-delivery line. Checkout says plainly that it isn't connected.
    - A fanned 3D edit, and one sign-up drawn as a pass.
  - **Product launch** (`landing-page`): Tessel Hush, built on the "Product storytelling" craft.
    - A giant claim with a price chip and a tilting product.
    - One dark chapter where a live wave settles from Off to Aware to Hush as you scroll, over a Farbaek Scenes particle field.
    - A closer-look viewer with tabs and arrow keys.
    - Specs that count up, with footnoted claims.
    - A buy bar that follows on phones, and a pre-order form that sends nothing.
  - **Portfolio** (`portfolio`): Oru Studio, a photographer of buildings and objects.
    - The name across the page in a condensed cut, and a selected-work mosaic whose photos tilt.
    - An index you can filter, where a preview floats beside the pointer and leans with its movement (thumbnails on touch screens).
    - A project viewer with arrows, keys and Escape.
    - The steps of a shoot, and an email you can copy.
  - **Event** (`event-page`): Northline 27, a two-day conference.
    - A live countdown from the start time, saying when it's on or over.
    - The schedule by day (tabs) and track (filters).
    - Last year in real event photos, the venue and three passes.
    - A 3D ticket that fills in as you register. Registration issues nothing, and a calendar file is made in the browser.
- **Prompts map to them** (`templateForPrompt`), first match wins:
  1. "online shop" or "e-commerce" outright;
  2. food (bakery and café);
  3. luxury;
  4. portfolio words (portfolio, photographer, designer, artist, architect);
  5. event words (event, conference, meetup, wedding, party);
  6. shop words (shop, store, sell, products, boutique, candles), but not a barber shop or the App Store;
  7. launch words (landing page, launch, pre-order, waitlist, gadgets, headphones).

  So a wedding photographer gets the portfolio, and a launch on the App Store gets the launch page.
- **Hidden means hidden:** every template whose script sets `hidden` has `[hidden] { display: none !important; }`. This fixes the bakery menu filter and protects booking, CRM and dashboard.
- **Tests:**
  - every Unsplash id in a template is one of the sorted photos, so a typo can't ship a broken image;
  - a template that hides items has the hidden rule;
  - the new directions pass every premium site check, with only their placeholder photos left.

## Consequences

- Six of the eleven templates are now premium directions. Blog, booking, dashboard, CRM and the software site are still the older pages. Prompts for them start from the general kit starter, unless the person picks the template.
- The gallery's "Landing page" is now "Product launch", which says what it's for.
- Sites people already built from the bakery direction keep the menu bug until the agent or Studio touches their styles. New builds don't have it.
