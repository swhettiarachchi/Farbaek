# Stage 128: Security reviews on the workspace's own key

A security check's AI review now uses the workspace's own Anthropic key, or its company gateway, when an owner or admin has set one (ADR 0125). It's metered there, not against the plan's AI usage, like contract drafting and agent runs. The spec audit's stale entries are corrected too.

- **Branch:** `feat/own-key-reviews` (from `feat/pick-running-app`).
- **Migration:** none. `model_key_usage` accepts any operation name.

## 2026-10-31

### Done

- **`src/server/security/wiring.ts`:** the reviewer comes from `aiForWorkspace`, as failure trials and cloud runs do:
  - the workspace's key and its own-key metering when one is set;
  - otherwise Farbaek's.
  
  A key that can't be opened stops only the AI review, with ADR 0125's message. Farbaek's key is never used in its place. The package audit, Semgrep and the secret scan still run.
- **Settings, "Your own AI key":** it now lists security reviews, failure trials and notes among what uses the key, and names what still doesn't: the second check and image generation.
- **ADR 0125's table**, updated.
- **The spec audit:**
  - Activity and Integrations are built;
  - cloud runs already use the workspace's own key;
  - what still uses Farbaek's providers.

### Verified

- `pnpm typecheck`, lint, and the security, AI and settings tests.

### Not verified

- **A review on a real own key:** it needs a workspace with one set.
