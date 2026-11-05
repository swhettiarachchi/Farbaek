# ADR 0170: Plain words and one next step

- Status: accepted (2026-11-05).
- Amends the wording of ADR 0027 (the plan), ADR 0073 (first steps), ADR 0075 and the app's navigation. Follows the owner's research report of 2026-11-05 on hybrid iOS rules and premium UX, kept outside the repo; what this decision takes from it is stated below.

## Context

The owner asked that every part of Farbaek be understandable by anyone, "regardless of their technical knowledge". A full audit found the mechanics clean (550 responsive page views and 96 accessibility page views with no findings), and comprehension the real gap:

- A flat sidebar of 17 items, including Mesh, Trust graph, Sandbox, Incidents and Policies.
- The task page, where people approve work, put Mode, Lifecycle, Context readiness, the "Intent contract", hashes and "Invariants" before the change and its approve button. On a phone that's several screens of scrolling. "Try it before you approve" sat below the button.
- The same thing had different names on different surfaces: "Your plan" on the plan card and iPhone, "Intent contract" on the task page.

The research found no support for a numeric cap on navigation; products such as Stripe and Notion keep a fixed core of about five and group the rest. It also supports at most two levels of disclosure, and warns that value shouldn't depend on finishing a checklist.

## Decision

**One vocabulary on screen.** Code, routes, API fields, state keys, file formats and the GitHub status name "Farbaek ProofPack" don't change.

| In code and the spec | On screen |
|---|---|
| Intent contract, contract | Plan |
| Proposal, propose | Change, suggest |
| Lifecycle | Progress |
| Invariants, acceptance, resources, forbidden | Must stay true, Done when, What it can change, Not allowed |
| Evidence | Proof. A ProofPack keeps its name and is explained where it appears |
| Recovery | Undo |
| Policy | Rules |
| Hash, digest, fingerprint | Not shown by default |
| Mission Control | Home |
| Governed evaluations | Safety checks, on Billing only |
| Sandbox | Test space |
| Agents | Desktop app |
| Mesh | Move projects. A Capsule keeps its name, as a kind of file |
| Incidents | Problems and pause |
| Activity | History |
| Integrations | Connections |
| Trust graph | Who can do what |

The billing "contract", the legal "policy" and payments "test mode" mean what they say and stay. Status labels in `src/core/realityloop/progress.ts` are plain too, and reach iPhone through the phone API. The iPhone app's own strings change in its own stage, where a Mac runner can build and test them.

`tests/design/plain-words.test.ts` keeps the replaced words off the signed-in app's screens. The public site, the films and the staff console have their own audiences and aren't covered.

**The navigation is a core, a group and the account** (`src/components/app/app-nav.tsx`).
- **Always in view:** Home, Build, Projects, Tasks, Approvals.
- **"More tools":** a labelled group holding the nine tools. It opens on click, remembers its state in this browser, and opens by itself on one of its own pages. While closed, nothing inside can be reached by Tab or a screen reader.
- **Billing and usage, Settings, Help** at the end.
- **"Coming later"** moves to the More page.
- **Phones** keep their five tabs. The More page lists every other page with one line saying what it's for, and now includes the Who can do what page, which phones couldn't reach from a menu before.
- **Search** still finds the old names.
- Every route is unchanged.

**A task's page starts with its next step** (`src/core/realityloop/next-step.ts`, `src/components/tasks/next-step.tsx`).
- `taskNextStep` turns the task's real state into one plain sentence and at most one action. It covers every state exhaustively, and says "done" only of a task that reached VERIFIED or RECOVERED.
- The card that matters right now follows: the checks, undo, the plan or the change.
- Everything else moves into one **Full details** section (`src/components/ui/disclosure.tsx`), built on the browser's `<details>`, so it works without scripts and with find-in-page. It opens by itself when the address points inside it, so links to `#contract` and the like still land.
- In the change card, "Try it before you approve" now comes before the change and its button. The further checks (a second opinion, what it reaches, how far it can be undone, failure trials) fold into "More ways to check this change".
- On a phone, the approve button follows the reader, full width, just above the tab bar. Discard waits at the end of the review, so it can't be pressed by accident while scrolling. A grey button keeps its reason beside it.
- No state rule, permission or write changed: only where each card renders.

**Home** drops the sentence about records, the duplicate "New project" button and the raw hashes, and has three stat tiles. Project names read better: "Make this the landing page for Ledgerline, a bookkeeping service" gives "Landing page for Ledgerline", stopping at the first comma, not "This the landing page for Ledgerline". Existing projects aren't renamed.

## Consequences

- People see what's happening and what to do, without learning Farbaek's vocabulary.
- Nothing is removed: every detail is one tap away, and developers can still read the plan, the proof and the hashes.
- Web and Android share this at once, because Android runs the web app.
- The spec and the code keep their precise terms. So support, docs and code have to translate, and this table is the reference. The marketing site and the recorded films still use some of the older words; they're a later pass.
- Some technical words remain on deep pages where they're the right ones, such as Capsule, once explained.
