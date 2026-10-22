# Stage 12: Portable Proof and Eject Anytime

The spec's innovation backlog (§25) lists "Portable Proof" and "Eject Anytime" as MVP items. Both build on evidence Farbaek already records.

- **Plan:** approved 2026-10-22.
- **Decision record:** `docs/adr/0039-portable-proof-and-eject.md`.
- **Branch:** `feat/portable-proof`, from `feat/mesh-nearby`.

## 2026-10-22

### Done

**`/verify`**, a public page:
- drop or paste a ProofPack, recovery receipt, check receipt, security report or Workspace Capsule;
- it's checked in the browser, nothing is uploaded, and the result says in words whether it's intact;
- it shows what the record says: status, task, contract, approval, files with their SHA-256, checks with exit codes, linked evidence and the record's own limits;
- **Match a file** proves a file is exactly the content approved;
- the Seal forms for an intact, verified ProofPack or Capsule;
- samples are labelled, and `/verify/sample.json` gives visitors a sample to try;
- it's linked from the footer, the homepage's evidence section and the app's ProofPack download.

**Export everything** on the project page (`/app/projects/<id>/export`):
- the project's files plus `.farbaek/`: README (how to build it elsewhere, read by the Launch Planner), project, tasks with transitions, contracts, ProofPacks, recovery and check receipts, file history, and an index;
- every evidence file checks on `/verify`.

**Code:**
- `src/core/proof/inspect.ts` and `src/core/workspace/export.ts`, both pure and tested;
- `src/components/verify/evidence-check.tsx`.

### Verified

- `inspect.test.ts` (5 tests): real statements built by the existing builders are intact; one changed value is caught; a wrong digest is caught; file matching works; non-evidence is refused in words.
- `export.test.ts` (4 tests): the layout; every exported evidence file re-checks as intact; the README's build steps come from the project; truncated history is flagged; a project's own `.farbaek` folder is kept.

### Next

- Signing statements (ADR 0012), then checking signatures on `/verify`.
- A GitHub status check for ProofPacks.
