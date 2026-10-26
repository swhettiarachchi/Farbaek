# ADR 0089: The project graph, from real records

- Status: accepted (2026-10-26).
- Spec Stage 8 "graph analytics"; §25 Real-Project Loom: "a project's actual intent-to-proof graph … built only from real data, with a full 2D accessible equivalent", where 3D waits until the 2D view proves useful.

## Context

A project's story is spread over task pages, ProofPack pages, the Launch timeline and Incidents. Nobody can see at a glance:
- which asks became verified changes that went live;
- where work stalls;
- which files keep failing their checks.

## Decision

**A Project graph page** (`/app/projects/:id/graph`), linked from the project page.

**One lane per task, newest first, through five stages:**
- **Intent:** the ask.
- **Contract:** the newest version, approved or a draft.
- **Change:** the newest applied proposal, or else the newest attempt. Applied by a person or on its own, waiting, blocked or discarded, with the files it wrote and the number of attempts.
- **Proof:** the task's newest ProofPack: verified, partly verified, failed, or not checked yet.
- **Live:** the site versions and Vercel launches whose evidence ProofPack is one of this task's.

Each node links to the record it came from. Where a task has no proposal or ProofPack record, its own current state is the record read (for example `VERIFYING` shows "Checks running"); nothing else is inferred. Incidents linked to a lane's proposals appear on it.

**Versions published without verified evidence** are listed separately, each with the reason an owner or admin gave.

**What it adds up to,** computed from the same records:
- the median time from ask to verified, and the median wait for a person's approval;
- how many applied changes passed their checks;
- how many versions went out with verified evidence;
- the policy's outcomes, and how checks ended;
- rework: tasks that needed more than one proposal;
- the most-changed files, with how many of those changes ended in failed checks;
- linked incidents.

Every figure says when there's nothing to measure yet, instead of showing a zero that reads as a result.

**Read as the person.** Row Level Security and the workspace filter apply to every query. The graph reads:
- the 60 newest tasks;
- proposals without their file contents;
- file paths only from revisions that applied changes wrote.

No migration was needed.

**Design.**
- From md up, the stages line up in columns under one header that sticks while scrolling.
- On phones each lane is a vertical path.
- Connectors are decorative: solid where the work got there, dashed where it hasn't. They draw in once, and not at all under reduced motion. Every node carries an icon and words.
- Counts are labelled single-hue bars with the number printed (the dataviz method).

**Plans:** every plan. It only reads the workspace's own records.

## Consequences

- The graph is as complete as the records: changes made before ProofPacks or evidence were recorded show less.
- A 3D view (Real-Project Loom) stays off until the 2D graph shows it's useful.
- A workspace-wide view across projects isn't built yet.
