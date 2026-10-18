# 0004. Policy engine

- Status: accepted (interface); engine choice deferred
- Date: 2026-10-13

## Decision

Start with a typed TypeScript policy layer behind a `PolicyEngine` interface returning the six outcomes (`ALLOW`, `ALLOW_WITHIN_LIMITS`, `REQUIRE_APPROVAL`, `SIMULATE_FIRST`, `ESCALATE`, `BLOCK`, defined in `src/core/billing/usage.ts`). Policy versions are immutable and hashed with the same canonical JSON used for approvals.

Cedar (via its Wasm binding) or OPA/Rego replaces the TypeScript rules once policies need to be authored by customers. OpenFGA or SpiceDB comes only when sharing outgrows RBAC plus scopes.

## Version 1 (2026-10-13)

- `src/core/trust/policy.ts`: `evaluateChangePolicy` governs change proposals at autonomy level 0. Contract violations block. Dependencies, CI workflows, database migrations, infrastructure, and auth or security code escalate, as does a change to more than 10 files. Escalated means an owner or admin must approve. Anything else needs a contributor's approval. The rule set is data (`CHANGE_POLICY_RULES`), and its RFC 8785 hash is the policy version, stored with every decision.
- Each decision is one governed evaluation, recorded in `evaluation_events` in the same transaction as the proposal and refused once the plan's allowance is used up (migration 7). The database also refuses to apply an escalated proposal for anyone but an owner or admin.
- Autonomy levels 1 and 2 aren't offered yet. Nothing is allowed without a person.

## Already in place

- Deterministic contract checks (`checkActionAgainstContract`) run before any approval is offered.
- Approval binding to the canonical payload, contract, policy and resource versions.
