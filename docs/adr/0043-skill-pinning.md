# ADR 0043: Skill pinning

- Status: accepted (2026-10-23).
- Spec: §25, the innovation backlog's Next item "Tool Definition Pinning". It answers tool poisoning and agentic supply-chain risk (OWASP ASI04).

## Context

The spec asks for three things:
- tool descriptions and manifests pinned by hash;
- any change quarantining the tool until it's reviewed, with a diff;
- acceptance: a changed description blocks use until re-approval.

**Farbaek's agent tools are fixed in code**: their names, schemas and descriptions ship with each release. So are Farbaek's built-in skills.

**The outside text that does reach the agent's instructions is a project's own skills.** Any `.farbaek/skills/<name>/SKILL.md` or `.claude/skills/<name>/SKILL.md` in the project's files counts (ADR 0030). Until now, every cloud run loaded them as they stood. They can arrive through:
- a rescue `.zip`;
- a Capsule;
- a teammate's edit;
- an agent change someone approved for other reasons.

A planted or quietly changed skill would steer every later build. The desktop agent doesn't load project skills.

## Decision

### A skill applies only in its approved version

`project_skill_pins` (migration v28) records, for each skill path, the file revision and SHA-256 a person approved, with who and when.

**What runs use.** `splitByPins` (`src/core/agent/skill-pins.ts`) compares each skill file's stored hash with its pin:
- **approved:** the bytes are exactly the pinned version. Runs use it.
- **changed:** pinned at another hash. Held back.
- **new:** never pinned. Held back.

**What a run does with held skills.** It leaves them out of the agent's instructions and says so in its steps: "Left out until someone reviews it on the project page: house-style (changed since it was approved)". The plan card names them too, with a link to review them.

Files are still copied into the run's working folder as data. Only the instructions are gated.

### Review with a diff, then approve exactly that

On the project page, each skill shows its state with an icon and words. A held skill opens a read-only diff:
- for a changed skill, its approved version against the current one;
- for a new skill, the whole text.

**Approving.** "Approve this version" sends the revision and hash that were shown. `app_pin_skill` approves them only if the file is still exactly that version; otherwise it refuses with `FILE_CHANGED`. That covers a skill that changed again during the review.

**The rules around approval:**
- **Who:** contributors only, on projects that aren't archived.
- **The audit trail:** each approval and withdrawal writes an audit event.
- **Skills written in Farbaek:** a skill added with the form is approved as written, because the person just wrote it.
- **Removed skills:** removing a skill withdraws its approval, so a later file at the same path is reviewed afresh.

### Existing skills

Skills already in projects were in use before this. The migration pins each one once, at its current revision, with no person named ("in use before approvals began"). Builds behave the same today; only later changes need a review.

## Consequences

- **A skill that arrives in an import or a Capsule** does nothing until someone reads it and approves it.
- **An agent change to a skill file** needs two approvals: the change itself, then the skill's new version.
- **Not covered yet:** a description in an MCP manifest. Farbaek doesn't connect agents to MCP servers yet; when it does, they get the same pin and review.
