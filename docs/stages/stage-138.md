# Stage 138: Fewer AI provider names in Farbaek's copy

- **Branch:** `feat/quiet-model-names`.
- **Migration:** none.
- **ADR:** none.

## 2026-11-03

### Asked

The owner saw "Claude or Gemini drafts an intent contract" on the homepage, asked whether Farbaek also uses OpenAI, and asked not to name the AI providers everywhere.

### Checked

- **OpenAI:** used only for the optional second check on a change (ADR 0121), and only when the server has an OpenAI key. Without one, the second check uses a different Claude model. `docs/architecture/current-state.md` records no real OpenAI call yet.
- **Where providers were named:** 20 places in the site and app copy, plus three server messages people can see. No mentions in the iPhone app's text or the store listings.

### Done

- **Rewritten without a provider name:**
  - the homepage's status list ("Farbaek drafts an intent contract you approve by hash");
  - the showroom (plans, skills in "the open SKILL.md format", image generation);
  - Pricing's "agent session" answer;
  - the image tool on a project's files, the failure trials card, the project skills intro and the plan editor ("Farbaek reads the task…");
  - the agents page now says each model step goes "to our AI provider (named in the Privacy Policy)".
- **Messages when a feature is off** no longer name a provider: "Cloud runs aren't available on this server yet.", "The second check isn't available on this server yet.", "Image generation isn't connected on this server yet.", and "… isn't available with this server's AI setup."
- **Kept on purpose:**
  - the Privacy Policy, Terms and Acceptable Use Policy, which must name every provider that handles personal data;
  - the "use your own Anthropic key" setting, which has to say which key to paste;
  - the model IDs shown beside a run, a drafted plan or a proposal: they're the record of which model made each change, as in a ProofPack;
  - Office Space, for staff.

### Verified

- `pnpm typecheck`; ESLint on the 14 changed files.
- `vitest` on `src/server/ai`, `src/server/workspace`, `src/components`, `src/content` and `tests/design`: 64 files and 469 tests.
- A search of `src/app`, `src/components`, `src/content` and `src/config`, outside the legal pages and Office Space, finds provider names only in the own-key setting.
