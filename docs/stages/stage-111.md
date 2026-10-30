# Stage 111: Local models on the desktop agent

The Farbaek Agent desktop app can run a task on a model hosted on the same computer (Ollama, LM Studio, llama.cpp's server). Only addresses on that computer are accepted. Local runs aren't metered, and the result still goes to Farbaek for the same review.

- **Decision record:** `docs/adr/0134-local-models.md`.
- **Branch:** `feat/local-models` (from `feat/tool-pins`).
- **Migration:** none.

## 2026-10-30

### Done

- **`src/agent-runtime/models/local.ts`:** a `ToolModel` over the OpenAI-compatible chat API.
  - It checks that the address is on this computer only.
  - Tool calls and results stay in order.
  - Unreadable arguments are passed on for the registry to refuse.
  - Errors say what to do (start the server, `ollama pull`).
  - It also lists the server's models.
- **The desktop main process:**
  - the setting, validated on load and on save, with the model checked against the server's list;
  - `runs:start` takes `model: "farbaek" | "local"`;
  - local model errors reach the window with their reason.
- **The run manager:** uses the local model when the run asks for it; the `localFetch` hook is for tests.
- **The window:**
  - Settings has "A model on this computer" (address, **Find models**, **Use**, **Stop using it**);
  - the run form offers Farbaek or this computer once one is set, and says what each costs.
- **Proposal review:** "A model on the agent's computer" beside a `local:` model.
- `ModelProvider` adds `local`.

### Verified

- `src/agent-runtime/models/local.test.ts` (4):
  - only loopback addresses;
  - tool calls and results in order;
  - unreadable arguments;
  - network and missing-model errors;
  - the model list.
- `desktop/src/main/runs.test.ts` (1 new): a run on a fake local server completes without the gateway, asks only the local address, and submits with model `local:qwen3-coder:30b`.
- **In the built app** (Electron over DevTools, scratch data folder, a labelled fake local server on 127.0.0.1):
  - Find models lists the server's models;
  - Use saves the choice, and it survives a restart;
  - a remote address is refused with its reason.
- `pnpm typecheck`, lint, full `pnpm test`.

### Not verified

- **A real local model:** the dev PC has 3.8 GB of RAM, too little for a useful coding model.
- **The run form's model choice in the app:** it only shows on a task, and a task needs a paired Farbaek workspace.
