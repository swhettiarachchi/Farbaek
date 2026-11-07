# Stage 169: The whole platform, walked and fixed

- **Branch:** `feat/audit`, from `feat/human-made` (stage 168), so the audit holds the human-made standard from the start.
- **ADR:** 0181 (every press answers, and the hard-to-undo ones ask first). No migration.
- **Skills:** `farbaek-human-made` and `farbaek-ui` as the bar; `ui-ux-pro-max` for the rules on touch, forms, feedback and navigation; `premium-app-ui` for what premium means on a phone; `built-in-browser` for the walk; `code-review` on the fixes.

## What the owner asked

A comprehensive audit of the entire platform: every page, feature, setting and option inspected, tested and verified; every inconsistency, flaw, broken feature and incomplete implementation fixed; the result a user-friendly, enterprise-grade product where everything works together. And to keep going until it does.

## How it was done

Random looking finds random things, so the audit had five parts, each with its own list:

1. **Every route, mechanically.** A production build of the demo workspace, then `pnpm qa:responsive` over 550 page views (320 to 1440 px) and `pnpm qa:a11y` over 96. The responsive audit found one thing: seven 24 px links in the skill library. The accessibility audit found nothing.
2. **Every route, as a person.** The demo workspace at 375 px in the built-in browser, one route at a time, asking what the page is for, what to do first, and whether anything reads as technical, broken or generated. The table below.
3. **The code, by fresh eyes.** Five independent reviewers, each on one area, each told to report only what a person would meet: the public site, the signed-in pages, the shared components, the server actions and their messages, and the phone API with the iPhone and desktop apps. They returned 130 findings, graded high, medium and low.
4. **Fix, test, commit,** in four groups, with typecheck, lint and the full suite after each.
5. **What's left** is listed at the end, with the reason.

## Routes walked

| Route | What it's for | First action clear? | Found | Fixed |
| --- | --- | --- | --- | --- |
| `/` | Describe what you want and start | Yes: the box, then Start building | Nothing on the page itself; "Watch the demo" led to the hash demo, not a film | "Watch a build" leads to the build film; "How it works" in the menu too |
| `/pricing` | Choose a plan | Yes | Ten cards in a sideways carousel with no count; rollover said "a month", "two months" and "2 months" on one page | A line says how many plans and to swipe; one sentence for rollover everywhere; five columns on wide screens |
| `/sign-in` | Sign in | Yes | The review-account line looked like a normal way in | Smaller, at the foot, for app store reviewers |
| `/security` | What's tested | Yes | Nothing | |
| `/verify` | Check a proof | Yes | The paste box was 13 px, so an iPhone zooms into it | 16 px on phones |
| `/terms`, `/privacy`, `/acceptable-use`, `/delete-account` | Read the terms | Yes | Section numbers were read aloud as part of the title ("1This agreement") | The number is decorative |
| `/proofpack/v1` | Read the format | Yes | Nothing | |
| 404 | Find a way back | Yes, three ways | Nothing | |
| `/account-deleted`, `/auth/connect`, `/auth/connect/done` | One-line pages | Yes | Nothing | |
| `/app` (Home) | Your turn, then build | Yes | The trial ended at "12:24 AM" | A date |
| `/app/projects` | Open or make a project | Yes | An archived project vanished with no way back; the empty state had no action | Archived projects fold at the foot; "Describe what you want to build" |
| `/app/tasks` | Find a task | Yes | Nothing | |
| `/app/approvals` | Approve or discard | Yes | Nothing | |
| `/app/billing` | See the plan and usage | Yes | "Connections: 0" was hard-coded; the trial ended at a time of day | Counted from the same records as the Connections page; a date |
| `/app/build` | Start a run | Yes | The run list promised live steps but never refreshed; "Plan approved. Waiting for a change." | Refreshes while a run is going; "Press Build with the agent to start" |
| `/app/help` | Write to Farbaek | Yes | Nothing | |
| `/app/more` | Everything else | Yes | Nothing | |

## Found and fixed

**Things people couldn't finish, or were misled about (high)**

- Approving a change or a plan from the iPhone could never work against production: the phone API wanted an hour left on a token that lives an hour, so every token was "too old" the moment it was minted. The margin is now 45 minutes, with a test for a token a few seconds old.
- Revoking a computer or an invitation, removing a domain or a skill, disconnecting a hosting account, withdrawing a handoff, closing a support request and "Fix with the agent" returned nothing on failure, so a refusal left the page unchanged. Each now answers, through one `ConfirmAction` control (`src/components/ui/confirm-action.tsx`) that also asks first when the press changes what visitors or teammates see: taking a site offline, making an older version live, removing a domain or a skill, revoking a computer or an invitation.
- Deleting an account could say "nothing was changed" after the workspaces were already deleted.
- An archived project left the list with no way back. Projects now folds them at the foot, and the archive confirmation says so.
- Billing's "Connections: 0" was a hard-coded zero. It's counted from the same records as the Connections page.
- Taking a live site offline, and making an older version live, were one click each.
- The pricing page described rollover three ways; "Projects are standard repositories" wasn't true; the models answer dodged the question.
- A fix task could open with an empty plan and no word why; a GitHub import could silently fail to link its repository; a viewer or a paused workspace was told "payments aren't open".

