# ADR 0149: Picking an element in the running app

- Status: accepted (2026-10-31).
- Follows ADR 0129 (the component editor), which left out click-to-pick for apps with a build step: "Mapping a click to JSX would need source maps from a running build, which Farbaek doesn't fake."

## Decision

**Match by what's on the screen, and say so.**
- A click in the running app is matched to the code by the clicked element's tag, its own words, and its classes, not by source maps. These are the same things the component editor edits.
- The result is a list of candidates, best first, each saying why it matched:
  - "the same words, the same classes";
  - "the same classes";
  - "its classes", when the app added classes of its own.
- The best one is selected, and the others can be chosen.
- Only built-in elements (`h1`, `p`, `div`) can match, because a component renders as other elements.
- Words or classes the app builds as it runs match nothing. The editor says so and points to the outline.

**Where the app runs.**
- **Source:** the project's own sandbox sessions that are running.
- **How it opens:** the component editor's **Pick in the running app** panel opens one of them, on the port the app listens on. It's framed in the editor through the existing preview gateway, private to the person and framed only by Farbaek's own origin.
- **Without a running session:** the panel says how to start one.

**The picker script.**
- **Pick mode is opt-in.** The preview is opened in pick mode: the one-use launch token carries `pick`, and the access cookie keeps it.
- **Only in pick mode, only HTML pages.** The gateway adds `<script src="/__farbaek/pick.js" defer>` to the app's HTML pages, and asks the app for them uncompressed. It does this only for responses that are 200 and UTF-8, at most 5 MB. Anything else passes through unchanged, including a page that turns out larger, which is passed on whole.
- **Served from the app's own origin.** The gateway itself serves `/__farbaek/pick.js` on the preview's origin, so the app's own scripts policy allows it. The gateway already replaces the app's CSP header with its frame rule.
- **What it does:**
  - nothing until Farbaek's page turns picking on;
  - it answers only messages from its parent frame on Farbaek's own origin;
  - while picking, it outlines what the pointer is over, swallows the click, and posts the element's tag, own words (up to 500 characters) and classes to that origin only;
  - it reads nothing else and sends nothing anywhere else.
- **On Farbaek's side:** the editor reads only messages from the preview's own origin and frame, in that exact shape.

**Ordinary previews are unchanged:** no script is added, and pages come as the app sends them.

## Consequences

- People can click the thing they want to change in their running app and land on its JSX, with the reason shown, instead of reading the outline.
- **When matching is ambiguous** (the same words in two places), the person chooses. When it's impossible (built text, classes from `cn(…)`), the editor says why.

## Not done

- Source maps, or a build plugin that tags elements with their source positions.
- Pages that block scripts with a CSP meta tag, or that aren't HTML. The panel says the picker didn't start.
- Hot reload in the frame. WebSockets aren't forwarded to previews, so the app needs a reload after a save.
