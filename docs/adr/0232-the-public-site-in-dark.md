# ADR 0232: The public site in Dark

- **Status:** accepted (stage 211, part 2, 2026-11-23)
- **Builds on:** ADR 0227 (two looks, the person's choice), ADR 0226 (the cat on its white paper), ADR 0175 (the sign-in pages' script policy), ADR 0171 (the site layout's first inline script)
- **Changes:** ADR 0227's "the public site stays light for now"

## Context

Stage 211 gave every signed-in page a Dark look, chosen once and read by the server from a cookie, so the first paint is right and no script runs. It left the public site light, for one reason: the public pages are built ahead of time. They are one file for every visitor, so no server reads a cookie for them, and making them read it would make every marketing page slower for everyone.

So a person who chose Dark saw a white site whenever they left the app, and the brief asks for Dark on every page.

## Decision

**The public site follows the same choice, with the same cookie.**

- The site's layout carries a mark, as the app's does, and it arrives saying Light.
- **A fixed script, straight after the mark, corrects it before the page paints.** It reads the saved choice and writes "dark" or "system" on the mark. It writes nothing else, anywhere: a cookie is the browser's to send, so only those two words are accepted (`src/core/theme/site-script.ts`).
- **A small part of the page keeps the mark right afterwards** (`SiteThemeMark`): when someone arrives from the app without a full load, and when they change the choice.
- **A page that is already drawn is kept in step with the cookie** (`ThemeSync`, on the site and in the app). Back and Forward bring a page back as it was; another tab may have chosen since; a link inside the site replaces the tags that colour the browser's own bars; a device turns, for someone on Auto. Each time the page is checked against the cookie and corrected. With no choice saved, the page is left as the server drew it.
- **The script and the live page read the cookie the same way:** the first cookie of the name, and only a known look. A test holds the two together.
- **The footer has the control:** Light, Dark or Auto, the same control Settings has.

**Light is still what a new visitor sees**, even on a device set to dark. Dark is a choice, not a guess; Auto is there for people who want their device followed.

**The sign-in pages allow exactly this script, by its hash.** Their policy lets scripts run only with a nonce, which a page built ahead of time can't carry. The hash sits beside the one for the layout's other inline script, and a test fails when the text changes without it.

## Why a script here, when the app needs none

The app's pages are made for each request, so the server can write the mark. A page built ahead of time has two honest options: be made per request (slower for every visitor, to serve the few who chose Dark), or let the browser read its own cookie before painting. The script is under 200 characters, has no dependencies and can't fail the page: wrapped so that blocked cookies or a missing mark do nothing.

## What stayed as it was

- **Pictures of other things keep their own look:** the recorded films, the picture of a built site, the template mock-ups. They are pictures, not the page.
- **The cat sits on its white paper** in the header, the hero and the footer, as ADR 0226 says. It is never inverted.
- **The sample survey plan is drawn in the page's ink,** as it is in Survey Studio at night: light lines on a dark sheet, as CAD draws it.

## Consequences

- A layout for pages built ahead of time carries `SiteThemeMark` and `SiteThemeScript`, together and first. The script finds the first mark in the page.
- A person with scripts off sees the public site in Light, whatever they chose. The app is unaffected.
- The browser's own bars turn once the page is live, a moment after the page itself.
- Still light, whatever the choice: pages outside the site's layout that no server marks (shared links, the device page, the page that connects the desktop app, and the page for an address that doesn't exist).
- The offline page is inside the site's layout and turns. An installed app keeps its older copy of that page until its service worker next updates.
- In development, React notes once that a script inside the page isn't run when a page is drawn in the browser. The layout's older script already caused that note; it is expected, and `SiteThemeMark` reads the cookie itself in that case.
