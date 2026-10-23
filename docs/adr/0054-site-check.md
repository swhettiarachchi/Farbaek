# ADR 0054: Farbaek's site check, so every static build can be verified

- Status: accepted (2026-10-23).
- Builds on ADR 0012 (ProofPacks), ADR 0013 (the sandbox), ADR 0047 (verification in one step) and ADR 0050 (the Launch Evidence Gate).

## Context

**Verification runs the checks the plan lists.** A plain HTML site usually has no tests, so the AI drafted its plan with no checks. Its applied change then:
- stayed in "Verifying" for good, with nothing on the task page to do;
- could only be published with an owner's reason, since ADR 0050.

**Production showed it.** All three tasks waiting in Verifying are static sites whose plans list no checks. The two verified tasks had two checks each.

## Decision

**`farbaek check-site`** is a check Farbaek provides. It looks at what a visitor would hit:
- an `index.html`;
- on every page: a doctype, `lang`, a title and a phone viewport;
- every local link, script, stylesheet, image and CSS `url()` resolving to a file in the project, by the same rules Farbaek Sites serves paths;
- alt text on images;
- no `http://` scripts, styles or images.

**How it runs:**
- **The source:** the logic is one self-contained TypeScript function, `checkSite`, unit tested.
- **The script:** `scripts/site-check-script.mjs` turns its own source (types stripped by Node 24) into the script in `site-check-script.ts`. A test fails if that file is stale, and another runs the script under Node against files on disk. No bundler or minifier changes what the sandbox runs.
- **In the sandbox:** the check run writes the script to `.farbaek-checks/check-site.mjs` after hashing the applied files, then runs it with `node`. The receipt names the check with the script's hash.

**When it runs:**
- **New plans for an existing static site** list it. The drafting prompt says so, and the draft gets it when the model listed no checks. The person sees and approves it as part of the plan.
- **A static site whose plan lists no checks** has the site check run in its place, through one rule (`checksToRun`) that the sandbox check run, the verification runner and the task page all use. That covers new projects (empty when their plan was drafted) and the tasks already waiting.
  - **The task page says so:** "The plan lists no checks, so Farbaek checks the site itself", with the button "Check the site now".
  - **The receipt and the ProofPack** record exactly which check ran.
- **Projects with packages and no checks** still have nothing to run. The task page now says so and what to do: ask for checks in the next build's plan, or undo the change. Before, it said nothing.

## Consequences

- **Static builds can reach Verified,** so publishing them needs no override reason when the site check passes.
- **Autonomy is unchanged.** It still treats a plan with no checks of its own as not verifiable, so it waits for a person.
- **The check is deliberately narrow.** It doesn't judge design, content or JavaScript behaviour; a passing site check means the site is wired together, not that it's good.
- **Not run against a live sandbox here.** It's tested with the mock runtime, and the script runs under Node in the tests.
