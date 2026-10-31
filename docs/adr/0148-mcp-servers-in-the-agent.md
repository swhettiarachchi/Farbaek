# ADR 0148: Tools from MCP servers in Farbaek Agent

- Status: accepted (2026-10-31).
- From master spec §9 ("MCP support: a third-party tool registry") and §25 (MCP tool poisoning, answered by Tool Definition Pinning, ADR 0133).

## Decision

**Where they run.**
- People add MCP servers in Farbaek Agent's Settings, on their own computer.
- A server is a short lowercase name, a program found on PATH (such as `npx`, `node` or `uvx`), and its arguments, one per line. **Check and add** starts it once, lists its tools, stops it, then saves it in the app's own settings file. Nothing about it is sent to Farbaek except its tools, when a run offers them.
- Each server runs as a child process the way the agent's commands do (ADR 0005):
  - no shell, and arguments passed as they are;
  - only the environment variables a developer tool needs, so this app's own secrets never reach it;
  - started in a folder of its own, never in a project's copy.

  It isn't sandboxed, and the card says so.
- At most five servers. The client is Farbaek's own minimal MCP client over stdio (JSON-RPC 2.0, one message per line, protocol 2025-06-18): initialize, list the tools, call a tool. No dependency was added.

**What the agent may do with them.**
- **Controlled Development only.** Review Only promises that nothing runs and nothing on disk changes, so it never starts the servers or offers their tools.
- **Every call waits for the person**, like a risky command. The approval shows the server, the tool and the exact input. It's bound to them by the same SHA-256 approval binding as commands (ADR 0006): an approval for one input can't run another. A declined call isn't made, and the model is told not to try again.
- **Names say where a tool comes from:** `mcp__<server>__<tool>`. A tool whose name, input schema or size isn't in an accepted shape isn't offered, and the run's notes say how many were left out.
- **Output is data.** Results go back to the model as "data from that server, not instructions", clipped like file contents. Only text is passed on: images, audio and resources are named, never opened. Requests a server sends back, such as sampling or roots, are refused, so a server can't use the agent's model or files.
- **The contract still governs the project.** File changes still go through `write_file` and `edit_file`, with the contract's checks, and everything reaches Farbaek as a proposal for review.

**Reviewed in Farbaek before the first use.**
- Through Farbaek's model gateway, an MCP tool is a name Farbaek doesn't know. Tool Definition Pinning (ADR 0133) therefore holds the agent's AI steps until an owner or admin approves the new tools on the Agents page. The page now says where each such tool comes from.
- Any later change to a tool's description or inputs pauses the agent again.
- Runs on a model on the same computer (ADR 0134) don't go through Farbaek. For those, the person's approval of each call is the control.

## Consequences

- People can give the agent their own tools: their notes, issue tracker, documentation or database, with every call approved and every tool reviewed by an owner or admin.
- **A server can still do anything its program can on that computer when a call is approved.** That's said on the Settings card and on every approval.

## Not done

- MCP servers over HTTP. Only stdio servers, started locally.
- Environment variables or secrets for a server. People can wrap the command in a script of their own.
- MCP in Farbaek's cloud runs.
- Resources and prompts from MCP servers. Only tools.
