# ADR 0123: The Why-Graph for a file

- Status: accepted (2026-10-30).
- Implements master spec §10, "Architecture Why-Graph": "Connect confirmed facts from ADRs, docs, commits, issues, PRs, API contracts, migrations, tests and incidents. Cite sources, mark inferences as inferred, and let users correct stale knowledge. Never invent historical reasoning." The spec audit of 2026-10-30 found it missing.

## Decision

**Where:** a file's **History** on the Files page now opens with **Why this file is like this**, above its revisions.

**Facts, each with its source:**

| Fact | Source |
| --- | --- |
| How the file began: imported, or created in Farbaek | its first revision |
| Each applied change that wrote it: the task, the approved contract's outcome, the reason the change gave for this file, and who wrote it (a model or an agent) | the task, linked; when applied |
| Each doc that names it, with the line | the doc and line, linked |
| Each test that reaches it through imports | the test file, linked |

**Confirmed or inferred:**
- A doc line naming the file's path is confirmed.
- A line naming only its file name is shown as **inferred**, in a dashed box. That only counts for names of 6 characters or more, and not `index.ts` or `index.js`.

**Nothing invented:**
- Saved edits that no applied change accounts for are counted ("2 saved edits have no recorded reason") and never explained.
- The card says Farbaek can't see commits, issues or discussions outside it.
- If the project is over 3 MB of text, it says docs and tests weren't checked.

**Data:**
- Applied proposals containing the path (`listFileChanges`, a jsonb containment query), task titles and contract outcomes.
- The project's text for docs and tests, with tests found by the impact analysis (ADR 0085).
- All read through the person's session. No migration.

## Not done

- **Letting people correct stale knowledge:** a pinned note on a fact.
- **Commits, issues and PRs:** Farbaek doesn't connect to GitHub beyond import (planned with the GitHub pull request workflow).
- **Incidents linked to a file.**
- **A project-wide graph across files:** the project graph (ADR 0089) covers tasks.
