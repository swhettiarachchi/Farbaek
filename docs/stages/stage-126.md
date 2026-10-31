# Stage 126: Tools from MCP servers in Farbaek Agent

People can add MCP servers to Farbaek Agent on their computer. In Controlled Development runs, the agent can call their tools. Every call waits for the person's approval, and owners and admins review the tools in Farbaek before the agent's first use of them.

- **Decision record:** `docs/adr/0148-mcp-servers-in-the-agent.md`.
- **Branch:** `feat/agent-mcp` (from `feat/qa-sweep`).
- **Migration:** none. The model gateway's tool pinning (ADR 0133, migration v81) already holds unknown tools for review.

## 2026-10-31

### Done

- **`src/agent-runtime/mcp/`:**
  - `names.ts`: `mcp__<server>__<tool>`;
  - `client.ts`: Farbaek's minimal MCP client, with tools and results checked and bounded, and server requests refused;
  - `stdio.ts`: the server as a child process, started like the agent's commands;
  - `external.ts`: a run's servers as one set of tools, with the ones left out named.
- **`src/agent-runtime/loop.ts`:**
  - MCP tools are offered in Controlled Development only, with a line in the system prompt;
  - every call needs an approval bound to the exact input;
  - output goes back as data.
- **Desktop:**
  - the run manager starts the servers for Controlled Development runs, notes what was offered or left out, and closes them when the run ends;
  - the `mcp:check` and `mcp:set` handlers;
  - the Settings card **Tools from MCP servers**;
  - fields keep the code face for addresses, programs and arguments.
- **The Agents page:** says where an added `mcp__` tool comes from.

### Verified

- `src/agent-runtime/mcp/mcp.test.ts` (9):
  - names and server settings;
  - the client's handshake, tool list, call, refused server requests, timeouts and bounded results;
  - a run's servers;
  - a real MCP server over stdio, which gets no environment variables beyond a developer tool's.
- `src/agent-runtime/loop.test.ts` (2 new):
  - never offered in Review Only;
  - in Controlled Development, an approval for every call, bound to its input; declined and mismatched calls aren't made; output returned as data.
- `desktop/src/main/runs.test.ts` (1 new): servers start only for Controlled Development, outside the copy; the call waits for approval; the servers close after the run.
- `src/components/agents/tool-pin.test.ts` (1, new).
- **In the real desktop app**, with a scratch data folder and a sample MCP server: **Check and add** started it, listed its two usable tools, named the one left out, and saved it. **Check its tools** showed the same after a restart.
- `pnpm typecheck`, lint and full `pnpm test`.

### Not verified

- **A run calling an MCP tool against production:** it needs a paired agent and an owner or admin to approve the new tools on the Agents page.

### Next

- A desktop release with this, picking an element in a running app.
