# Stage 161: What a newcomer meets first

- **Branch:** `feat/first-screens`, from `main`.
- **Decision:** ADR 0174.
- **Skills used** (the owner asked for them on every build): `farbaek-ui` for the system, `premium-app-ui` and `mobile-app-ui-design` for the phone screens, `built-in-browser` for serving the demo, and `chrome-browser` for production.

## The walk

All 41 routes at 375 px on a demo build, with each page's words read as a newcomer would read them, a list of technical words, and every first screen looked at. Then the 404, the Seal and the report form on production, read-only.

Ruled out, so left alone:
- The 404's policy error happens only on the demo build. Production hydrates cleanly.
- The "nameless controls" were inside closed folds, so my check was wrong.
- Real projects already lead with Describe a change and the live preview.

## What changed

**First screens.**
- **Home** leads with what needs you, when something does (`needs-you.ts`, `needs-you-card.tsx`).
- **Pricing** shows the plans first. The first price moved from over a screen down to 531 px on an 812 px phone.
- **Settings** starts with the workspace and its people.
- **Desktop app:** two install steps, with the fingerprint check in an optional fold, and a line on phones saying it runs on a computer.
- **Badges** keep their size (155 px rather than the whole row).
- **The tab bar:** a task, Templates and Check an app light Projects, and `/app/new` lights Build. The task list stays under More.
- **Template pictures** keep their placeholder until the frame has painted.
- **Rules:** what needs an owner or admin is now a short list.

**Words.** Over 300 replacements across the app, server messages, Pricing and Verify:
- plan for contract, change for proposal, rules for policy, test space for sandbox, proof for evidence, access for lease;
- the levels have names instead of numbers;
- Teammate for "Person demo-tea", "Couldn't check" for "Not read" (and "Not connected" in the demo, where nothing failed);
- "Launch plan" for LaunchOS.

**The guard** now also reads `src/core`, `src/server`, Pricing, Verify and Offline, single-word labels and JSX text with entities or inline tags, and bans bare "contract", "sandbox" and "propose".

Left exact on purpose, and listed in ADR 0174: hashed rule sets, prompts to a model, sandbox receipts, the Security page's scenarios, legal pages, raw database errors and the staff console. Apple's Sandbox environment, billing contracts, operator commands and the frame CSP's `sandbox` directive also keep their word, because it's the right one.

**Not changed yet:** the desktop app's own screens still say lease, intent contract and proposal. They're built into the installer, so they change with its next release.

## Found by an independent review, and fixed

Every scan and my own walk had passed. It still found these.

**Home told people it was their turn when it wasn't.** A task's state doesn't decide that, so Home now reads each change as Approvals does.
- An agent's question went to anyone who could approve. Only the person who started the run, or an owner or admin, can answer one, and approving doesn't come into it.
- A change only an admin can approve said "Your turn" to a member, and the server would have refused them.
- A change that had run out of time asked for a yes or no it can't be given, indefinitely.
- A task with no open change said "A change is waiting".
- A staff-paused workspace still said "Your turn".
- The "Waiting for you" tile counted things that weren't. It now agrees with the card.
- A run that died in a deploy kept saying it was waiting until someone opened it. Home now clears those too.

**Three plan labels said what isn't true, on the public Pricing page.**
- "A signed receipt for each action": only each applied change gets a signed record.
- "Problems and pause tools" implied the emergency pause was paid. It's on every plan.
- "Export your proof" was listed from Max 3x, but every plan can. It's now listed from Free, and no price or allowance changed.

**The guard passed for the wrong reasons.** It skipped JSX text with an apostrophe or an inline tag, single-word labels, and `components/proof`. Tightening it found over 100 more on screen, mostly "sandbox" on the Test space's own pages.

**Models read some of these sentences too.** Refusals and findings reach the agent and the second reviewer, whose prompts only knew "contract" and "policy", and the second reviewer gets the agent's own plan as "plan". Each prompt gained one line saying what the words mean.

**Smaller ones.**
- "2 changes match the plan's wording" could be read as conforming to the plan, so it's now "share words with the plan".
- "2 changes in all" counted tries.
- "Plan" meant both a task's plan and a subscription in one sentence's reach.
- "No test space is connected" wasn't true when one is connected but paused.
- A computer's narrow window was told to use a computer.
- The fingerprint check said nothing about when to do it, and came after the steps.
- Search lost a page's old name, which I'd swept by mistake and put back.
- Several sentences the first pass left ungrammatical.

## Found by looking at it

At Android's largest text, the audit reported nothing, while:
- "subscription." in Pricing's heading was wider than the screen;
- the site's menu button fell out of the header's pill, because the rule letting rows wrap reached a row that relies on not wrapping.

## Verified

- **Tests:** typecheck, lint and the full suite (2,704 tests). About thirty tests were pinned to old wording; I read each failure, and all were words only, with no behaviour changing.
- **Security evaluation:** 36 of 36 scenarios pass, re-recorded because two of its tests changed wording.
- **The guard fails on an old word:** putting "Basic policies" back in `catalog.ts` made it fail, naming the file and line.
- **Nothing reads the reworded sentences back:** the comparisons in the code are on stable keys such as `f.rule === "autonomy"`, which the review confirmed across `src`, `desktop/src` and `ios`. Hashes and signatures aren't affected.
- **The same walk afterwards,** at 375 px, read by eye, and Home, Pricing, Settings and the Desktop app page at 1280 px.
- **Audits on a demo build:** `qa:responsive` (11 pages at every width, and 9 at 200% text) and `qa:a11y` (8 pages, 2 widths), with no findings.
- **Home's card:** every kind of change and person by unit test (escalated, expired, none open, approving off, viewer, a question). On screen in the demo, it reads "A change is waiting for your yes or no" and names the one change that really is, out of two tasks in that state.

## Not tested

- A person who has never seen Farbaek using it. This walk and the review are my stand-in for that, and they aren't the same thing.
- Home's card on a real account, which is after the merge, on production. Nobody can be shown a real agent question from the demo, so that state rests on its unit test.

## Next

- **After the merge, on production in Chrome, read-only:** Home with a real waiting change, Pricing and Settings. Check `/api/health`.
- **The public site's own words and the films:** "Evidence" and "Modules" in the site's menu, and "LaunchOS" in its sections.
- **The desktop app's own words,** with its next release.
- **Approvals' count and the phone's badge** still include a change in an archived project, which Home's card leaves out.
