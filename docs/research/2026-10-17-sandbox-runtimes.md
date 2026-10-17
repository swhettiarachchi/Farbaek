# Sandbox runtimes: research notes (2026-10-17)

Checked for ADR 0013. Facts below come from the sources listed; anything from secondary sources is marked.

## E2B runtime and Embed

- The E2B runtime (github.com/e2b-dev/runtime) is the open-source backend behind E2B Cloud, Apache-2.0. Components: control-plane API, per-node orchestrator running Firecracker VMs, envd (the in-VM process, filesystem and port agent), client proxy (edge router for sandbox URLs), template builder. Data stores: PostgreSQL, Redis, ClickHouse, object storage. It needs Linux with KVM.
- **E2B Embed** runs the whole stack on one machine: Docker Compose on a Linux host with hardware virtualization, Terraform modules for GCP, AWS and Azure, or a Kubernetes manifest. Same SDK and API as E2B Cloud. Plain HTTP, no TLS of its own; meant to sit inside a private network. One machine by design. The README doesn't call it production or evaluation; for scale it points to private cloud, BYOC or E2B Cloud.
- The larger self-hosted path (e2b-dev/infra) uses Terraform, Packer, Nomad and Consul; GCP is the most mature, AWS needs bare-metal or nested virtualization. Secondary sources describe it as a substantial infrastructure project.
- BYOC (sandboxes in your own cloud account) is an E2B Enterprise offering, not self-hosting.

## E2B SDK (pinned: e2b 2.51.0, published 2026-09-18)

Read from the installed type definitions:
- `Sandbox.create(template, { apiKey, domain, apiUrl, timeoutMs, metadata, envs, network })`; `network.allowOut` / `denyOut` take IPs, CIDRs and (allow only) domains; allow rules take precedence over deny rules; `allowPublicTraffic: false` requires the `e2b-traffic-access-token` header for sandbox URLs; `sandbox.trafficAccessToken` holds it.
- Domain filtering works for HTTP (Host) and HTTPS (SNI) on ports 80 and 443; other ports use CIDR rules only. When domains are used, 8.8.8.8 is allowed for DNS.
- From 2.51.0, every sandbox uses secured envd access (the `secure` option is ignored).
- `commands.run(cmd, { background: true, timeoutMs, onStdout, onStderr })` returns a handle with `pid` and `wait()`; `wait()` throws `CommandExitError` for non-zero exits and `TimeoutError` at the deadline; `commands.kill(pid)` sends SIGKILL.
- `Sandbox.kill`, `Sandbox.getInfo` (state, cpuCount, memoryMB), `Sandbox.getMetrics` (cpuUsedPct, memUsed, diskUsed, sampled every 5 s), `Sandbox.pause`, `Sandbox.connect` (resumes a paused sandbox), `Sandbox.list({ query: { metadata } })`.
- Template builds set `cpuCount` and `memoryMB`; disk is `minFreeDiskMb`, best effort.
- Sandbox lifetime: up to 1 hour on E2B Cloud Hobby and 24 hours on Pro (SDK docs).

## Firecracker and gVisor

- Firecracker needs KVM: bare metal, or a cloud VM with nested virtualization.
- gVisor (runsc) intercepts syscalls in a user-space kernel; its systrap platform doesn't need KVM. Running it well still means building container orchestration, an egress proxy and a file and process API, which E2B already provides.

## Pricing

E2B Cloud's per-second pricing and Vercel Sandbox's active-CPU pricing are in the master spec (section 7) with their sources. Self-hosting trades that for the cost of a KVM-capable host and the operations work; no cost savings are claimed here until measured.

## Sources

- https://raw.githubusercontent.com/e2b-dev/runtime/main/README.md
- https://raw.githubusercontent.com/e2b-dev/runtime/main/embed/README.md
- https://github.com/e2b-dev/infra/blob/main/self-host.md
- https://docs.e2b.dev/byoc
- https://docs.e2b.dev/sandbox/internet-access
- https://docs.e2b.dev/network/public-url.md
- https://docs.e2b.dev/network/restrict-public-access.md
- https://docs.e2b.dev/sandbox/secured-access.md
- https://docs.e2b.dev/sandbox/metrics.md
- https://docs.e2b.dev/template/base-image.md
- https://docs.e2b.dev/sdk-reference/js-sdk/v2.51.0/sandbox.md
- Secondary (operational effort, not relied on for facts): bex.co articles of 2026-09-13 and 2026-09-24 on self-hosting E2B.
