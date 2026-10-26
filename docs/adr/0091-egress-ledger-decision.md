# ADR 0091: The sandbox egress ledger, as far as the provider allows

- Status: accepted (2026-10-26).
- Spec §25 "Sandbox Egress Ledger (Next)":
  - **The need:** "A per-run record of the domains contacted (allowed or blocked) included in the ProofPack, using provider egress controls where available … or a proxy."
  - **Acceptance:** "blocked domains appear in the ProofPack; no unlisted egress succeeds in deny-all mode."
- Builds on ADR 0013 and ADR 0016 (sandbox runtime), and `src/core/sandbox/network.ts`.

## Context

Farbaek's sandboxes already deny network access by default.
- **The profiles:** a session has no network, or only the package registries and Google Fonts.
- **Where it's enforced:** Vercel Sandbox's firewall, on the host outside the microVM (`networkPolicyFor`): deny-all, including DNS, or an allowlist matched by TLS SNI.
- **What every run records:** each sandbox receipt records the exact egress rules the run had (`runtime.egress`).
- **What's proven live:** `pnpm sandbox:smoke` checks that a no-network sandbox can't reach the internet or cloud metadata.

What the provider offers, from Vercel's firewall documentation, last updated 2026-09-16:
- **No record of blocked attempts.** The firewall decides access by policy, but there's no per-sandbox log or API of blocked connections, nor of allowed ones.
- **Request proxying** (`forwardURL`) can send an allowed domain's requests to a proxy we run, with an OIDC token naming the sandbox.
  - This could record allowed traffic.
  - It only covers domains that are allowed, never blocked attempts.
  - It means terminating TLS for those domains.

## Decision

**Don't build a ledger that would claim more than it knows.**
- **Blocked attempts can't be listed truthfully.** The provider doesn't report them. Reading them from inside the sandbox would mean trusting the code we're containing.
- **"No unlisted egress succeeds in deny-all mode" already holds.** The provider enforces it outside the microVM, `sandbox:smoke` checks it, and each receipt names the policy.

**Not now: logging allowed traffic through a forwarding proxy.** Every package install (often hundreds of megabytes) would pass through Farbaek's own server, a 2-core VPS. If it's needed, the proxy should run next to the sandboxes, for example as a Vercel Function with `defineSandboxProxy` in the sandbox project. That needs the owner's Vercel account.

**What evidence says today:** receipts and the ProofPack inspector show the policy a run had, in words:
- "No network"; or
- "Only these hosts: …, everything else denied by the provider's firewall".

They never show a contact list.

## Consequences

- The spec item stays open until the provider exposes firewall decisions, or a proxy runs next to the sandboxes.
- If Vercel adds a firewall log, the ledger becomes a receipt field filled from it, with no other change to the evidence chain.
