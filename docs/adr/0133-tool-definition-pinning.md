# ADR 0133: Tool Definition Pinning

- Status: accepted (2026-10-30).
- From master spec §25: "Problem: MCP tool poisoning and agentic supply-chain risk (ASI04). Solution: hash-pin tool descriptions and manifests; any change quarantines the tool until it is reviewed, with a diff of the description. Acceptance: a changed description blocks tool calls until re-approval."

## Decision

**Tools are pinned one by one.** A paired agent sends its tools (name, description, input schema) to Farbaek's model gateway with every AI step.
- The server hashes each tool separately (RFC 8785 canonical JSON and SHA-256).
- It checks the set against the agent's pin in one locked call (`app_check_agent_tools`, migration v81).
- Tools are pinned one by one because the desktop agent offers a different subset of its tools depending on the run's mode, and a whole-set pin would quarantine it every time it switched.

**The outcomes:**
- **First use:** the tools become the pin, recorded as `agent.tools_pinned`. This is trust on first use, so a new agent isn't blocked waiting for review.
- **A run offers one of Farbaek's own tools this agent hasn't used yet:** it joins the pin, and that's recorded.
- **Every tool matches its pin:** the step goes on.
- **A tool's description or schema changed, or a tool name isn't one of Farbaek's:**
  - the agent is quarantined: the pin with the new tools laid over it is kept for review, recorded as `agent.tools_quarantined`, and the step is refused with `TOOLS_CHANGED` (423) before any usage is reserved or the model is called;
  - every later step is refused too, until someone reviews the change.

**Review on the Agents page:**
- **The diff:** each agent shows its pinned tools, or, when quarantined, exactly what changed: tools added, tools removed, and each changed description before and after, plus a note when inputs changed.
- **Approve these tools:** owners and admins approve what they reviewed (`app_approve_agent_tools`), bound to an identifier the database computes from the waiting tools. Tools that changed again after the page loaded are refused. The approved tools become the pin, recorded as `agent.tools_approved`.
- **The alternative** is revoking the agent.

**Fail closed:** if the pin can't be checked, the step is treated as changed.

**Scope:** Farbaek's own cloud runs (`run:…`) bring Farbaek's own tools, defined in its code, and aren't pinned.

## Consequences

- A tampered or unexpectedly updated agent can't quietly change what the model is told a tool does. The change waits for a person, who sees the exact text.
- A legitimate desktop app update that changes tool text needs one approval per agent.

## Not done

- **Third-party MCP tools:** Farbaek's agents don't load any yet. When they do, they're pinned the same way.
