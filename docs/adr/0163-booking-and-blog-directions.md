# ADR 0163: Booking and blog directions

- Status: accepted (2026-11-03). Extends ADR 0158 and ADR 0160 (premium directions).
- Asked for by the owner: keep building until every kind of site Farbaek makes starts premium.

## Context

After ADR 0160, six of the eleven templates were premium directions. Two very common requests still started from older, plainer pages:
- businesses that sell time by appointment: salons, barbers, clinics, gyms, yoga and tutors;
- blogs and journals.

A "barber shop" prompt started from the general starter, and a "food blog" from the café direction.

## Decision

- **Booking** (`booking`): Mirror & Comb, a hair studio and barbers.
  - Choose a service (filtered by kind) and a person.
  - A ribbon of the next two weeks, with real open times worked out from the hours and the service's length. Taken times are struck through; they're sample times, and the page says so.
  - A summary that follows along, a booking kept in the browser that says plainly nothing was sent, and a calendar file.
  - A 3D "next chair free" card, worked out live for the chosen service.
  - Real salon and barbershop photos.
- **Blog** (`blog`): Slow Roads, a travel and food journal.
  - A featured story, topics and a search that filter the stories, and an honest newsletter form.
  - An essay page set for long reading:
    - a reading line drawn by CSS scroll-driven animation, with no script;
    - contents that follow along;
    - a drop capital, a pull quote and a box of practical facts;
    - a reading time worked out from the words.
  - Real travel and food photos.
- **Prompts map to them:**
  1. an online shop outright;
  2. a blog, journal or newsletter outright, so a food blog is a blog;
  3. food;
  4. luxury, where a spa stays;
  5. booking words (appointment, salon, barber, clinic, dental, physio, yoga, gym, tutor);
  6. portfolio, event, shop and launch, as before.
- **The photo test** now checks Picsum stand-ins as well as Unsplash ones.

## Consequences

- Eight of the eleven templates are premium directions.
- **Still on the older pages:**
  - the software site, which has a working product demo worth carrying over;
  - the dashboard and the CRM, which are app-like and rarely what a website prompt asks for.
- A reading line needs a browser with scroll timelines (Chrome, Edge and Safari 26). Elsewhere it simply doesn't show; the story reads the same.
