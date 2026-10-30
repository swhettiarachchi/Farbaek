# Stage 101: Three more templates

The spec lists a storefront, a booking app and an admin dashboard among the templates; the gallery had none of them. This stage adds all three.

- **Decision record:** `docs/adr/0124-more-templates.md`.
- **Branch:** `feat/more-templates` (from `feat/why-graph`, PR #129).

## 2026-10-30

### Done

- `src/content/starters/templates/online-store.ts`, `booking.ts` and `dashboard.ts`, each with `index.html`, `styles.css`, `script.js`, `DESIGN.md` and `README.md`. They're registered in the gallery with example prompts.
- **A new template rule:** no CSS `filter` in any template (`starters.test.ts`).

### Verified

- `src/content/starters/starters.test.ts`, for all nine templates:
  - previews as static, links only to its own pages, fetches nothing, and is labelled sample;
  - a design plan, a clean site review, reduced motion, entrances gated on `.js`, and scripts that parse;
  - no CSS filters.
- **Demo build, each template driven in a test frame:**
  - **Store:**
    - filtering to bowls shows 3;
    - sorting low to high orders the prices;
    - 3 items come to $108 with free delivery, and one fewer gives 2 items at $86;
    - the cart is saved;
    - checkout opens the drawer and shows the sample notice.
  - **Booking:**
    - 14 days with 2 closed;
    - 7 times on a day, 4 taken, matching 3 ribbon bars;
    - a missing name is refused with a clear message;
    - confirming works, and the .ics file has the right start and end (9:00 am in Sri Lanka is 03:30 UTC).
  - **Dashboard:**
    - the 7-day range recalculates the tiles;
    - the arrow key reads "Today: $520";
    - 10 rows a page;
    - the Refunded filter shows only refunds;
    - search finds #1042;
    - sorting by total is descending;
    - the CSV has a header and all 64 orders.
- **At 375px:**
  - the store and booking fit, with no target under 44px;
  - the dashboard scrolled sideways at 616px and its sort buttons were 36px. Both are fixed (`minmax(0, 1fr)` columns, 44px sort buttons) and were rechecked at 360 of 360px.
- **Fixed:** the dashboard's readout dot showed at the chart's corner before anyone read it; it's now hidden until used.
- `pnpm typecheck`.
