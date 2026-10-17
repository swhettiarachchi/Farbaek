# 0016. Vercel Sandbox as a sandbox runtime

- Status: accepted
- Date: 2026-10-17
- Extends ADR 0013 (sandbox runtime and control plane). E2B stays supported.

## Context

ADR 0013 put execution behind the `SandboxRuntime` interface, with E2B as the first adapter and self-hosted E2B as the target. No runtime was connected yet: E2B Cloud needs an account, and self-hosting needs a Linux host with KVM. The owner asked to use Vercel Sandbox.

Facts checked on 2026-10-17 (vercel.com/docs/sandbox, its pricing, firewall, authentication and SDK pages, and the `@vercel/sandbox` 3.5.1 type definitions):

- Each sandbox is a Firecracker microVM with its own kernel, on Vercel's infrastructure (default region `iad1`).
- Hobby is free and hard-capped: 5 Active CPU hours and 420 GB-hours of memory a month, 5,000 creations, 10 concurrent sandboxes, sessions up to 45 minutes. Past the allowance, creation pauses until the next cycle and nothing is charged. Pro bills usage after its monthly credit; sessions up to 24 hours.
- vCPUs are 1 or an even number, with 2 GB of memory each.
- A firewall per sandbox: `deny-all` (DNS included), or a user-defined allowlist of domains (matched by SNI for HTTPS) with denied CIDR ranges taking precedence. It can be changed while the sandbox runs.
- Exposed ports are served on public `*.vercel.run` addresses with no sign-in.
- Sandboxes are persistent by default (a snapshot on every stop); `persistent: false` discards the disk.
- Outside Vercel, the SDK authenticates with an access token plus a team ID and project ID. On Vercel, it uses the platform's OIDC token.

## Decision

- **Add a Vercel Sandbox adapter** (`src/server/sandbox/vercel-runtime.ts`) using the official SDK, pinned to `@vercel/sandbox` 3.5.1 (released 2026-09-28; the newer releases were days old). `SANDBOX_PROVIDER=vercel` selects it; `e2b` still selects E2B. Nothing else in the app changes.
- **Credentials**: `SANDBOX_VERCEL_TOKEN`, `SANDBOX_VERCEL_TEAM_ID`, `SANDBOX_VERCEL_PROJECT_ID`, server-only, entered through `pnpm setup:env` with the token hidden. Names are prefixed so they never collide with the Vercel CLI's own variables. On Vercel itself, the OIDC token is used when none of them is set.
- **Same guarantees as E2B**: no server environment passed in, the runtime timeout always set (capped at `SANDBOX_RUNTIME_MAX_SESSION_MINUTES`, 45 by default for Vercel), egress always explicit (`deny-all`, or the four registry hosts with private, link-local, loopback, CGNAT and multicast ranges denied), the project folder at `/home/user/project`, commands under the same `ulimit` wrapper, and Review Only until `pnpm sandbox:smoke` passes and `SANDBOX_ISOLATION_VERIFIED_AT` is set.
- **Process groups for cancel and timeouts**: each command runs under `setsid -w`, writes its group id to `/tmp/farbaek`, and a cancel or timeout signals the whole group. The numeric id fits the existing `pid` column, so the database is unchanged.
- **Off on Vercel, with the reason shown**:
  - Previews: ports would be public with no sign-in. Farbaek's gateway can't make an already-public address private, so no ports are exposed.
  - Pause and resume: these would rely on persistent snapshots, which count against Hobby's 15 GB lifetime snapshot storage.
  - Live metrics: the SDK doesn't report CPU and memory samples.
- **Images**: every template starts from Vercel's managed `vercel/sandbox/universal` image (Node.js LTS and Python 3). The size sets the vCPUs. There's nothing to build; `pnpm sandbox:templates` says so.

## Consequences

- Project code runs on Vercel's infrastructure in the US by default (`SANDBOX_VERCEL_REGION` changes it). Fully self-hosted execution still means E2B Embed.
- A Vercel access token isn't limited to sandboxes: it can manage the account's other projects. Use a Vercel account kept only for Farbaek sandboxes, give the token an expiry, and keep it server-side.
- Vercel's domain allowlist matches the TLS SNI, so a client could send an allowed SNI with a different `Host` header (domain fronting) to another site on the same CDN, if that CDN accepts it. This is documented as a residual risk for the "package registries" profile; "no network" is `deny-all`.
- Template labels now say "Node.js LTS and npm" and "Python 3 and pip", which hold on both runtimes, and the Python commands use `python3`.
- Not yet run against a real Vercel account: the adapter is tested against a fake SDK. The smoke test is the first live check.
