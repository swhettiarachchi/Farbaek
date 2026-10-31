# ADR 0145: Past incidents in the Failure Futures Lab

- Status: accepted (2026-10-31).
- Follows ADR 0135 (the Failure Futures Lab, from the lines a change adds) and ADR 0083 (incidents and the Incident Replay Theatre). The spec audit noted "incidents aren't a source yet".

## Decision

**What counts.** For a change waiting for review, Farbaek reads the project's eight most recent incidents. An incident counts when both of these hold:
- **It involved a file this change edits.** The incident is linked to changes the same way the theatre links them: its own change when it names one, otherwise the changes applied in its project in the 24 hours before it opened. Only source files count, never tests.
- **Its own words name a failure Farbaek can simulate.** The words are the incident's title and the outcome written when it was resolved. Fixed patterns map them to the lab's fourteen kinds, such as "timed out" or "charged twice". Vague words like "site down" name nothing, and nothing is guessed from them.

**What it changes.**
- A scenario the lines already suggested is marked with the incident.
- A scenario they didn't suggest is added. Its evidence is the change's first added line in each of those files, at most three.
- Incident scenarios come first, then the rest in the spec's order, at most six in all.

**On the page.** Each one says which incident, with a link, and how it's linked:
- "This happened before" when the incident names its change;
- "Seen before … opened within a day of a change" when it's only linked by time.

**What it doesn't change.**
- **The trial is the same.** The test writer gets the standard scenario, never the incident's text, so a person's words never reach the model's prompt.
- **The record is the same.** The trial row is the same as any other (migration v82): the kind and the evidence lines. Nothing is stored about the incident, since the link is worked out again when the page loads.
- **No migration.** It reads incidents, the project's applied changes and their file paths through the tables members can already read. The trial runner reads them with the server's key, so a scenario only an incident suggests can be started.

## Consequences

- A change to a file that already failed in a known way is rehearsed against that failure first.
- **Matching words is crude.** It misses incidents described in other words, and could match a word used differently. Every scenario is still hypothetical until a person tries it, and the page names the incident, so the reason is visible.

## Not done

- **Reading incident notes** as well as the title and outcome.
- **Suggesting a kind with a model.**
- **Incidents from another project.**
