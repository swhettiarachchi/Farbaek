# ADR 0146: Tools and rules in the trust graph

- Status: accepted (2026-10-31).
- Follows ADR 0132 (the trust graph), which left "tools, policies, tasks, incidents and deployments as nodes" for later, and ADR 0133 (Tool Definition Pinning). The spec asks for a graph linking "agents, tools, integrations, capabilities, policies, resources".

## Decision

**Tools, from each agent's pin.**
- A tool is a node when an active paired agent has it pinned (ADR 0133). Its detail says how many agents pin it, and whether one of them is waiting for review.
- An edge from the agent to the tool reads "may call", with the source "Its tool pin".
- When the agent is quarantined because its tools changed, every one of its tool edges is **limited**: dashed, with a warning icon and the words "its tools changed: refused until reviewed". This is what the gateway does: it refuses every step until an owner or admin approves the change.
- Revoked and expired agents' pins reach nothing, like their leases.
- Farbaek's own cloud runs bring Farbaek's tools and aren't pinned, so they aren't shown as tool edges.

**Rules, from the workspace's active rules.**
- Each rule in the active version (ADR 0082) is a node: its path patterns, then its effect and the reason the person wrote.
- Rules are workspace-wide and match files in any project, so each one has an edge to every active project. The edge reads like the policy itself, for example "a change to src/payments/** is stopped, and no one can approve it", with the source "Workspace rules, version N".
- Rules don't change who can change a project. They change what a change there needs. So "Who and what can change a project?" is answered as before, and the rules on its changes are listed under it.

**The map** gets a Tools column, between agents and projects, and a "Rules and services" column. Columns with nothing in them are left out, so a workspace without pins or rules keeps the four columns it had.

**Read as the person.** Pins come from `agent_tool_pins` and rules from `workspace_rule_versions`, both readable by members under row security. Anything that can't be read is named on the page and left out. No migration.

## Not done

- Whether a rule matches files that exist in a given project: every active project is shown as governed.
- Tasks, incidents and deployments as nodes.
- MCP servers as a third-party tool source.
