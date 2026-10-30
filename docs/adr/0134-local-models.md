# ADR 0134: Local models on the desktop agent

- Status: accepted (2026-10-30).
- From master spec §6: "Model access needs a supported credential, gateway or local model, and its cost must be disclosed." And: "Build a ModelProvider adapter that covers hosted APIs, organization gateways and local models."

## Decision

**Where it runs.** The Farbaek Agent desktop app can run a task on a model the person hosts on the same computer. It uses the OpenAI-compatible chat API that Ollama, LM Studio and llama.cpp's server all offer. The adapter is `src/agent-runtime/models/local.ts`, and it gives the agent loop a `ToolModel` like the gateway model does.

**Only this computer.**
- The address must be `http` or `https` on `127.0.0.1`, `localhost` or `[::1]`, with no credentials, query or fragment.
- It's checked when it's set in the main process, when a run starts, and again in the adapter.
- So the project's files, which the agent sends to the model as tool results, don't leave the computer for a model call. A LAN or remote address is refused with the reason.

**Setting it up.** In Settings, under "A model on this computer":
1. The person enters the address. Ollama's is the default.
2. They pick **Find models**, which reads the server's model list.
3. They pick **Use <model>**.

Before the model is saved, the app checks that the server offers it. The choice is saved in the app's own settings file, never in Farbaek.

**Choosing per run.** When a local model is set, the run form offers "Farbaek" or "On this computer". The default stays Farbaek.

**What doesn't change:**
- **The workspace.** The run works on a copy of the project.
- **Tools.** It uses the same tool registry, which checks every tool call's input, including the unreadable arguments a weaker model can produce.
- **Commands.** It uses the same command broker.
- **Proposals.** The finished change goes to Farbaek as a proposal, with the same contract checks, policy and review. The proposal records the model as `local:<name>`, and the review shows "A model on the agent's computer" beside it.

**Not metered.**
- Local steps never reach Farbaek's model gateway, so nothing is reserved or counted, and the run form says so.
- The token counts the local server reports are still recorded on the proposal, as they are for any run.
- Tool Definition Pinning (ADR 0133) guards the gateway. A local run doesn't pass through it: its tools are the app's own code on the same computer.

**Honest about quality.** The run form says that results depend on the model. A model that can't call tools well fails the run with the reason. It never fails with a made-up result.

## Consequences

- A person can use the agent with no AI usage left, offline from AI services, or under a policy that keeps code on the machine.
- Farbaek can't see or vouch for what a local model is. Review and policy are the safeguard, as they are for every proposal.

## Not done

- **Cloud runs:** they keep Farbaek's model. A local model would mean the sandbox calling into the person's computer.
- **Streaming of local steps:** steps arrive whole, with a 10-minute limit per step.
