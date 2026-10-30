# ADR 0124: Three more templates (store, booking, dashboard)

- Status: accepted (2026-10-30).
- From master spec §6, "Project creation": templates for "E-commerce storefront prototype" and "SaaS app, admin dashboard, CRM/internal tool, booking app". The spec audit of 2026-10-30 found the gallery had six marketing-style sites and none of these.

## Decision

Three new gallery templates, built like the first six (ADR 0030, the Studio standard):
- static files that preview instantly;
- nothing fetched;
- sample content labelled as sample;
- a `DESIGN.md` with palette, type, layout, signature and motion;
- reduced motion respected;
- complete without JavaScript;
- one feature that really works.

| Template | Sample business | What works |
| --- | --- | --- |
| **Online store** | A ceramics studio | Filter and sort the catalogue; a cart drawer with steppers, a free-delivery progress line and a cart kept between visits. Checkout says it's a sample and isn't connected. |
| **Booking** | A physio clinic | Pick a treatment, a day (closed days shown) and an open time; taken times are crossed out and a day ribbon shows how full the day is; confirm with a check of name and email; download a real calendar (.ics) file. Nothing is sent. |
| **Dashboard** | A small shop's back office | Tiles that recalculate for 7, 30 or 90 days; a revenue chart against the period before, readable by pointer or arrow keys; an orders table with search, a status filter, sorting, pages and a CSV export that keeps formula-like cells as text. |

**Signatures:**
- The store draws every product as a vessel in its own glaze, so no photos are needed.
- The booking site's day ribbon shows each open time across the day.
- The dashboard's chart compares this period with the one before.

**A new rule for every template:** no CSS `filter` (ADR 0055). On iOS 26 filters paint a black square, which would reach customers' sites too. `backdrop-filter` stays allowed. `starters.test.ts` checks every template.

## Not done

- **A REST API service template:** it needs a server, so it would be a sandbox-run starter like the Next.js app, not a gallery site.
- **A CRM template:** the dashboard covers an internal tool's core (tables, filters, export); a CRM's contact pipeline is a later template.
- **A SaaS app with sign-in:** needs a real auth backend, which a static template can't honestly provide.
