# Stage 32: Checks start when a person applies a change

In production, every change the owner applied waited in "Verifying" for a second press. Three were still waiting days later.

- **Decision record:** `docs/adr/0059-checks-start-on-apply.md`.
- **Branch:** `feat/checks-on-apply`, from `main` after #39.

## 2026-10-24

### Done

- **`applyProposalAction`** starts the task's verification after a successful apply, as autonomy already did for a change applied on its own. If it can't start, the reason is logged and the task page offers the button.
- **`applyProposal`** returns the task's id.
- **The review** tells the person, before they press, that the checks start once the change is applied. It only says so when the server can run checks and the change has something to check (the plan's checks, the site check or the app's own).
- **The task page** loads the project's files for a change awaiting approval too, to work that out.

### Verified

- `pnpm typecheck` and `pnpm lint` are clean.
- The proposal tests pass, including the task id in the apply result.

### Not verified

- **A live apply-then-check run in production.** The owner's next applied change is the first one.

### Next

- Notify people when a build finishes or its checks end, by email. This needs an email sender in the app and the SMTP password, which only the owner can type.
