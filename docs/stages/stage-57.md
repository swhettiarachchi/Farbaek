# Stage 57: Farbaek on phones

Spec Stage 7 asks for native iPhone and Android apps. Those need the owner's Apple and Google developer accounts, a build path for iPhone and real devices (ADR 0079). Meanwhile, this makes Farbaek an installable app with push notifications.

- **Decision record:** `docs/adr/0079-installable-app-and-push.md`.
- **Branch:** `feat/phone-app`, on top of `feat/launch-vercel` (PR #69).

## 2026-10-25

### Done

- **The installed app:**
  - `src/app/manifest.ts`: name, full screen, opens Mission Control, shortcuts to Approvals and New build;
  - icons at 192 px, 512 px and maskable 512 px, from `scripts/brand-assets.mjs`;
  - Home Screen settings for iPhone in the root metadata.
- **A fix to the Apple touch icon.** Its padding was transparent, which iPhones show as black: sharp runs its steps in its own order, so the flatten had happened before the padding. The generator now places the logo, then flattens in a second pass.
- **`public/sw.js`:**
  - shows `/offline` when a page can't load;
  - shows notifications, opening only Farbaek's own paths;
  - caches only the offline page and an icon.

  It's registered from the app layout in production.
- **Push** (`src/server/push/`), with no new dependency:
  - RFC 8291 encryption and RFC 8292 VAPID signatures, with node:crypto;
  - keys from `VAPID_PRIVATE_KEY`, or derived with HKDF from the Supabase secret;
  - sending only to the browsers' push services;
  - a push notifier beside email, for finished builds and checks, in the email's words.
- **Migration v49** (`push_subscriptions`):
  - one person per device, at most ten devices each;
  - the browsers' push services only;
  - people read their own labels, never the keys;
  - devices dropped when gone or after twenty failures in a row.
  - **Applied in production** and read back.
- **Settings > This device:** turn notifications on, send a test (10 an hour) or turn them off, plus every device with notifications on. On iPhone it first explains adding Farbaek to the Home Screen.
- **The Privacy Policy** names the push services and says each message is encrypted for the device.

### Verified

- **`web-push.test.ts` (5):**
  - the encryption matches RFC 8291's worked example byte for byte;
  - fresh salt and key per message;
  - malformed subscriptions refused;
  - VAPID keys are stable, and its JWT verifies with its own public key.
- `send.test.ts` (3), `notifier.test.ts` (4), `tests/db/push-subscriptions.test.ts` (4); the email tests still pass.
- **Demo build, in headless Chrome as a phone:**
  - the manifest, service worker, offline page and icons are served, and the page links the manifest with the iPhone settings;
  - the service worker is active at `/`;
  - with the network off, a page load shows "You're offline";
  - the This device card shows its demo reason.

  `pnpm qa:a11y` on `/app/settings` and `/offline`: 0 findings.
- `pnpm typecheck` and lint are clean.
- **A flaky test, fixed here.** `executor.test.ts` gave every run in a test the id `run-1`. The executor removes a run's working folder, named after its id, only after it reports the end, so a later run in the same test could lose its folder when that cleanup was slow. With a 5 or 15 ms delay in the sandbox stop, both multi-run tests failed every time with the shared id, and passed at every delay with their own ids. Production run ids are UUIDs, so it was the test, not the product.
- **Not yet done:** a notification on a real phone. It needs a signed-in account on the live site: install Farbaek, then turn notifications on under Settings > This device and send a test.

### Next

Outcome watch and counterfactual policy replay (spec Stage 8).
