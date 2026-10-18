# 0018. Farbaek Agent: a desktop runtime that hands its work to the proposal pipeline

- Status: accepted
- Date: 2026-10-18

## Context

Spec §7 and Stage 4 ask for Farbaek's own agent runtime: a bounded tool loop, a typed tool registry, permission modes, real filesystem boundaries, a command broker that kills whole process trees, provider keys in the OS keychain, cancel and restart without silent resumption, honest labels ("a normal child process is not a sandbox"), and a desktop companion with installer scripts.

Farbaek already had a trust pipeline for changes: contract checks, policy, per-chunk review, hash-bound apply, checks on Vercel Sandbox, ProofPacks and recovery. The dev PC has 3.8 GB of RAM, no Rust and no MSVC build tools.

## Decision

- **Electron, not Tauri.** Tauri needs Rust and the MSVC build tools (several GB, system-wide). Electron ships prebuilt binaries, reuses the repository's TypeScript (`src/core`, the Anthropic SDK, Zod) and encrypts secrets with `safeStorage` (DPAPI, Keychain, libsecret or KWallet) without native modules. Pinned: `electron` 43.7.7, `electron-builder` 26.17.0, `esbuild` 0.28.2. Only Electron's own install script runs (it downloads the binary).
- **The agent's work lands as an ordinary change proposal.** There is no second apply path. The server re-screens every file, re-checks base revisions, runs `checkProposal` and `evaluateChangePolicy`, computes `proposalHash`, and creates the proposal through `app_create_proposal`, wrapped by `app_create_agent_proposal` (migration 14) which tags the agent in the same transaction. Everything after that is the existing pipeline. It counts as a governed evaluation; no Farbaek AI credits are used, since the person's own key paid.
- **Pairing with a one-time code; an agent acts for the person who paired it.** A contributor creates a 10-character code (50 bits, 10 minutes, single use, rate-limited redemption). The app redeems it for an `fa_` token (32 random bytes). Farbaek stores only SHA-256 hashes of both. Every request resolves the token to the person's current role: membership for reads, contributor for proposals. The plan's agent limit is checked under a lock when a code is created and again when it's redeemed. Owners and admins revoke any agent; the person who paired one can revoke it, including from the app.
- **Farbaek's own manual tool loop**, not the SDK tool runner, so every call passes the registry (Zod), the permission engine and, when asked, a person's approval bound to the exact command by `approvalBindingHash`, before anything runs. Claude (`claude-opus-5-5`, adaptive thinking, streamed, eager input streaming with Zod validation, automatic prompt caching) and Gemini (REST function calling, content kept unchanged for thought signatures) sit behind one `ToolModel` interface. A reply cut off at `max_tokens` never runs its calls; a refusal ends the run.
- **Modes, enforced in code** (`src/core/agent/permissions.ts`):
  - Review Only: the agent reads and builds a patch in memory. Nothing on disk changes and no command runs.
  - Controlled Development: it edits the run's copy on disk, with a checkpoint before each write. Read-only commands run; tests, builds, installs, network and destructive commands each wait for an approval of that exact command. Labelled "Runs on this computer, not isolated".
  - Sandboxed Autopilot: shown, and unavailable with the reason, until the desktop agent can run commands in a Farbaek sandbox. The engine already refuses it without a verified sandbox.
- **Local boundaries.** The folder guard fixes the root with `realpath`, walks each name with `lstat`, refuses symlinks, junctions and multi-link files, checks the opened handle's identity, and writes through an exclusive temporary file and a rename. The broker takes a program and arguments (no shell), resolves the program to an absolute path while skipping relative and in-project PATH entries, passes an allowlisted environment, refuses cmd.exe metacharacters for `.cmd`/`.bat` shims, bounds output and kills the whole process tree on timeout or cancel.
- **A locked-down window.** Context isolation, the Chromium sandbox, no Node integration, a strict CSP, every network request from the page cancelled, no navigation, new windows, webviews or permissions, and a narrow preload bridge whose every call the main process validates with Zod and accepts only from its own page.

## Consequences

- One task model and one review path: an agent's change is reviewed, applied, verified on Vercel and undone exactly like one made in the web app, and the task page says it was proposed by Farbaek Agent.
- Runs are bound by steps, tokens and wall-clock time, and a run that was working when the app closed comes back as interrupted; the person starts it again on a fresh copy or discards it.
- Installers are unsigned until the owner has a Windows Authenticode certificate and an Apple Developer ID (with notarization), so SmartScreen and Gatekeeper warn.
- Known limits: on Windows, a folder swapped for a junction between the parent check and the rename is a remaining window (POSIX uses `O_NOFOLLOW`); Windows has no job objects in Node, so a background process that outlives its parent is reported ("may still be running") rather than guaranteed killed; local commands run with the person's own rights.
