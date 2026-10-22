# ADR 0039: Portable Proof and Eject Anytime

- Status: accepted (2026-10-22).
- Spec: §25, the innovation backlog's MVP items "Portable Proof" and "Eject Anytime".

## Context

Farbaek's evidence is already portable in form:
- ProofPacks, recovery receipts, sandbox check receipts and security reports are in-toto statements;
- each statement's digest is the SHA-256 of its RFC 8785 canonical JSON (`canonicalHash`, `src/core/trust/canonical-json.ts`);
- Workspace Capsules do the same with BLAKE3 (ADR 0037).

In practice, though, two things were missing:
- evidence could only be checked inside a workspace;
- a project's download held its files and nothing else.

The spec asks for two things:
- **Portable Proof:** a public page that checks evidence without exposing code;
- **Eject Anytime:** a one-tap export of code, contracts, ProofPacks and history, with nothing depending on Farbaek.

Statements are not signed yet. ADR 0012 waits for an owned predicate domain and key management.

## Decision

### `/verify`: a public page that checks evidence in the browser

- **Reading the file.** Anyone can drop or paste:
  - a ProofPack, recovery receipt, check receipt or security report: the `{ digest, status, statement }` JSON Farbaek downloads, or a bare statement plus a digest;
  - a Workspace Capsule.
- **Pure logic.** `inspectEvidence` (`src/core/proof/inspect.ts`):
  - identifies the kind by `predicateType`;
  - recomputes the canonical SHA-256 and compares it with the digest;
  - reads a typed summary per kind: status, task, contract, approval, files with their SHA-256, checks with exit codes, linked evidence, and the record's own limits;
  - refuses, in words, anything that isn't Farbaek evidence or is missing parts Farbaek always records.
- **Capsules** go through `openCapsule`, the same checks as the Mesh page.
- **Match a file.** The visitor drops a file; its SHA-256 is compared with the files a record lists. That shows a file is exactly the content that was approved.
- **Nothing leaves the browser.** Web Crypto and the shared core do the work; the page makes no request with the visitor's files.
- **The Seal** forms only for an intact, verified ProofPack or an intact Capsule.
- **Samples.** Statements marked `sample: true` are labelled "Sample data", and the Seal says "Sample ProofPack". `/verify/sample.json` is a sample built by the real ProofPack builder from the homepage's sample data. Its first limit says it records no real project.
- **The page says plainly what a match means:** the record is unchanged since Farbaek recorded it. It does not say who recorded it: signatures come later.

### Export everything: `/app/projects/<id>/export`

The download holds the project's files at the root, as in the plain download, and a `.farbaek/` folder. If the project has its own `.farbaek` folder, the export uses `.farbaek-export/` instead.

| File | Contents |
| --- | --- |
| `README.md` | How to build it elsewhere: install, build, start and output, read by the Launch Planner (ADR 0033); the setting names it reads, never values; how to check the evidence |
| `project.json` | Name, description, dates, counts, format `farbaek.export/1` |
| `tasks/<id>/task.json` | Title, state, every transition, with actor kind and time |
| `tasks/<id>/contract.json` | The latest contract, with its SHA-256 and status |
| `tasks/<id>/proofpacks/`, `recoveries/`, `checks/` | Each record in the shape `/verify` checks |
| `history.json` | File changes, oldest first, up to 500, flagged when there may be more |
| `index.json` | Every evidence file with its kind, digest and path |

- **Building it:** `buildExport` (`src/core/workspace/export.ts`) is pure and unit tested. The route reads through RLS like the download: members only, every billing state.
- **People:** no names or emails, only the actor ids already inside the records.

## Consequences

- Anyone a ProofPack is sent to can check it without an account. A project can leave Farbaek with its whole history and evidence, and every evidence file in the export checks as intact on its own (`export.test.ts`).
- **What `/verify` can't prove yet:** who recorded a statement. When statements are signed (ADR 0012), the same page checks the signature, and the copy changes.
- **Still to come:**
  - a GitHub status check ("Farbaek ProofPack: verified");
  - linked evidence that can be followed from the page, which today shows digests only, since nothing is fetched;
  - an export with no limit on file history.
