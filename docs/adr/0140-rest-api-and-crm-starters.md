# ADR 0140: A REST API starter and a CRM template

- Status: accepted (2026-10-30).
- From master spec §6: "Offer templates that match the stack actually implemented: ... SaaS app, admin dashboard, CRM/internal tool, booking app. REST API service. React/Next.js project."

## Decision

### REST API service (a starter)

**What it is.** Plain Node.js 22, with no dependencies at all: Node's own `http` server and test runner. So nothing is installed, nothing can run on install, and there's nothing to pin.

**What it has:**
- one resource, contacts, with list (cursor pages and search), create, read, change and delete;
- validation that names each problem and refuses unknown fields;
- errors as JSON problems (RFC 9457);
- a 64 KB body limit and a per-address rate limit;
- an index page at `/`, so the preview shows something useful;
- tests that start the server on a free port and call every route;
- a README with the routes, and how to put a database behind `src/store.js`.

**How it runs.** The server reads the `--hostname` and `--port` the sandbox preview passes. `runProfile` now treats a `package.json` with `src/server.js` (and no `index.html`) as a Node app, so it previews in a sandbox and isn't offered for static publishing.

**How it's chosen.** It's offered in the project form. A prompt asking for an API on its own ("a REST API", "a JSON API service", "endpoints") starts from it; an app that merely has an API still starts from Next.js.

### CRM (a gallery template)

**The stack.** The gallery's templates are static sites (ADR 0030, ADR 0124), because published sites are static. So the CRM is an internal-tool prototype in HTML, CSS and a script.

**What it has:**
- a pipeline board where deals move between four stages by arrow buttons (labelled for screen readers), the keyboard, or drag and drop;
- a flow bar of the pipeline's value by stage, as the signature;
- key numbers, including a weighted forecast and follow-ups due;
- a contacts table with search, a stage filter and sorting;
- a new-deal dialog;
- an activity log announced to screen readers.

**Labelled as sample.** Every deal is sample data saved only in the browser, and the page says so. The board, tiles and table are complete without the script.

**Held to the Studio standard:** a DESIGN.md plan, a clean site review, reduced motion and no CSS filters.

### Still not built

- **A SaaS app with sign-in:** sign-in needs a backend and a secret store that published static sites don't have. The Next.js starter is the place to build one.

## Consequences

- A person asking for an API gets a working, tested service in the sandbox at once, without any dependency to trust.
- The CRM shows what an internal tool can do before it has a database. The agent replaces the sample data and, when asked, moves it to an app with storage.
