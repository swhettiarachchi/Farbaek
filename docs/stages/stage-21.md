# Stage 21: Security evaluation suite v1

The spec's Stage 3 asked for a security evaluation suite mapped to the OWASP lists for agentic and LLM applications. Farbaek's boundaries were unit-tested one by one; now they're also attacked as an attacker would, mapped to the 20 OWASP risks. What isn't tested is written down per risk, and the latest run is public at `/security`.

- **Plan:** approved 2026-10-23.
- **Decision record:** `docs/adr/0048-security-evaluation-suite.md`.
- **Branch:** `feat/security-evals`, from `main`.

## 2026-10-23

### Done

**The registry** (`src/core/security-eval/catalog.ts`):
- the 20 OWASP risks with their titles and sources. The LLM 2025 titles were checked on genai.owasp.org today; the agentic list was published 9 December 2025;
- 23 scenarios, with the risks each covers and what each asserts;
- per risk, what isn't tested, or why it doesn't apply (LLM08: no retrieval or embeddings);
- coverage is only ever tested, not tested or not applicable.

**The scenarios** (`tests/security-eval/`, 35 tests):
- **Goal hijack** (SE-001 to SE-003):
  - planted README instructions;
  - instructions in command output;
  - "the contract allows this" text.

  A scripted model obeys each one, and nothing gets past the contract or a person.
- **Tool misuse** (SE-004 to SE-007):
  - traversal, absolute, device and junction paths;
  - risky commands in every mode;
  - shell syntax in program names and cmd.exe arguments;
  - `--ignore-scripts` on installs;
  - the sandbox guard without isolation, for viewers and for others' sessions.
- **Privilege** (SE-008, SE-009):
  - an approval reused for another payload, version or time;
  - the agent loop refusing a mismatched answer;
  - sensitive files escalating even with autonomy on.
- **Supply chain** (SE-010, SE-011):
  - changed or new project skills held back;
  - manifests and lockfiles in 17 forms escalating.
- **Trust** (SE-012, SE-013):
  - "verified" only from real exit codes;
  - forged ProofPacks and receipts failing their digest.
- **Disclosure and output** (SE-014 to SE-017):
  - secrets refused on import and in agent writes;
  - commands getting allowlisted environment names only;
  - no environment values in the prompts, checked with planted ones;
  - redaction in run events;
  - AI suggestions and drafts kept within their schema and the contract.
- **Consumption** (SE-018, SE-019):
  - the gateway refusing a step past the cap before charging;
  - the loop stopping at its step limit and when cancelled.
- **Database** (SE-020 to SE-023, PGlite with every migration):
  - workspaces kept apart;
  - one-time pairing codes and instant revocation;
  - the AI switch stopping every workspace;
  - autonomy pausing after a failed or partly failed check;
  - one verification at a time.

**The registry test:**
- one `describe` per scenario, in its declared file;
- no unregistered IDs;
- every risk tested or explained;
- no words of completeness or certification;
- the committed report's fingerprint matches the suite.

**The report:** `pnpm security:eval` (`scripts/security-eval.mjs`) runs the scenarios and writes `src/content/security-eval-run.json` with:
- when it ran;
- the commit;
- Node's version;
- the suite's SHA-256 fingerprint;
- each scenario's result.

**The page** `/security`:
- the run stamp;
- the risk map, two grids of 10 with icon, words and pattern per state;
- each risk's scenarios with results and what isn't tested;
- what the suite is and isn't.

The footer links to it.

**Found along the way:** two Windows flakes, both fixed.
- **The agent's file writes:** on Windows, a rename can fail for a moment while antivirus or the indexer holds a just-written file. `ProjectFolder.write` now retries the rename up to five times on EPERM, EACCES or EBUSY, on Windows only. This affects desktop-agent users too.
- **The executor test's cleanup** could overlap the run's own folder removal. Both removals now retry.

### Verified

- **The suite:** 23 of 23 scenarios pass (35 tests).
- **Guard removal:** three guards were removed by hand, one at a time, then restored from git:
  - the contract path check in `decide`;
  - the environment allowlist in `commandEnv`;
  - the run-cap check in `callModel`.

  SE-001, SE-003, SE-015 and SE-018 each failed while their guard was gone.
- **The full suite:** `pnpm typecheck` and `pnpm lint` are clean. `pnpm test`: 1,271 passed, 14 skipped.
- **The runtime and executor tests** ran clean four times in a row after the Windows fixes. Before them, one test in about five runs failed under load.
- **In the browser,** on a production build, `/security`:
  - prerendered as a static page;
  - one h1, a main landmark, 20 tiles and 20 detail cards;
  - LLM08 shown as not applicable;
  - at 1280px, five tiles per row;
  - at 375px, two per row, nothing scrolls sideways, and every link is at least 44px tall.

### Next

- Scenarios for LLM04 beyond skill pins, and for ASI07 over the agent API (as HTTP rather than in the database).
- Model-level evaluations of injection resistance, which need real model calls and a budget.
- Signing the run report.
