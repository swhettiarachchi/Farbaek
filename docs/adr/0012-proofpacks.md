# 0012. ProofPacks as in-toto statements, append-only and hash-chained

- Status: accepted
- Date: 2026-10-13

## Context

The spec's evidence section asks for an evidence receipt per change. It must cover what was approved, the policy decision, the intended change and the actual result, the checks with real exit codes, and the record's own limits. The format is in-toto attestation statements with a Farbaek predicate, optionally signed later, with successive receipts hash-linked. Verification states stay separate, and the Seal is only for verified evidence.

## Decision

- **Format:** an in-toto Statement v1 (`src/core/proof/proofpack.ts`). The subjects are the paths and SHA-256 digests of the exact file contents applied. The predicate type is `https://farbaek.dev/proofpack/v1`. That URI is a placeholder until Farbaek has an owned domain, and it must be replaced before any signing.
- **Predicate contents:**
  - the task, the approved contract (version and hash), the proposal (id, hash, model) and the policy decision (outcome, findings, rule-set hash);
  - the approval: who approved, when, and the applied-content hash;
  - each change with its base revision;
  - the contract's required checks, with real exit codes or "not run";
  - the execution mode, and limits written out in words;
  - the previous ProofPack's digest.
- **Digest:** the RFC 8785 canonical SHA-256 of the statement. The task page recomputes it on every load and says "Record intact" or "changed after it was made".
- **Status from real results only:** a ProofPack is unverified when no check ran, partially verified, failed, or verified only when every required check ran and passed. In Review Only every ProofPack is unverified, and its limits say why. The Seal is drawn only for a verified, intact ProofPack.
- **Storage:** the `proofpacks` table (migration 8) is append-only. A trigger refuses every update, including the server's. Rows leave only with their task, project or organization. The ProofPack is written by `app_apply_proposal` in the same transaction as the file revisions and task transitions. The database checks that the statement names this proposal, this applied-content hash and one subject per file, with a matching status. It also enforces the per-project hash chain under the project lock.
- **Export:** `/app/proofpacks/<digest>` returns the JSON to workspace members only, read through Row Level Security.

## Consequences

- Signing (Sigstore/cosign or an organization key) and a public verify page are later steps. Until then, the digest proves the integrity of the stored record, not who produced it.
- When a sandbox runner exists, it records a new ProofPack with real exit codes for a task in verification. That ProofPack links to the earlier one, which can't be changed.
- Evidence can't be edited to correct a mistake. A correction is a new ProofPack that links back to the one it supersedes.
