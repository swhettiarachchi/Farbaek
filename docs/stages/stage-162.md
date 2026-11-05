# Stage 162: What two security audits found

- **Branch:** `feat/security-audit`, from `main`.
- **Decision:** ADR 0175.
- **Migration:** v88, `supabase/migrations/20261229090000_security_audit.sql`. It goes to production before the merge, because the new code reads what it returns.
- **Skills used** (the owner asked for them on every build): `ecc-security-review` for the checklist, `security-review` and `code-review` on the diff, `api-design` for the gateway's refusals, `farbaek-ui` for the words, `chrome-browser` to probe production.

## What was done

**Trustworthy proof**
- A test space is now either someone's own or kept for checking. Only one kept for checking can record a ProofPack or move a task, and nobody can write to it or run commands in it.
- Checks someone runs in their own test space record a receipt marked unverified, and the Test space page says so.
- A cloud run checks what it applied in a fresh test space, not the one the agent worked in.
- Passing checks can't verify a change if a project file was edited after it went in, the rule publishing already uses. Failing checks still count.
- The task page no longer sends people to a by-hand test space to install something first, and a `pyproject.toml` project gets installed in the fresh one.

**A person's own computer**
- Every command there asks, including ones classed read-only.
- An MCP approval shows the whole input, in a box that scrolls.
- `.GIT` is treated as `.git`, in any case.
- A handoff only goes to a computer the person paired. Only known tests and builds run there, others are skipped with a reason, and a task with nothing left to run isn't sent. The card says plainly that the checks run the project's own code.

**The brakes**
- The pause and a suspension refuse every gateway route but saying who it is and unpairing.
- Withholding "Start agent runs" covers pairing and model calls.
- A workflow stops when a step's plan changed after approval.

**Money and access**
- A subscription's metadata only counts if an owner or admin started that checkout.
- Domains need the publish permission and can't be squatted.
- Deleting an account can't erase a workspace under review.
- Removing a member revokes their computers and invitations, and the export stops reading that workspace.
- Suspended workspaces can't be renamed or have members changed.
- The developer API checks the plan that sells it.

**Hostile input and cost**
- Five more secret patterns, including Farbaek's own tokens.
- Zip inflating is counted in full, and shared streams are refused.
- Five trials a day per private email domain.
- Pairing checks one source's limit first.
- The nonce CSP on sign-in pages, report-only.
- `sites` reserved, `/sign-in?error=constructor` fixed, HSTS `includeSubDomains` only on Farbaek's own host.

**Scenarios:** SE-037 to SE-041 are new, so `/security` shows 41.

**Since a handoff can now only come from yourself,** the card's "you sent" is true, so it doesn't need a "who asked" line. The plan had one; this is simpler and says the same thing.

## What was verified

- **Each finding has a test:** `tests/db/security-audit.test.ts` and `tests/db/agent-handoffs.test.ts` for the SQL, unit tests beside the code, and scenarios SE-037 to SE-041.
- **`pnpm check`:** 2,770 tests pass. **`pnpm security:eval`:** 41 scenarios, all passed.
- **Independent review of the diff,** aimed at what the fixes could break. It traced real verification, migration v88 against live data, desktop agents, real checkouts, workflows, domains, headers and the developer API, and found:
  - "Continue on my computer" refused most ordinary projects, because one unusual check refused the whole handoff. Now such a check is skipped and the rest run.
  - Projects that were told to install by hand first had no way left to verify. The page no longer says that, and `pyproject.toml` projects install in the fresh space.
  - The fake-proof attack still worked through the file editor. Passing checks no longer verify after a file was edited.
  - `safeOnAComputer` trusted the classifier the ADR says can't be trusted. `checkForComputer` replaced it.
  - A checkout could be replayed within 48 hours to overwrite a live subscription, and invitations survived account deletion. Both fixed in SQL, with tests.
- **The sign-in policy found something on its first run:** the site layout's inline Android script had no nonce. It's allowed by its hash now, a test keeps the two in step, and the three pages send no reports on a demo build.
- **Audits on the changed screens** at every width: 66 page views with no sideways scroll, cut-off content, small targets or console errors; 12 accessibility page views with no findings.
- **pnpm:** `--frozen-lockfile --ignore-pnpmfile` works on a project with a `.pnpmfile.cjs`, tried on pnpm 12.

**Couldn't be run here:**
- A real payment. The owner's next real checkout is the live test of the subscription rule.
- An agent on a real second computer.

## What's next

- Apply v88 to production before the merge, then merge, then check production read-only: a real task's checks still verify from its page, Test space checks say they don't, and the pause still works.
- Build a new desktop release with the command rule. Existing installs keep the old rule until they update, and the server's refusals reach them straight away.
- Enforce the sign-in CSP once production's reports are clean.
- Left for the owner, with reasons, in ADR 0175: store sandbox purchases, the Public Suffix List, Auth's own limits, phone sign-in links.
