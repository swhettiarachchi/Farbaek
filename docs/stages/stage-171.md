# Stage 171: What the public can see

- **Branch:** `feat/disclosure`, from `feat/audit-rest` (#217), so it carries stage 170 until that merges.
- **ADR:** 0182. No migration.
- **Skills:** `ecc-security-review` for the audit, `farbaek-human-made` for the words people read.

## What the owner asked

The owner's screenshots showed the public privacy page naming Farbaek's hosting, email, network and payment companies, down to the town, with "we're confirming" twice. They asked for every page, component, file, API and page source to be checked, and for anything private or internal to be removed or restricted on the server, not just hidden.

## How it was done

A read-only audit of every public route, public file, unauthenticated API, response header and the JavaScript any visitor downloads, checked against production with GET requests only. Each finding was then fixed in the repo, with a test that keeps it fixed.

## Found and fixed

- **Plan economics were in every page's JavaScript.** A price formatter and model names pulled the whole plan catalog into the browser, with the target margin, the payment fee, the test space cost per hour and every model's price per token. Names, money formatting and labels now live in small modules of their own, and the run estimate, the kit tier and the second check's routing moved out of what the browser imports. A new test traces every browser file's imports and fails if any reaches the cost modules.
- **The sign-in email templates named the staff console** and how staff sign in. Caddy now answers not found from outside for them, and for the internal job routes and the certificate check, which only the server itself calls. It also strips the headers that named the server, the proxy and Next.js internals, on every site.
- **The privacy page named the infrastructure companies.** Hosting, off-site backups, the test space, email delivery and the bot check are now listed by what they do and where. The AI providers and Google Analytics stay named, the merchant of record has its own paragraph, and anyone can ask which company provides each service. The "we're confirming" lines are gone, along with the staff cookies, the security tools' names and how big the logs are.
- **Public endpoints said too much.** `/api/health` shows an id of the build instead of the commit, `/api/ready` says only whether Farbaek is ready, and the security page no longer shows a commit or quotes rate limits. robots.txt no longer lists the staff and internal routes; they keep out of search with noindex, and analytics still never counts them.
- **Customers saw how Farbaek is run.** The test space's provider is "a Farbaek test space" on every screen, in the API and in new signed records. AI and checkout errors no longer name settings or the payment provider's keys, a paused run no longer mentions Office Space, the platform's daily AI limit isn't described, and the home page no longer says what's waiting to be connected. Lines saved before this pass through a guard when shown.
- **The admin console loaded its code for anyone** who opened `/admin`. The proxy now answers a plain not found unless the signed-in email is on its list.
- **Smaller:** ADR numbers in public files, the footer's payment line, and setup instructions on a server that isn't configured.

## Checked

| Check | Result |
| --- | --- |
| `pnpm typecheck`, `pnpm lint` | Pass |
| `pnpm test` | Every file passes, with the new guards for browser imports, the front door and the provider list |
| `pnpm security:eval` | 41 of 41 pass, run re-recorded |
| The demo build's browser bundles | None holds the margin, fees, model prices, setting names or infrastructure names |
| `pnpm qa:responsive` | 550 page views, no findings |
| `pnpm qa:a11y` | 96 page views, no findings |

- On the demo server, `/api/health` answers only `ok` and the build id, `/admin` answers a plain not found, robots.txt lists only the ordinary paths, and the privacy page lists the services by category.
- The Caddy changes are checked by its own CI job, which loads the file, and reach production with the next deploy. The sign-in emails should be tried once after it, because the sign-in service falls back to plain emails if it can't fetch the templates.

## Not done, and why

- **The password sign-in link for app store reviewers stays** on the sign-in page while the iPhone and Windows reviews are open. Once they're approved, the link can go and reviewers get the address in their notes.
- **Old rows in the database keep their wording.** They're shown through the guard, so nobody reads them; a one-off clean-up is optional and needs the owner, because it writes to production.
- **The merchant of record's privacy link** isn't added: the page says its checkout links to its policy, rather than a link nobody has checked.
- **Some vendors can be found anyway**, from DNS and certificate logs. This stops Farbaek advertising them; it doesn't make them secret.
