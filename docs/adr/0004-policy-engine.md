# 0004. Policy engine

- Status: accepted (interface); engine choice deferred
- Date: 2026-10-13

## Decision

Start with a typed TypeScript policy layer behind a `PolicyEngine` interface returning the six outcomes (`ALLOW`, `ALLOW_WITHIN_LIMITS`, `REQUIRE_APPROVAL`, `SIMULATE_FIRST`, `ESCALATE`, `BLOCK`, defined in `src/core/billing/usage.ts`). Policy versions are immutable and hashed with the same canonical JSON used for approvals.

Cedar (via its Wasm binding) or OPA/Rego replaces the TypeScript rules once policies need to be authored by customers. OpenFGA or SpiceDB comes only when sharing outgrows RBAC plus scopes.

## Already in place

- Deterministic contract checks (`checkActionAgainstContract`) run before any approval is offered.
- Approval binding to the canonical payload, contract, policy and resource versions.
