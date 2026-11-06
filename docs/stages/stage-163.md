# Stage 163: Closing Auth's door, and what the walk found

- **Branch:** `feat/launch-setup`, from `main`.
- **Decisions:** ADR 0176.
- **Skills used:** `chrome-browser` for the consoles and the live checks, `ecc-security-review` for the probe, `farbaek-ui` and `premium-app-ui` for the words and states.

The owner signed in to every platform and asked for their list to be set up. This stage is what that turned up.

## What was done

**A security gap, found by trying it.** Thirty-six wrong sign-in codes in a row, sent straight to Auth for a made-up address, weren't limited at all, so a 6-digit code could be guessed. From outside, Auth now only answers what signing in with Google or Apple needs and an email's link, and those are limited per address. See ADR 0176.

**Sign-in emails.** Auth allowed 30 an hour across the whole platform, which a launch day would pass. It's 300 now.

**The Microsoft Store.** Farbaek Agent passed certification and is in the Store, so the Desktop app page offers it first.

**Approvals.**
- What someone can still decide comes first, soonest to close. Ones that ran out of time come last. Before, the two oldest expired ones sat above the live one.
- The sidebar and tab bar badge counts only what this person can decide, using the same reading as Home's card, so "Approvals 3" no longer sits beside "1 change waiting".
- The iPhone's badge follows, once its next build is out (`decidable`).

**A blank Studio preview.** The preview frame is cached, so it can finish loading before the page is listening. Its "ready" message was then lost, and the preview stayed blank with "Reading its styles from the page". The page now offers the site as soon as it's listening too.

**Projects.** "5 of 1 allowed on your plan" now says what it means, and the word "contract" can't appear there any more.

**The Public Suffix List** needs two years of registration left, and `farbaek.si` has under one, so it needs a paid renewal first. `docs/deploy/public-suffix-list.md` says so. It isn't needed to launch.

## What was verified

- `pnpm check`: all tests pass, including `tests/ops/api-gateway.test.ts`.
- **On production, signed in as the owner:**
  - Uploading a photo in Studio works: it's saved to the project, goes into the picture, and shows in the preview at once. The draft was undone afterwards, so the site didn't change.
  - "Try it on a copy" on a real change ran in a live test space and reported its checks, after the security changes.
  - Headers on sign-in pages, marketing pages and a published site's host are as ADR 0175 says.
- **Watch out:** the Chrome extension's network list showed some requests as 503 while the page's own timing data, and every direct request, showed 200. Trust `performance.getEntriesByType("resource")`.

## What's next

- After the merge: restart Auth so it reads its settings, then send the same wrong codes and confirm they get a 404, and that signing in still works.
- The owner's clicks, listed in the PR.
