# ADR 0131: Operating modes (Learn, Pair, Build, Audit)

- Status: accepted (2026-10-30).
- From master spec §10 "Operating modes": Learn explains concepts, decisions and trade-offs; Pair collaborates through incremental, reviewable changes; Build implements approved contracts within their constraints; Audit inspects and reports with no project modifications. "Store preferences as explicit, reviewable settings."

## Decision

**Every task has a mode** (`tasks.mode`, migration v80). It's Build by default, which is how every task worked before.
- **Where it's set:** contributors change it on the task page, with one line saying what each mode means.
- **When:** never while a change waits for review.
- **Record:** each change is audited as `task.mode_changed`, from and to.

**The database enforces each mode**, with triggers on the rows that record changes and runs, whichever function writes them:

| Mode | Changes | Agent runs | Applying |
| --- | --- | --- | --- |
| Learn | Refused (`MODE_NO_CHANGES`) | Refused | None |
| Pair | At most 3 files (`PAIR_TOO_LARGE`) | Allowed | A person applies each step; never applied on its own by autonomy (`PAIR_NEEDS_PERSON`) |
| Build | As before | As before | As before |
| Audit | Refused | Refused | None |

**Pair on the AI side:**
- the change proposer is asked for "the smallest reviewable next step, changing at most 3 files";
- if it proposes more, the first 3 are kept and the rest are named as left for a later step (`pair_step`), never dropped silently.

**Learn and Audit get notes instead of changes:**
- **Write an explanation** (Learn) or **Write an audit report** (Audit) asks Claude, through structured output, for a summary, up to 12 points and what it couldn't see.
- **What's sent:** the task, its approved contract when there is one, and up to 8 of the files in the contract's path scope, 60,000 characters in all. Files left out are named.
- **The answer is untrusted:** it's validated, and a point about a file that wasn't sent loses its path.
- **Kept:** in `task_notes`, shown labelled AI-written with the model.
- **Metered** as `task_note`, through a workspace's own key when it has one (ADR 0125); refunded if it fails or is refused.

## Consequences

- People can use Farbaek to understand or inspect a project with a guarantee, enforced on the server, that nothing changes.
- A Pair task moves in small steps a person reviews one by one, even when the workspace's autonomy would let changes apply on their own.

## Not done

- **Choosing the mode on the New task form.** It's set on the task page.
- **A workspace-wide default mode.**
