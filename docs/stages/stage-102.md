# Stage 102: A workspace's own model key

The spec audit found no way for a workspace to use its own AI account or a company gateway (spec §14). This stage adds both, for Anthropic.

- **Decision record:** `docs/adr/0125-own-model-keys.md`.
- **Branch:** `feat/own-keys` (from `feat/more-templates`, PR #130).
- **Migration:** v76, `supabase/migrations/20261217090000_workspace_model_keys.sql`.

## 2026-10-30

### Done

- **`src/server/ai/workspace-ai.ts`:**
  - gateway rules and public-address checks;
  - the key check with a free models call;
  - seal and open;
  - `aiForWorkspace` (client and metering from one answer, failing closed);
  - `ownKeyMetering` and the usage log;
  - the member-safe reader.
- **Settings, Your own AI key:**
  - status for everyone;
  - **Check and save**, **Check and replace** and **Remove key** for owners and admins.
- **Wired into:**
  - contract drafting (task and New project);
  - change proposals;
  - AI mapping;
  - rule drafting;
  - the agent's model gateway (desktop app and cloud runs).
- **Elsewhere:**
  - the Cost Brain shows own-key calls as not counted;
  - Activity names key changes;
  - Integrations shows the key;
  - the Privacy Policy says where own-key requests go.

### Verified

- `src/server/ai/workspace-ai.test.ts` (11), all with fakes:
  - gateway rules, including private, loopback, link-local and metadata addresses;
  - resolved-address checks;
  - key checks that never repeat the key;
  - metering that never touches the allowance and logs real tokens;
  - a sealed key opens only for its workspace;
  - fail closed for a bad gateway.
- `tests/db/model-keys.test.ts` (6):
  - owners set and replace it, audited without the key;
  - members, viewers and outsiders are refused;
  - table checks on the gateway, hint and sealed format;
  - remove and not found;
  - usage logging only while a key is set;
  - members read the hint but never the sealed value, and only the server writes.
- `pnpm typecheck`, `pnpm lint`.

### Not verified

- A real Anthropic key in production: that's the owner's to add.
