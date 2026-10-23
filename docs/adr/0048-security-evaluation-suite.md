# ADR 0048: Security evaluation suite v1

- Status: accepted (2026-10-23).
- Spec: §9 "Security evaluation suite (mapped to current OWASP lists)", and Stage 3 ("the security eval suite v1 mapped to ASI01–ASI10"). Builds on the boundaries recorded in ADR 0004 (policy), 0011 (approval binding), 0013 (sandbox), 0018 (agent), 0040 (run caps), 0043 (skill pins), 0046 and 0047 (autonomy and its checks).

## Context

**Farbaek's boundaries were each unit-tested where they're built:**
- the permission engine;
- the path guard and command broker;
- the sandbox guard;
- approval binding;
- skill pins;
- run caps;
- ProofPack integrity;
- Row Level Security;
- the platform switches;
- autonomy suspension.

**Three things were missing:**
- nothing attacked them the way an attacker would;
- nothing mapped them to the risks people ask about;
- nothing said, per risk, what isn't tested.

**The spec asks for:**
- versioned adversarial scenarios with deterministic assertions;
- coverage reported per OWASP ID, with its limits;
- never implying complete coverage or a certification.

## Decision

### Scenarios that assume the model was fooled

`tests/security-eval/` holds 23 scenarios (SE-001 to SE-023), each one `describe` block.
- **How they test:** each drives the real modules with attack-shaped input:
  - a README full of planted instructions;
  - command output telling the agent to `rm -rf`;
  - path traversal and junctions;
  - shell syntax in a program name;
  - a reused approval hash;
  - a changed project skill;
  - forged evidence;
  - planted secrets in the environment;
  - a padded prompt that would blow a run's cap;
  - an agent that never stops.
- **The model:** where one is involved, it's scripted to obey. The scenarios check that the boundary holds anyway; they never score a model's judgement.
- **The database scenarios** run on Postgres (PGlite) with every migration:
  - workspaces apart;
  - one-time pairing codes and revocation;
  - the AI switch;
  - autonomy pausing itself.

**They run with every `pnpm test`.** Each of three guards (the contract path check, the environment allowlist and the run cap) was removed by hand once, and its scenario failed each time.

### A registry with the limits written down

**`src/core/security-eval/catalog.ts` holds:**
- the 20 OWASP IDs, with their titles and sources;
- each scenario's risks and what it asserts;
- for every risk, what isn't tested, or why it doesn't apply. LLM08 doesn't apply: Farbaek has no retrieval or embeddings.

**Coverage has three states only:** tested (at least one scenario), not tested, or not applicable. There is never "covered" or "complete".

**The registry test** checks that:
- every scenario is exactly one `describe` in its declared file;
- no unregistered IDs exist;
- every risk is tested or explained;
- the registry's wording never claims completeness or certification.

### A report from a real run

**`pnpm security:eval`** runs the scenarios and writes `src/content/security-eval-run.json`:
- when it ran;
- the commit;
- Node's version;
- each scenario's result;
- the suite's fingerprint: SHA-256 over the scenario files and the catalog, with line endings normalised.

**Keeping it current:**
- the registry test fails if the committed report's fingerprint doesn't match the suite;
- so a changed scenario means running it again;
- the report can't be edited to say more than a run did.

### A public page

**`/security`:**
- the latest run (its date, result, test count and commit);
- a map of the 20 risks in two grids:
  - **tested:** a solid border, a check icon, and the number of scenarios;
  - **not tested:** a dashed border and an open circle;
  - **not applicable:** muted, with a minus icon;
- each risk's scenarios with their results, and what isn't tested;
- a plain statement of what the suite is and isn't.

The footer links to it.

## Consequences

- **A regression** in any of these boundaries fails the build's tests, with the OWASP risk it belongs to.
- **People evaluating Farbaek** can see what's tested and what isn't, without a claim of certification.
- **The report is a snapshot.** It's updated by running `pnpm security:eval` before a release, and the test suite refuses one that's out of date.
- **Not done:**
  - LLM01-style model evaluations (whether a model can be manipulated), which need real model calls and cost;
  - the OWASP LLM list's [VERIFY] note in the spec, checked on genai.owasp.org on 2026-10-23;
  - a signed report.
