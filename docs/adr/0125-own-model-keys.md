# ADR 0125: A workspace's own model key and company gateway

- Status: accepted (2026-10-30).
- From master spec §14 ("AI provider and privacy") and §10 ("Route among configured providers only within explicit privacy, capability, budget and security rules. Never silently switch providers if that would move source code to a new service"). The spec audit of 2026-10-30 found "organization gateways and local models" missing.

## Decision

**An owner or admin can give the workspace its own Anthropic API key**, and optionally a company gateway: an Anthropic-compatible https address. Settings has a **Your own AI key** section. Everyone can see whether a key is set and which one (its last four characters); only owners and admins can change it.

**Saving a key (server-only, `src/app/app/settings/model-key-actions.ts`):**
- The key is printable ASCII, 20 to 300 characters.
- A gateway must:
  - be https, with no user name, password, port, query or fragment;
  - use a public name, not an IP literal, `localhost`, or a `.local`, `.internal`, `.lan`, `.home` or `.corp` name;
  - have every address it resolves to public, so no private, loopback, link-local or shared range.
- The key is checked with a free call to list models, on Anthropic or through the gateway.
- It's sealed with the provider-token vault (AES-256-GCM, ADR 0078), bound to the workspace, so a sealed key copied to another workspace's row doesn't open.
- It's stored through `app_set_model_key`. Messages never repeat the key.

**Storage (migration v76):**
- `workspace_model_keys` holds the sealed key, a 4 to 6 character hint, the gateway, who set it and when, and when it was last used. Members read everything but the sealed value; the browser never gets it.
- `app_set_model_key` and `app_remove_model_key` are for owners and admins only, each audited without the key.
- `model_key_usage` logs each own-key call's real tokens through `app_record_model_key_usage`.

**Using it (`aiForWorkspace`, `src/server/ai/workspace-ai.ts`):** one call returns the Claude client and the metering together, so a call can't use the workspace's key while being metered against Farbaek's allowance, or the reverse.

| Uses the workspace's key | Still uses Farbaek's |
| --- | --- |
| Contract drafting, from a task and from New project | The second check (ADR 0121) |
| Change proposals | Image generation |
| AI mapping in the Intent Lens | |
| Drafting workspace rules | |
| The agent's model gateway: the desktop app and cloud runs | |
| Notes in Learn and Audit modes, and failure trials | |
| Security reviews (since 2026-10-31, stage 128) | |

**Metering on an own key** (`ownKeyMetering`):
- A reservation never touches Farbaek's allowance.
- When it settles, its real token counts go to `model_key_usage`.
- The Cost Brain shows those calls with their tokens, marked "on your own key, not counted".

**Fail closed:**
- A key that can't be opened (the vault key changed), or a gateway that no longer passes the address rules, stops those AI calls with a clear message to set the key again.
- Farbaek never quietly sends the workspace's code through its own key instead.

**Privacy:** the Privacy Policy says own-key requests go to Anthropic or the company gateway under that account's terms.

## Consequences

- Teams can use their own Anthropic account and terms, or route through their own gateway, and stop spending their plan's AI usage on those calls.
- Model choice still follows the plan's routing.

## Not done

- **Local models on the person's computer**, through the desktop app.
- **Keys for OpenAI or Gemini.**
- **A gateway with its own authentication scheme beyond the Anthropic key header.**
- **DNS rebinding:** the gateway's addresses are checked when it's saved and again before each use, but the HTTP client resolves the name itself; a name that switches to a private address between those moments isn't caught.