**Things that looked generated, or technical (medium)**

- Status chips carried an icon on waiting and neutral states in nineteen components (test spaces, workflows, GitHub, incidents, handoffs, launches, failure trials, skills, the plan card, the desktop app, the iPhone app). Now a word in its colour and border pattern, a spinner while live, and a mark only for done and failed (ADR 0180).
- Hashes and digests were shown by default on proof cards, the publish history, launches, files, skills, handoffs, workflows, the approve box and Move projects. Each sits in "Technical details" or a tooltip; the sentence leads.
- The agent's headline step was a raw tool id in monospace ("read_file index.html"); the desktop app's steps were coloured dots and tool ids; the phone's steps were tool ids too. All three say "Read index.html" with only the path in mono, from one table in `src/core/agent/run-phase.ts`.
- Model ids reached the phone and the desktop app in monospace. Both show the product name.
- Sentences and counters squeezed into chips (Home's lane pills, "3 live", "Version 3 active", "Predicted from past changes", "Needs a look since 3 hours ago", "Every change waits for a person" with a shield) became sentences or two-word chips. Stat tiles on the practice record became one sentence.
- Rockets stood for build, publish and launch; now a hammer, a globe and an upload.
- "Beta" stamps, a pill strip of policy outcomes, a breadcrumb of task states, an arc of eleven unlabelled icon chips and "payload" on the home page became sentences and labelled marks.
- Server messages named a vendor or a variable ("Supabase isn't connected", "SUPABASE_SECRET_KEY") in twenty places. One sentence a person can act on. Test-space setup steps for the server's operator read as instructions to a member; they're folded under "For whoever runs this server".
- "Incidents", "agents", "Contract approved", "Edit components / Edit visually / Studio" for one page, "Sandbox", "microVMs", "level 2", "disposable sandbox" and raw runtime ids became the plain words the rest of the app uses.
- Token counts in the task's cost card; "Safety checks a month" where it meant rule decisions; "Production" where it meant the live site.
- Six database refusals that fell through to "Something went wrong" now say what happened (steps that run together, autonomy limits, duplicate paths, bad imports, a site Farbaek took offline).
- The iPhone app promised Face ID on every phone; it names what the phone has. It shows why a run ended, lists waiting tasks that have no open change (as the web does), counts only changes this person can decide, shows the checks a change will run, says why no plan was drafted, offers "Open the task" after approving, has Skills in More, and groups tasks as the web does. Home loads the account again when the first load failed.
- The desktop app's approval card no longer dies on a failed answer; Cancel and Discard say why they refused, and Discard asks first.

**Smaller things (low)**

- Twenty-four px and 36 px targets in the skill library, the file tree and the preview's version pills are 44 px on phones. The verify page's paste box doesn't zoom. "Original" links read as text links.
- The pricing metadata derives its prices from the catalog instead of hard-coding "$0.99 to $300". A sentence of 41 words is two.
- The teammate avatar was a middot. The empty states on Projects and Build lead to "Describe what you want to build". The manual "New task" form folds under "Add a task without a plan".
- A flaky test flipped the last base64 character of a sealed token, whose low bits are padding; it flips one in the middle.

## Checked

- `pnpm typecheck`, `pnpm lint`, the full suite, and the desktop renderer's build after each group.
- `pnpm qa:responsive` (550 views, 0 findings after the fix) and `pnpm qa:a11y` (96 views, 0 findings) on the demo build.
- The routes in the table, at 375 px, read and looked at.

## Not checked, and why

- **The iPhone changes** compile on GitHub's runner when this branch is pushed, and are looked at on TestFlight with the next build; there's no Xcode on this computer.
- **The desktop app's changes** ship with its next release.
- **A real approval from the phone against production** is the owner's test after the merge; the arithmetic is what was wrong.
- **The films** still show the old step lines until `pnpm films:record` is run on a machine with room for it.
- **Not done, deliberately:** the project page's four header buttons on a phone (kept: each is a real place), the lane graph's node glyphs (a node needs a mark), the phone's AI usage meter (the next phone release), and the public site's remaining low findings (sentence length on legal pages, a 6 px film label, the showroom's skill pills).
